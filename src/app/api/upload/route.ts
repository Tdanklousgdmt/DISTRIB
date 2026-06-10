import { NextResponse, after } from "next/server";

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/session";
import { sha256 } from "@/lib/hash";
import { putVaultObject, vaultKey, s3Configured } from "@/lib/s3";
import { anchorFileHash } from "@/lib/blockchain";
import { processUploadedAudio } from "@/lib/fingerprint";
import { uploadMetadataSchema, fileTypeFromName } from "@/lib/validators";

// Limite défensive : 500 Mo / fichier (stems, projets DAW). Au-delà → 413.
const MAX_BYTES = 500 * 1024 * 1024;

/**
 * POST /api/upload — dépose un fichier dans une version du vault.
 * multipart/form-data : file, versionId, (fileType optionnel).
 *
 * Pipeline : auth → autorisation (contributeur du projet) → lecture buffer →
 * SHA-256 → S3 (Object Lock COMPLIANCE) → ancrage on-chain (stub S3) → VaultFile.
 */
export async function POST(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!s3Configured()) {
    return NextResponse.json(
      { error: "Stockage non configuré. Provisionnez le bucket S3 (Object Lock)." },
      { status: 503 },
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Champ `file` manquant." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Fichier vide." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Fichier trop volumineux (max 500 Mo)." }, { status: 413 });
  }

  const parsed = uploadMetadataSchema.safeParse({
    versionId: form.get("versionId"),
    fileType: form.get("fileType") ?? fileTypeFromName(file.name),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Métadonnées invalides.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { versionId, fileType } = parsed.data;

  // Autorisation : la version doit appartenir à un projet où l'user est
  // propriétaire ou contributeur.
  const version = await prisma.version.findUnique({
    where: { id: versionId },
    include: { project: { include: { contributors: true } } },
  });
  if (!version) {
    return NextResponse.json({ error: "Version introuvable." }, { status: 404 });
  }
  const isOwner = version.project.ownerId === user.id;
  const isContributor = version.project.contributors.some((c) => c.userId === user.id);
  if (!isOwner && !isContributor) {
    return NextResponse.json({ error: "Accès refusé à ce projet." }, { status: 403 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = sha256(buffer);

  // Dédoublonnage : si ce hash exact existe déjà, on renvoie le fichier existant.
  const existing = await prisma.vaultFile.findUnique({ where: { sha256Hash: hash } });
  if (existing) {
    return NextResponse.json(
      { file: serializeFile(existing), deduplicated: true },
      { status: 200 },
    );
  }

  const key = vaultKey({
    projectId: version.projectId,
    versionId,
    sha256: hash,
    filename: file.name,
  });

  const stored = await putVaultObject({
    key,
    body: buffer,
    contentType: file.type || undefined,
    sha256: hash,
  });

  // Ancrage on-chain (no-op au Sprint 1 — invisible pour l'artiste, non-négo #5).
  const polygonTxHash = await anchorFileHash(hash);

  const created = await prisma.vaultFile.create({
    data: {
      versionId,
      filename: file.name,
      fileType,
      sizeBytes: BigInt(file.size),
      mimeType: file.type || null,
      s3Bucket: stored.bucket,
      s3Key: stored.key,
      s3VersionId: stored.versionId ?? null,
      objectLockRetainUntil: stored.retainUntil,
      sha256Hash: hash,
      polygonTxHash,
      uploadedById: user.id,
    },
  });

  // Sprint 5 : empreinte acoustique + détection de similarité, APRÈS la
  // réponse HTTP (l'artiste n'attend pas ; no-op si fpcalc absent).
  after(() => processUploadedAudio(created.id, buffer));

  return NextResponse.json({ file: serializeFile(created) }, { status: 201 });
}

// Non-négo #1 : aucune suppression — jamais. Le verbe DELETE renvoie un 403
// systématique (3e couche de défense, après l'absence de `deleted_at` en base
// et de bouton dans l'UI ; la 4e étant l'Object Lock S3).
export function DELETE() {
  return NextResponse.json(
    { error: "Suppression interdite : les fichiers du vault sont immuables." },
    { status: 403 },
  );
}

// BigInt n'est pas sérialisable en JSON — on le convertit en string.
function serializeFile(f: { sizeBytes: bigint } & Record<string, unknown>) {
  return { ...f, sizeBytes: f.sizeBytes.toString() };
}
