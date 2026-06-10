"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { resolveClaimOnchain, syncCanPublish } from "@/lib/blockchain";
import { resolveClaimSchema } from "@/lib/validators";
import type { ActionState } from "./actions";

// ─────────────────────────────────────────────────────────────────────────────
// Résolution des réclamations (Sprint 5).
//
// Seul le propriétaire du projet CIBLE (l'œuvre antérieure copiée) décide :
//  · AUTHORIZE        → il autorise l'usage : claim levé, publication débloquée
//  · NEGOTIATE_SPLIT  → accord à trouver : claim ouvert, publication bloquée
//  · REPORT           → litige déclaré : claim DISPUTED, publication bloquée
// ─────────────────────────────────────────────────────────────────────────────

export async function resolveClaimAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = resolveClaimSchema.safeParse({
    claimId: formData.get("claimId"),
    action: formData.get("action"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const { claimId, action, note } = parsed.data;

  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: {
      targetFile: {
        include: { version: { include: { project: { select: { id: true, ownerId: true } } } } },
      },
      claimantFile: {
        include: {
          version: {
            include: { project: { select: { id: true, ownerId: true, title: true } } },
          },
        },
      },
    },
  });
  if (!claim) return { error: "Réclamation introuvable." };
  if (claim.targetFile.version.project.ownerId !== user.id) {
    return { error: "Seul le propriétaire de l'œuvre originale peut trancher." };
  }
  if (claim.status === "AUTHORIZED" || claim.status === "RESOLVED") {
    return { error: "Cette réclamation est déjà résolue." };
  }

  const claimantProject = claim.claimantFile.version.project;

  if (action === "AUTHORIZE") {
    const txHash = await resolveClaimOnchain(claimantProject.id);
    const hasApproved = await prisma.version.count({
      where: { projectId: claimantProject.id, status: "APPROVED" },
    });
    await prisma.$transaction([
      prisma.claim.update({
        where: { id: claimId },
        data: {
          status: "AUTHORIZED",
          resolutionAction: "AUTHORIZE",
          resolutionTxHash: txHash,
          resolvedAt: new Date(),
          resolutionNote: note ?? null,
        },
      }),
      prisma.project.update({
        where: { id: claimantProject.id },
        data: {
          canPublish: hasApproved > 0,
          publishBlockedReason:
            hasApproved > 0 ? null : "Aucune version approuvée à l'unanimité",
        },
      }),
    ]);
    await syncCanPublish(claimantProject.id);
  } else {
    await prisma.claim.update({
      where: { id: claimId },
      data: {
        status: action === "NEGOTIATE_SPLIT" ? "SPLIT_NEGOTIATED" : "DISPUTED",
        resolutionAction: action,
        resolvedAt: action === "NEGOTIATE_SPLIT" ? null : new Date(),
        resolutionNote: note ?? null,
      },
    });
  }

  // Le propriétaire du projet claimant est prévenu de la décision.
  await prisma.notification.create({
    data: {
      userId: claimantProject.ownerId,
      type: "CLAIM_DETECTED",
      payload: {
        role: "claimant-update",
        projectId: claimantProject.id,
        projectTitle: claimantProject.title,
        decision: action,
      },
    },
  });

  revalidatePath("/claims");
  return undefined;
}
