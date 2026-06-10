import { createHash } from "node:crypto";

// SHA-256 d'un buffer — preuve cryptographique d'intégrité d'un fichier.
// Ce hash est unique en base (VaultFile.sha256Hash) et sera ancré on-chain
// au Sprint 3 (preuve d'antériorité Polygon).
export function sha256(data: Uint8Array | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
