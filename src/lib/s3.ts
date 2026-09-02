import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ObjectLockMode,
  ObjectLockLegalHoldStatus,
} from "@aws-sdk/client-s3";

import { optionalEnv, requireEnv, s3Configured } from "@/lib/env";

// ─────────────────────────────────────────────────────────────────────────────
// Stockage vault — AWS S3 avec Object Lock mode COMPLIANCE.
//
// Non-négo #1 : aucune suppression — JAMAIS. Object Lock COMPLIANCE garantit
// l'immuabilité côté stockage : même le compte root AWS ne peut ni supprimer ni
// écraser l'objet avant la fin de la rétention. C'est la 4e couche de défense
// (après : pas de `deleted_at`, API DELETE → 403, bouton absent de l'UI).
//
// Le bucket DOIT avoir été créé avec Object Lock activé (impossible à activer
// rétroactivement — cf. README).
// ─────────────────────────────────────────────────────────────────────────────

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!s3Configured()) {
    throw new Error("Stockage S3 non configuré (variables AWS_* manquantes).");
  }
  if (!client) {
    client = new S3Client({
      region: requireEnv("AWS_REGION"),
      credentials: {
        accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
      },
    });
  }
  return client;
}

/** Date de fin de rétention = maintenant + N années (défaut 10). */
function retainUntil(): Date {
  const years = Number(optionalEnv("S3_OBJECT_LOCK_RETENTION_YEARS") ?? "10");
  const date = new Date();
  date.setFullYear(date.getFullYear() + years);
  return date;
}

export interface StoredObject {
  bucket: string;
  key: string;
  versionId?: string;
  retainUntil: Date;
}

/**
 * Dépose un fichier dans le vault sous Object Lock COMPLIANCE.
 * La clé S3 est dérivée du hash → contenu adressable, pas de collision.
 */
export async function putVaultObject(params: {
  key: string;
  body: Buffer | Uint8Array;
  contentType?: string;
  sha256: string;
}): Promise<StoredObject> {
  const bucket = requireEnv("S3_BUCKET_VAULT");
  const until = retainUntil();

  const result = await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      // Immuabilité : verrou COMPLIANCE jusqu'à `until`.
      ObjectLockMode: ObjectLockMode.COMPLIANCE,
      ObjectLockRetainUntilDate: until,
      ObjectLockLegalHoldStatus: ObjectLockLegalHoldStatus.ON,
      // Intégrité : on transmet le SHA-256 en métadonnée (vérif manuelle possible).
      Metadata: { "sha256-hex": params.sha256 },
    }),
  );

  return {
    bucket,
    key: params.key,
    versionId: result.VersionId,
    retainUntil: until,
  };
}

/** Relit un objet du vault (lecture seule — jamais de suppression). */
export async function getVaultObject(key: string): Promise<Uint8Array> {
  const bucket = requireEnv("S3_BUCKET_VAULT");
  const result = await getClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await result.Body?.transformToByteArray();
  if (!bytes) throw new Error("Objet vault introuvable ou vide.");
  return bytes;
}

/** Clé S3 déterministe pour un fichier de vault : <projet>/<version>/<hash>-<nom>. */
export function vaultKey(parts: {
  projectId: string;
  versionId: string;
  sha256: string;
  filename: string;
}): string {
  const safeName = parts.filename.replace(/[^\w.\-]+/g, "_");
  return `${parts.projectId}/${parts.versionId}/${parts.sha256}-${safeName}`;
}

export { s3Configured };
