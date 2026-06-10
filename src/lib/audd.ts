import "server-only";

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { prisma } from "@/lib/prisma";
import { auddConfigured, optionalEnv, requireEnv, s3Configured } from "@/lib/env";

// ─────────────────────────────────────────────────────────────────────────────
// Scan externe AudD (Sprint 5) — Spotify / Apple Music / YouTube / Deezer…
//
// AudD reconnaît un extrait audio et renvoie les correspondances sur les DSP.
// Quota gratuit : 500 requêtes/mois → le cron scanne en priorité les fichiers
// jamais scannés, puis les plus anciens scans. No-op sans AUDD_API_TOKEN.
// ─────────────────────────────────────────────────────────────────────────────

interface AuddPlatformResult {
  platform: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  url: string | null;
  isrc: string | null;
}

/** Soumet l'URL (présignée S3) d'un fichier à AudD ; renvoie les matches DSP. */
export async function recognizeFromUrl(audioUrl: string): Promise<{
  matches: AuddPlatformResult[];
  raw: unknown;
} | null> {
  if (!auddConfigured()) return null;
  try {
    const body = new URLSearchParams({
      api_token: optionalEnv("AUDD_API_TOKEN")!,
      url: audioUrl,
      return: "spotify,apple_music,deezer",
    });
    const res = await fetch("https://api.audd.io/", { method: "POST", body });
    if (!res.ok) throw new Error(`AudD → ${res.status}`);
    const json = (await res.json()) as {
      status: string;
      result: null | {
        title?: string;
        artist?: string;
        album?: string;
        isrc?: string;
        song_link?: string;
        spotify?: { external_urls?: { spotify?: string }; name?: string };
        apple_music?: { url?: string };
        deezer?: { link?: string };
      };
    };
    if (json.status !== "success") throw new Error(`AudD status ${json.status}`);
    if (!json.result) return { matches: [], raw: json };

    const r = json.result;
    const base = {
      title: r.title ?? null,
      artist: r.artist ?? null,
      album: r.album ?? null,
      isrc: r.isrc ?? null,
    };
    const matches: AuddPlatformResult[] = [];
    if (r.spotify?.external_urls?.spotify) {
      matches.push({ platform: "spotify", url: r.spotify.external_urls.spotify, ...base });
    }
    if (r.apple_music?.url) {
      matches.push({ platform: "apple_music", url: r.apple_music.url, ...base });
    }
    if (r.deezer?.link) {
      matches.push({ platform: "deezer", url: r.deezer.link, ...base });
    }
    if (matches.length === 0 && r.song_link) {
      matches.push({ platform: "unknown", url: r.song_link, ...base });
    }
    return { matches, raw: json };
  } catch (e) {
    console.error("[audd] reconnaissance échouée :", e);
    return null;
  }
}

/**
 * Scanne jusqu'à `limit` fichiers audio du vault (versions courantes d'abord),
 * stocke les ExternalMatch et notifie les propriétaires. Renvoie le nb scanné.
 */
export async function scanVaultBatch(limit = 10): Promise<number> {
  if (!auddConfigured() || !s3Configured()) return 0;

  const s3 = new S3Client({
    region: requireEnv("AWS_REGION"),
    credentials: {
      accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
    },
  });

  // Fichiers audio avec empreinte, jamais scannés en priorité.
  const files = await prisma.vaultFile.findMany({
    where: {
      fingerprintComputedAt: { not: null },
      version: { isCurrent: true },
    },
    orderBy: { uploadedAt: "asc" },
    take: limit,
    include: {
      externalMatches: { select: { id: true }, take: 1 },
      version: { include: { project: { select: { ownerId: true, title: true } } } },
    },
  });
  const toScan = files.filter((f) => f.externalMatches.length === 0);

  let scanned = 0;
  for (const file of toScan) {
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: file.s3Bucket, Key: file.s3Key }),
      { expiresIn: 600 },
    );
    const result = await recognizeFromUrl(url);
    if (!result) continue;
    scanned++;

    for (const m of result.matches) {
      await prisma.externalMatch.upsert({
        where: {
          vaultFileId_platform_externalUrl: {
            vaultFileId: file.id,
            platform: m.platform,
            externalUrl: m.url ?? "",
          },
        },
        update: { reviewedAt: null },
        create: {
          vaultFileId: file.id,
          platform: m.platform,
          title: m.title,
          artist: m.artist,
          album: m.album,
          externalUrl: m.url,
          isrc: m.isrc,
          raw: JSON.parse(JSON.stringify(result.raw)),
        },
      });
    }

    if (result.matches.length > 0) {
      await prisma.notification.create({
        data: {
          userId: file.version.project.ownerId,
          type: "CLAIM_DETECTED",
          payload: {
            role: "external",
            filename: file.filename,
            projectTitle: file.version.project.title,
            platforms: result.matches.map((m) => m.platform).join(", "),
          },
        },
      });
    }
  }
  return scanned;
}
