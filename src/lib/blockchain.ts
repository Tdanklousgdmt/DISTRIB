import "server-only";

import { Contract, JsonRpcProvider, Wallet, formatEther, id as keccakId, concat, keccak256, toUtf8Bytes } from "ethers";

import { prisma } from "@/lib/prisma";
import { optionalEnv } from "@/lib/env";

// ─────────────────────────────────────────────────────────────────────────────
// Ancrage Polygon — Sprint 3.
//
// Non-négo #2 : le contrat DistribRegistry ne gère QUE des états/booléens
// (5 fonctions : registerProject, approveVersion, canPublish, setPendingClaim,
// resolveClaim — rien d'autre). Source : contracts/contracts/DistribRegistry.sol.
//
// Non-négo #3 : MASTER_CONTRACT_ADDRESS ne doit pointer mainnet qu'après
// 2 semaines de testnet Amoy sans aucune anomalie.
//
// Non-négo #5 : tout est côté serveur (wallet en env), AUCUNE de ces fonctions
// ne doit faire échouer un flux utilisateur — en cas d'erreur RPC on log et on
// renvoie null ; l'ancrage pourra être rejoué plus tard.
//
// La preuve d'antériorité au dépôt (anchorFileHash) n'utilise PAS le contrat :
// c'est une transaction brute du wallet serveur vers lui-même avec le hash en
// calldata — horodatage public sans élargir la surface du contrat.
// ─────────────────────────────────────────────────────────────────────────────

const REGISTRY_ABI = [
  "function registerProject(bytes32 projectId)",
  "function approveVersion(bytes32 projectId, uint256 versionNumber, bytes32 versionHash)",
  "function canPublish(bytes32 projectId) view returns (bool)",
  "function setPendingClaim(bytes32 projectId)",
  "function resolveClaim(bytes32 projectId)",
];

/** Vrai quand la stack on-chain est configurée (Sprint 3+). */
export function blockchainEnabled(): boolean {
  return (
    optionalEnv("MASTER_CONTRACT_ADDRESS") !== undefined &&
    optionalEnv("SERVER_WALLET_PRIVATE_KEY") !== undefined &&
    rpcUrl() !== undefined
  );
}

function rpcUrl(): string | undefined {
  // POLYGON_NETWORK=mainnet uniquement après les 2 semaines Amoy (non-négo #3).
  const network = optionalEnv("POLYGON_NETWORK") ?? "amoy";
  return network === "mainnet"
    ? optionalEnv("ALCHEMY_RPC_URL_MAINNET")
    : optionalEnv("ALCHEMY_RPC_URL_AMOY");
}

let cached: { wallet: Wallet; registry: Contract } | null = null;

function getChain(): { wallet: Wallet; registry: Contract } | null {
  if (!blockchainEnabled()) return null;
  if (!cached) {
    const provider = new JsonRpcProvider(rpcUrl());
    const wallet = new Wallet(optionalEnv("SERVER_WALLET_PRIVATE_KEY")!, provider);
    const registry = new Contract(
      optionalEnv("MASTER_CONTRACT_ADDRESS")!,
      REGISTRY_ABI,
      wallet,
    );
    cached = { wallet, registry };
  }
  return cached;
}

/** cuid → identifiant on-chain bytes32 (keccak256 de la chaîne). Déterministe. */
export function onchainId(cuid: string): string {
  return keccakId(cuid);
}

/**
 * Hash de version : keccak256 de la concaténation TRIÉE des SHA-256 de fichiers.
 * Trié pour être indépendant de l'ordre d'upload — recalculable par n'importe qui.
 */
export function versionHash(fileHashes: string[]): string {
  const sorted = [...fileHashes].sort();
  return keccak256(concat(sorted.map((h) => toUtf8Bytes(h))));
}

/**
 * Preuve d'antériorité au dépôt d'un fichier : tx brute avec le SHA-256 en
 * calldata (0 MATIC, wallet → wallet). Renvoie le hash de tx, ou null.
 */
export async function anchorFileHash(sha256: string): Promise<string | null> {
  const chain = getChain();
  if (!chain) return null;
  try {
    const tx = await chain.wallet.sendTransaction({
      to: chain.wallet.address,
      value: 0n,
      data: "0x" + Buffer.from(`distrib:sha256:${sha256}`).toString("hex"),
    });
    await tx.wait();
    return tx.hash;
  } catch (e) {
    console.error("[blockchain] anchorFileHash échoué (sera rejoué) :", e);
    return null;
  }
}

/**
 * registerProject on-chain + mise à jour du reflet en base.
 * Appelé une seule fois par projet, à la création.
 */
export async function registerProjectOnchain(
  projectId: string,
): Promise<{ onchainProjectId: string; txHash: string } | null> {
  const chain = getChain();
  if (!chain) return null;
  try {
    const oid = onchainId(projectId);
    const tx = await chain.registry.registerProject(oid);
    await tx.wait();
    await prisma.project.update({
      where: { id: projectId },
      data: { onchainProjectId: oid, registerTxHash: tx.hash },
    });
    return { onchainProjectId: oid, txHash: tx.hash };
  } catch (e) {
    console.error("[blockchain] registerProject échoué (sera rejoué) :", e);
    return null;
  }
}

/**
 * Ancre l'approbation unanime d'une version (état final on-chain).
 * Renvoie le hash de tx (→ Version.finalPolygonTxHash), ou null.
 */
export async function approveVersionOnchain(params: {
  projectId: string;
  versionNumber: number;
  fileHashes: string[];
}): Promise<string | null> {
  const chain = getChain();
  if (!chain) return null;
  try {
    const tx = await chain.registry.approveVersion(
      onchainId(params.projectId),
      BigInt(params.versionNumber),
      versionHash(params.fileHashes),
    );
    await tx.wait();
    return tx.hash;
  } catch (e) {
    console.error("[blockchain] approveVersion échoué (sera rejoué) :", e);
    return null;
  }
}

/**
 * Pose une réclamation on-chain : bloque la publication du projet visé
 * jusqu'à résolution. Renvoie le hash de tx, ou null.
 */
export async function setPendingClaimOnchain(projectId: string): Promise<string | null> {
  const chain = getChain();
  if (!chain) return null;
  try {
    const tx = await chain.registry.setPendingClaim(onchainId(projectId));
    await tx.wait();
    return tx.hash;
  } catch (e) {
    console.error("[blockchain] setPendingClaim échoué (sera rejoué) :", e);
    return null;
  }
}

/** Résout la réclamation on-chain : débloque la publication. */
export async function resolveClaimOnchain(projectId: string): Promise<string | null> {
  const chain = getChain();
  if (!chain) return null;
  try {
    const tx = await chain.registry.resolveClaim(onchainId(projectId));
    await tx.wait();
    return tx.hash;
  } catch (e) {
    console.error("[blockchain] resolveClaim échoué (sera rejoué) :", e);
    return null;
  }
}

export interface OnchainTxInfo {
  hash: string;
  status: "success" | "failed" | "pending";
  blockNumber: number | null;
  timestamp: Date | null;
  from: string | null;
  to: string | null;
  valuePol: string;
  feePol: string | null;
  network: "amoy" | "mainnet";
  explorerUrl: string;
}

function explorerBaseUrl(): string {
  return (optionalEnv("POLYGON_NETWORK") ?? "amoy") === "mainnet"
    ? "https://polygonscan.com"
    : "https://amoy.polygonscan.com";
}

/**
 * Interroge Polygon pour les détails vérifiables d'une transaction (registre
 * des preuves — voir buildLedgerPdf). Lecture seule : n'a besoin ni du wallet
 * ni du contrat, juste du RPC. Renvoie null si la stack n'est pas configurée
 * ou si la transaction est introuvable.
 */
export async function getOnchainTxInfo(txHash: string): Promise<OnchainTxInfo | null> {
  const url = rpcUrl();
  if (!url) return null;
  const network = (optionalEnv("POLYGON_NETWORK") ?? "amoy") as "amoy" | "mainnet";
  try {
    const provider = new JsonRpcProvider(url);
    const [receipt, tx] = await Promise.all([
      provider.getTransactionReceipt(txHash),
      provider.getTransaction(txHash),
    ]);
    if (!receipt || !tx) return null;

    const block = receipt.blockNumber != null ? await provider.getBlock(receipt.blockNumber) : null;
    const feeWei = receipt.gasUsed * receipt.gasPrice;

    return {
      hash: txHash,
      status: receipt.status === 1 ? "success" : "failed",
      blockNumber: receipt.blockNumber,
      timestamp: block ? new Date(Number(block.timestamp) * 1000) : null,
      from: receipt.from,
      to: receipt.to,
      valuePol: (Number(tx.value) / 1e18).toString(),
      feePol: (Number(feeWei) / 1e18).toFixed(6),
      network,
      explorerUrl: `${explorerBaseUrl()}/tx/${txHash}`,
    };
  } catch (e) {
    console.error("[blockchain] getOnchainTxInfo échoué pour", txHash, ":", e);
    return null;
  }
}

/**
 * Aligne Project.canPublish sur l'état du contrat (source de vérité on-chain).
 * No-op tant que la stack n'est pas provisionnée.
 */
export async function syncCanPublish(projectId: string): Promise<void> {
  const chain = getChain();
  if (!chain) return;
  try {
    const onchain: boolean = await chain.registry.canPublish(onchainId(projectId));
    await prisma.project.update({
      where: { id: projectId },
      data: {
        canPublish: onchain,
        publishBlockedReason: onchain ? null : "Réclamation en cours ou aucune version approuvée",
      },
    });
  } catch (e) {
    console.error("[blockchain] syncCanPublish échoué :", e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rejeu des ancrages. Aucun flux utilisateur n'échoue quand Polygon refuse une
// transaction (non-négo #5) — mais « sera rejoué » doit être vrai : ce qui
// manque en base (registerProject, ancrage de fichier, approveVersion) est
// retenté ici, à la demande (bouton) ou par cron.
// ─────────────────────────────────────────────────────────────────────────────

export interface PendingAnchors {
  registerProject: boolean;
  files: number;
  approvedVersions: number;
  total: number;
}

/** Ce qui n'est pas encore inscrit on-chain pour un projet. */
export async function pendingAnchorsForProject(projectId: string): Promise<PendingAnchors> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      versions: {
        select: { status: true, finalPolygonTxHash: true, files: { select: { polygonTxHash: true } } },
      },
    },
  });
  const files = project.versions.reduce((n, v) => n + v.files.filter((f) => !f.polygonTxHash).length, 0);
  const approvedVersions = project.versions.filter((v) => v.status === "APPROVED" && !v.finalPolygonTxHash).length;
  const registerProject = !project.registerTxHash;
  return { registerProject, files, approvedVersions, total: files + approvedVersions + (registerProject ? 1 : 0) };
}

/** Retente tout ce qui manque ; renvoie ce qui a abouti. */
export async function replayPendingAnchors(projectId: string): Promise<{ done: number; remaining: number }> {
  if (!blockchainEnabled()) return { done: 0, remaining: 0 };
  let done = 0;

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      versions: {
        orderBy: { versionNumber: "asc" },
        include: { files: { select: { id: true, sha256Hash: true, polygonTxHash: true } } },
      },
    },
  });

  if (!project.registerTxHash) {
    if (await registerProjectOnchain(project.id)) done += 1;
    else return { done, remaining: (await pendingAnchorsForProject(projectId)).total };
  }

  for (const v of project.versions) {
    for (const f of v.files) {
      if (f.polygonTxHash) continue;
      const tx = await anchorFileHash(f.sha256Hash);
      if (!tx) return { done, remaining: (await pendingAnchorsForProject(projectId)).total };
      await prisma.vaultFile.update({ where: { id: f.id }, data: { polygonTxHash: tx } });
      done += 1;
    }
    if (v.status === "APPROVED" && !v.finalPolygonTxHash) {
      const tx = await approveVersionOnchain({
        projectId: project.id,
        versionNumber: v.versionNumber,
        fileHashes: v.files.map((f) => f.sha256Hash),
      });
      if (!tx) return { done, remaining: (await pendingAnchorsForProject(projectId)).total };
      await prisma.version.update({ where: { id: v.id }, data: { finalPolygonTxHash: tx } });
      done += 1;
    }
  }
  await syncCanPublish(projectId);
  return { done, remaining: (await pendingAnchorsForProject(projectId)).total };
}

export interface ServerWalletStatus {
  address: string;
  balancePol: number;
  network: "amoy" | "mainnet";
  /** Estimation : un approveVersion coûte ~0,03 POL à 50 gwei sur Amoy. */
  low: boolean;
}

/** Solde du wallet serveur — pour expliquer un ancrage en attente. */
export async function getServerWalletStatus(): Promise<ServerWalletStatus | null> {
  const chain = getChain();
  if (!chain) return null;
  try {
    const balance = await chain.wallet.provider!.getBalance(chain.wallet.address);
    const balancePol = Number(formatEther(balance));
    return {
      address: chain.wallet.address,
      balancePol,
      network: (optionalEnv("POLYGON_NETWORK") ?? "amoy") as "amoy" | "mainnet",
      low: balancePol < 0.05,
    };
  } catch (e) {
    console.error("[blockchain] solde wallet :", e);
    return null;
  }
}
