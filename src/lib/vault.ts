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
//
// Cas solo (1 seul contributeur) : le créateur est auto-approuvé mais la
// version reste PENDING tant qu'aucun fichier n'a été déposé — sinon la
// finalisation on-chain aurait lieu avant toute preuve. C'est l'action
// explicite finalizeSoloVersion (déclenchée après upload) qui ancre.
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
 * Cas solo : PAS de finalisation ici — voir finalizeSoloVersion, déclenchée
 * après upload pour garantir qu'au moins un fichier existe avant l'ancrage.
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

  // Pas de finalisation ici, y compris en solo : voir finalizeSoloVersion.
}

/**
 * Finalise une version solo (créateur = seul contributeur, déjà auto-approuvé)
 * dès qu'au moins un fichier a été déposé. Appelée après chaque upload — no-op
 * si la version n'est pas éligible (déjà finalisée, contributeurs multiples
 * avec approbations en attente, ou aucun fichier).
 */
export async function finalizeSoloVersionIfReady(versionId: string) {
  const version = await prisma.version.findUnique({
    where: { id: versionId },
    include: { approvals: true, files: { select: { id: true }, take: 1 } },
  });
  if (!version || version.status !== "PENDING") return;
  if (version.files.length === 0) return;
  const stillPending = version.approvals.some((a) => a.status === "PENDING");
  if (stillPending) return;

  await finalizeApprovedVersion(versionId);
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
