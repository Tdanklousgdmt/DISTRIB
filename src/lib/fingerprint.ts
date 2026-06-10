import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { prisma } from "@/lib/prisma";
import { setPendingClaimOnchain } from "@/lib/blockchain";

const execFileAsync = promisify(execFile);

// ─────────────────────────────────────────────────────────────────────────────
// Empreinte acoustique Chromaprint (Sprint 5).
//
// Chaque upload audio passe par `fpcalc` (binaire Chromaprint). L'empreinte
// est stockée en binaire compact (Int32Array → bytea) puis comparée à toutes
// les empreintes existantes : une similarité ≥ SEUIL sur un projet tiers crée
// un Claim et bloque la publication du NOUVEL upload (pas de l'original).
//
// Si fpcalc n'est pas installé sur la machine, tout ceci est un no-op silencieux
// — l'upload reste protégé par hash + S3, l'empreinte sera calculable plus tard.
// ─────────────────────────────────────────────────────────────────────────────

const SIMILARITY_THRESHOLD = 0.85;
/** Décalages testés (en frames ~0,12 s) pour tolérer une intro coupée. */
const MAX_OFFSET = 40;

const AUDIO_EXTENSIONS = new Set(["wav", "mp3", "flac", "m4a", "aac", "ogg", "aiff", "aif"]);

export function isAudioFile(filename: string, mimeType: string | null): boolean {
  if (mimeType?.startsWith("audio/")) return true;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_EXTENSIONS.has(ext);
}

let fpcalcAvailable: boolean | null = null;

async function hasFpcalc(): Promise<boolean> {
  if (fpcalcAvailable !== null) return fpcalcAvailable;
  try {
    await execFileAsync("fpcalc", ["-version"]);
    fpcalcAvailable = true;
  } catch {
    fpcalcAvailable = false;
    console.warn("[fingerprint] fpcalc introuvable — empreintes désactivées.");
  }
  return fpcalcAvailable;
}

/** Calcule l'empreinte Chromaprint brute d'un buffer audio. */
export async function computeChromaprint(
  audio: Buffer,
  filename: string,
): Promise<{ fingerprint: Int32Array; durationMs: number } | null> {
  if (!(await hasFpcalc())) return null;

  const dir = await mkdtemp(join(tmpdir(), "distrib-fp-"));
  const path = join(dir, filename.replace(/[^\w.\-]+/g, "_"));
  try {
    await writeFile(path, audio);
    const { stdout } = await execFileAsync(
      "fpcalc",
      ["-raw", "-json", "-length", "120", path],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout) as { duration: number; fingerprint: number[] };
    if (!Array.isArray(parsed.fingerprint) || parsed.fingerprint.length === 0) {
      return null;
    }
    return {
      fingerprint: Int32Array.from(parsed.fingerprint),
      durationMs: Math.round(parsed.duration * 1000),
    };
  } catch (e) {
    console.error("[fingerprint] fpcalc a échoué :", e);
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function toBuffer(fp: Int32Array): Uint8Array<ArrayBuffer> {
  // Copie dans un ArrayBuffer dédié — satisfait le type bytea de Prisma.
  return new Uint8Array(fp.slice().buffer);
}

function fromBuffer(buf: Buffer | Uint8Array): Int32Array {
  const b = Buffer.from(buf);
  return new Int32Array(b.buffer, b.byteOffset, Math.floor(b.byteLength / 4));
}

function popcount(x: number): number {
  x -= (x >> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >> 24;
}

/**
 * Similarité entre deux empreintes : 1 − taux d'erreur binaire, calculée sur
 * le meilleur alignement parmi ±MAX_OFFSET frames. 1.0 = identique.
 */
export function chromaprintSimilarity(a: Int32Array, b: Int32Array): number {
  let best = 0;
  for (let offset = -MAX_OFFSET; offset <= MAX_OFFSET; offset++) {
    const aStart = Math.max(0, offset);
    const bStart = Math.max(0, -offset);
    const overlap = Math.min(a.length - aStart, b.length - bStart);
    if (overlap < 16) continue; // moins de ~2 s de recouvrement : ignorer

    let errorBits = 0;
    for (let i = 0; i < overlap; i++) {
      errorBits += popcount(a[aStart + i] ^ b[bStart + i]);
    }
    const score = 1 - errorBits / (overlap * 32);
    if (score > best) best = score;
  }
  return best;
}

/**
 * Pipeline post-upload : calcule l'empreinte, la stocke, cherche des
 * correspondances internes et crée les Claims. Ne lève JAMAIS (best-effort,
 * exécuté hors du chemin de réponse HTTP).
 */
export async function processUploadedAudio(vaultFileId: string, audio: Buffer) {
  try {
    const file = await prisma.vaultFile.findUnique({
      where: { id: vaultFileId },
      include: { version: { select: { projectId: true } }, fingerprint: true },
    });
    if (!file || file.fingerprint) return;
    if (!isAudioFile(file.filename, file.mimeType)) return;

    const computed = await computeChromaprint(audio, file.filename);
    if (!computed) return;

    await prisma.$transaction([
      prisma.fingerprint.create({
        data: {
          vaultFileId,
          chromaprint: toBuffer(computed.fingerprint),
          durationMs: computed.durationMs,
        },
      }),
      prisma.vaultFile.update({
        where: { id: vaultFileId },
        data: { fingerprintComputedAt: new Date() },
      }),
    ]);

    await detectInternalMatches(vaultFileId, computed.fingerprint, file.version.projectId);
  } catch (e) {
    console.error("[fingerprint] pipeline post-upload échoué :", e);
  }
}

/** Compare l'empreinte aux fichiers des AUTRES projets ; crée les Claims. */
async function detectInternalMatches(
  vaultFileId: string,
  fingerprint: Int32Array,
  projectId: string,
) {
  const others = await prisma.fingerprint.findMany({
    where: {
      vaultFileId: { not: vaultFileId },
      vaultFile: { version: { projectId: { not: projectId } } },
    },
    include: {
      vaultFile: {
        include: {
          version: { include: { project: { select: { id: true, ownerId: true, title: true } } } },
        },
      },
    },
  });

  for (const other of others) {
    const score = chromaprintSimilarity(fingerprint, fromBuffer(other.chromaprint));
    if (score < SIMILARITY_THRESHOLD) continue;

    // L'original est le fichier le plus ANCIEN ; le nouvel upload est claimant.
    const newFile = await prisma.vaultFile.findUniqueOrThrow({
      where: { id: vaultFileId },
      include: {
        version: { include: { project: { select: { id: true, ownerId: true, title: true } } } },
      },
    });
    const newIsClaimant = newFile.uploadedAt >= other.vaultFile.uploadedAt;
    const targetFile = newIsClaimant ? other.vaultFile : newFile;
    const claimantFile = newIsClaimant ? newFile : other.vaultFile;

    // Dédoublonnage : un seul claim par paire de fichiers.
    const existing = await prisma.claim.findFirst({
      where: { targetFileId: targetFile.id, claimantFileId: claimantFile.id },
    });
    if (existing) continue;

    const claimantProject = claimantFile.version.project;
    const txHash = await setPendingClaimOnchain(claimantProject.id);

    await prisma.$transaction([
      prisma.claim.create({
        data: {
          targetFileId: targetFile.id,
          claimantFileId: claimantFile.id,
          similarityScore: Math.round(score * 10000) / 10000,
          onchainPendingClaimTx: txHash,
        },
      }),
      // La publication du projet CLAIMANT est bloquée jusqu'à résolution.
      prisma.project.update({
        where: { id: claimantProject.id },
        data: {
          canPublish: false,
          publishBlockedReason: "Correspondance détectée avec une œuvre antérieure du vault",
        },
      }),
      // Les deux parties sont prévenues.
      prisma.notification.create({
        data: {
          userId: targetFile.version.project.ownerId,
          type: "CLAIM_DETECTED",
          payload: {
            role: "target",
            projectId: targetFile.version.project.id,
            projectTitle: targetFile.version.project.title,
            similarity: score.toFixed(4),
          },
        },
      }),
      prisma.notification.create({
        data: {
          userId: claimantProject.ownerId,
          type: "CLAIM_DETECTED",
          payload: {
            role: "claimant",
            projectId: claimantProject.id,
            projectTitle: claimantProject.title,
            similarity: score.toFixed(4),
          },
        },
      }),
    ]);
  }
}
