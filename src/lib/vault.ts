import { prisma } from "@/lib/prisma";
import { approveVersionOnchain, syncCanPublish } from "@/lib/blockchain";
import type { NotificationType } from "@/generated/prisma/enums";

// ─────────────────────────────────────────────────────────────────────────────
// Logique métier du vault collaboratif (Sprint 2).
//
// Cycle de vie d'une version :
//   dépôt → 1 Approval par contributeur (créateur auto-approuvé)
//         → unanimité APPROVED  ⇒ version APPROVED + isCurrent + ancrage on-chain
//         → 1 seul REJECTED     ⇒ version REJECTED
// ─────────────────────────────────────────────────────────────────────────────

export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  payload: Record<string, string | number | null>;
}) {
  await prisma.notification.create({
    data: { userId: params.userId, type: params.type, payload: params.payload },
  });
}

/**
 * Crée les demandes d'approbation d'une version fraîchement déposée.
 * Le créateur est auto-approuvé ; les autres contributeurs sont notifiés.
 * Cas solo (1 seul contributeur) : la version est finalisée immédiatement.
 */
export async function requestApprovals(versionId: string) {
  const version = await prisma.version.findUniqueOrThrow({
    where: { id: versionId },
    include: { project: { include: { contributors: true } } },
  });

  await prisma.$transaction(
    version.project.contributors.map((c) =>
      prisma.approval.create({
        data: {
          versionId,
          contributorId: c.id,
          reviewerId: c.userId,
          status: c.userId === version.createdById ? "APPROVED" : "PENDING",
          decidedAt: c.userId === version.createdById ? new Date() : null,
        },
      }),
    ),
  );

  const others = version.project.contributors.filter(
    (c) => c.userId !== version.createdById,
  );
  for (const c of others) {
    await createNotification({
      userId: c.userId,
      type: "APPROVAL_REQUESTED",
      payload: {
        projectId: version.projectId,
        projectTitle: version.project.title,
        versionId,
        versionNumber: version.versionNumber,
      },
    });
  }

  // Solo : unanimité triviale → finalisation immédiate.
  if (others.length === 0) {
    await finalizeApprovedVersion(versionId);
  }
}

/**
 * À appeler quand la dernière approbation passe à APPROVED.
 * Marque la version APPROVED + isCurrent (les précédentes deviennent OBSOLETE),
 * met à jour canPublish, ancre l'état on-chain (invisible pour l'artiste).
 */
export async function finalizeApprovedVersion(versionId: string) {
  const version = await prisma.version.findUniqueOrThrow({
    where: { id: versionId },
    include: { project: true, files: { select: { sha256Hash: true } } },
  });

  // Ancrage on-chain (no-op tant que la stack Sprint 3 n'est pas provisionnée).
  const txHash = await approveVersionOnchain({
    projectId: version.projectId,
    versionNumber: version.versionNumber,
    fileHashes: version.files.map((f) => f.sha256Hash),
  });

  await prisma.$transaction([
    // Les anciennes versions courantes deviennent obsolètes.
    prisma.version.updateMany({
      where: { projectId: version.projectId, isCurrent: true, id: { not: versionId } },
      data: { isCurrent: false, status: "OBSOLETE" },
    }),
    prisma.version.update({
      where: { id: versionId },
      data: {
        status: "APPROVED",
        isCurrent: true,
        finalPolygonTxHash: txHash,
        finalizedAt: new Date(),
      },
    }),
    prisma.project.update({
      where: { id: version.projectId },
      data: { canPublish: true, publishBlockedReason: null },
    }),
  ]);

  await syncCanPublish(version.projectId);

  await createNotification({
    userId: version.createdById,
    type: "VERSION_APPROVED",
    payload: {
      projectId: version.projectId,
      projectTitle: version.project.title,
      versionId,
      versionNumber: version.versionNumber,
    },
  });
}

/** À appeler quand une approbation passe à REJECTED : la version est rejetée. */
export async function rejectVersion(versionId: string, rejectedById: string) {
  const version = await prisma.version.update({
    where: { id: versionId },
    data: { status: "REJECTED" },
    include: { project: true },
  });

  if (version.createdById !== rejectedById) {
    await createNotification({
      userId: version.createdById,
      type: "VERSION_REJECTED",
      payload: {
        projectId: version.projectId,
        projectTitle: version.project.title,
        versionId,
        versionNumber: version.versionNumber,
      },
    });
  }
}
