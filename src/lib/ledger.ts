import "server-only";

import { prisma } from "@/lib/prisma";
import { getOnchainTxInfo, type OnchainTxInfo } from "@/lib/blockchain";
import type { LedgerPdfData, LedgerPdfRow } from "@/lib/pdf";

// ─────────────────────────────────────────────────────────────────────────────
// Registre des transactions blockchain d'un projet (ou d'une version) —
// document d'attestation pour un label ou un juriste. Rassemble tous les
// hash de transaction liés (ancrage de fichiers + approbations de versions),
// puis interroge Polygon pour chacun (bloc, date, wallets, frais).
// ─────────────────────────────────────────────────────────────────────────────

export interface LedgerUser {
  name: string | null;
  email: string;
}

export interface LedgerRow {
  label: string; // ex : "Fichier — master.wav" ou "Version 2 — approbation finale"
  method: string; // ex : "Ancrage SHA-256 (preuve d'antériorité)" ou "approveVersion"
  onchain: OnchainTxInfo | null; // null = tx non trouvée ou stack non configurée
  rawHash: string;
  user: LedgerUser; // l'utilisateur DISTRIB à l'origine de cette action (pas le wallet)
}

export interface ProjectLedger {
  projectTitle: string;
  contractAddress: string | null;
  network: "amoy" | "mainnet";
  rows: LedgerRow[];
  generatedAt: Date;
}

/** Rassemble et résout toutes les transactions on-chain d'un projet. */
export async function buildProjectLedger(projectId: string): Promise<ProjectLedger | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      versions: {
        orderBy: { versionNumber: "asc" },
        include: {
          files: {
            orderBy: { uploadedAt: "asc" },
            include: { uploadedBy: { select: { name: true, email: true } } },
          },
          createdBy: { select: { name: true, email: true } },
        },
      },
    },
  });
  if (!project) return null;

  const targets: Array<{ label: string; method: string; hash: string; user: LedgerUser }> = [];

  for (const v of project.versions) {
    for (const f of v.files) {
      if (f.polygonTxHash) {
        targets.push({
          label: `Version ${v.versionNumber} — fichier « ${f.filename} »`,
          method: "Ancrage SHA-256 (preuve d'antériorité)",
          hash: f.polygonTxHash,
          user: f.uploadedBy,
        });
      }
    }
    if (v.finalPolygonTxHash) {
      targets.push({
        label: `Version ${v.versionNumber} — approbation finale`,
        method: "approveVersion (contrat DistribRegistry)",
        hash: v.finalPolygonTxHash,
        user: v.createdBy,
      });
    }
  }

  const rows: LedgerRow[] = await Promise.all(
    targets.map(async (t) => ({
      label: t.label,
      method: t.method,
      rawHash: t.hash,
      user: t.user,
      onchain: await getOnchainTxInfo(t.hash),
    })),
  );

  const { optionalEnv } = await import("@/lib/env");
  return {
    projectTitle: project.title,
    contractAddress: optionalEnv("MASTER_CONTRACT_ADDRESS") ?? null,
    network: (optionalEnv("POLYGON_NETWORK") ?? "amoy") as "amoy" | "mainnet",
    rows,
    generatedAt: new Date(),
  };
}

/** Convertit le registre (données brutes) au format attendu par buildLedgerPdf. */
export function toLedgerPdfData(ledger: ProjectLedger): LedgerPdfData {
  return {
    projectTitle: ledger.projectTitle,
    contractAddress: ledger.contractAddress,
    network: ledger.network,
    generatedAt: ledger.generatedAt,
    rows: ledger.rows.map(
      (r): LedgerPdfRow => ({
        label: r.label,
        method: r.method,
        hash: r.rawHash,
        userLabel: r.user.name ?? r.user.email,
        status: r.onchain?.status ?? "introuvable",
        blockNumber: r.onchain?.blockNumber ?? null,
        date: r.onchain?.timestamp ?? null,
        from: r.onchain?.from ?? null,
        to: r.onchain?.to ?? null,
        valuePol: r.onchain?.valuePol ?? "0",
        feePol: r.onchain?.feePol ?? null,
        explorerUrl: r.onchain?.explorerUrl ?? null,
      }),
    ),
  };
}
