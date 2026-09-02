import "server-only";

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

import { optionalEnv, s3Configured } from "@/lib/env";
import { putVaultObject, getVaultObject, vaultKey, type StoredObject } from "@/lib/s3";

// ─────────────────────────────────────────────────────────────────────────────
// Abstraction du stockage vault — deux drivers :
//
//  · "s3"    : AWS S3 Object Lock COMPLIANCE — l'immuabilité est garantie par
//              l'infrastructure elle-même (cible production, non-négo #1).
//  · "local" : fichiers sur le disque de la machine (dev / auto-hébergement).
//              L'API continue de refuser toute suppression (403) et le fichier
//              est posé en lecture seule, MAIS l'immuabilité physique n'est pas
//              garantie contre un accès direct au disque. La preuve juridique
//              reste le hash SHA-256 ancré sur Polygon, valable dans les 2 cas.
//
// Sélection : STORAGE_DRIVER=s3|local, sinon S3 si configuré, sinon local.
// ─────────────────────────────────────────────────────────────────────────────

export type StorageDriver = "s3" | "local";

export function storageDriver(): StorageDriver {
  const explicit = optionalEnv("STORAGE_DRIVER");
  if (explicit === "s3" || explicit === "local") return explicit;
  return s3Configured() ? "s3" : "local";
}

/** Toujours vrai en local ; en S3, vrai si les variables AWS sont présentes. */
export function storageConfigured(): boolean {
  return storageDriver() === "local" ? true : s3Configured();
}

function localVaultDir(): string {
  return resolve(optionalEnv("VAULT_LOCAL_DIR") ?? join(process.cwd(), ".vault"));
}

/** Dépose un fichier dans le vault via le driver actif. */
export async function storeVaultObject(params: {
  key: string;
  body: Buffer | Uint8Array;
  contentType?: string;
  sha256: string;
}): Promise<StoredObject> {
  if (storageDriver() === "s3") {
    return putVaultObject(params);
  }

  // Driver local — le chemin est contraint au répertoire vault.
  const root = localVaultDir();
  const path = resolve(join(root, params.key));
  if (!path.startsWith(root + sep)) {
    throw new Error("Clé de vault invalide (échappement de répertoire).");
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, params.body, { flag: "wx" }); // wx : refuse d'écraser
  await chmod(path, 0o444); // lecture seule — dissuasif, pas une garantie

  const years = Number(optionalEnv("S3_OBJECT_LOCK_RETENTION_YEARS") ?? "10");
  const retainUntil = new Date();
  retainUntil.setFullYear(retainUntil.getFullYear() + years);

  return { bucket: "local", key: params.key, versionId: undefined, retainUntil };
}

/**
 * Relit un objet du vault via le driver actif — utilisé pour la comparaison
 * audio des réclamations (jamais pour un export/téléchargement en masse).
 */
export async function readVaultObject(key: string): Promise<Buffer> {
  if (storageDriver() === "s3") {
    return Buffer.from(await getVaultObject(key));
  }
  const root = localVaultDir();
  const path = resolve(join(root, key));
  if (!path.startsWith(root + sep)) {
    throw new Error("Clé de vault invalide (échappement de répertoire).");
  }
  return readFile(path);
}

export { vaultKey };
