"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { registerProjectOnchain } from "@/lib/blockchain";
import {
  createNotification,
  finalizeApprovedVersion,
  rejectVersion,
  requestApprovals,
} from "@/lib/vault";
import {
  createProjectSchema,
  createVersionSchema,
  decideApprovalSchema,
  inviteContributorSchema,
  setSplitsSchema,
} from "@/lib/validators";

// ─────────────────────────────────────────────────────────────────────────────
// Server Actions — mutations du vault. Chaque action revérifie l'auth (les
// actions sont joignables en POST direct, pas seulement via l'UI — cf. doc Next).
// ─────────────────────────────────────────────────────────────────────────────

export type ActionState = { error?: string; versionId?: string } | undefined;

/** Crée un projet (racine du vault) dont l'utilisateur est propriétaire. */
export async function createProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = createProjectSchema.safeParse({
    title: formData.get("title"),
    isrc: formData.get("isrc") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  let projectId: string;
  try {
    const project = await prisma.project.create({
      data: {
        title: parsed.data.title,
        isrc: parsed.data.isrc ?? null,
        ownerId: user.id,
        // Le créateur est aussi premier contributeur (rôle ARTIST).
        contributors: {
          create: { userId: user.id, role: "ARTIST", acceptedAt: new Date() },
        },
      },
    });
    projectId = project.id;
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "Cet ISRC est déjà enregistré." };
    throw e;
  }

  // Enregistrement on-chain (no-op au Sprint 1 — invisible, non-négo #5).
  await registerProjectOnchain(projectId);

  revalidatePath("/projects");
  redirect(`/projects/${projectId}`);
}

/** Crée une nouvelle version (dépôt) dans un projet. */
export async function createVersionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = createVersionSchema.safeParse({
    projectId: formData.get("projectId"),
    description: formData.get("description"),
    parentVersionId: formData.get("parentVersionId") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const { projectId, description, parentVersionId } = parsed.data;

  // Autorisation : propriétaire ou contributeur du projet.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { contributors: true },
  });
  if (!project) return { error: "Projet introuvable." };
  const authorized =
    project.ownerId === user.id ||
    project.contributors.some((c) => c.userId === user.id);
  if (!authorized) return { error: "Accès refusé à ce projet." };

  // Numéro de version = max + 1 (séquence par projet).
  const last = await prisma.version.findFirst({
    where: { projectId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  const versionNumber = (last?.versionNumber ?? 0) + 1;

  const version = await prisma.version.create({
    data: {
      projectId,
      versionNumber,
      description,
      parentVersionId: parentVersionId ?? null,
      createdById: user.id,
      status: "PENDING",
    },
  });

  // Sprint 2 : ouvre le flux d'approbation multi-parties (créateur auto-approuvé,
  // les autres contributeurs sont notifiés ; cas solo → finalisée directement).
  await requestApprovals(version.id);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/vault");
  // versionId renvoyé pour les flux qui enchaînent immédiatement un upload
  // (ex. dépôt rapide depuis /vault) — ignoré par les appelants qui n'en ont
  // pas besoin (ex. NewVersionForm ne lit que state?.error).
  return { versionId: version.id };
}

/** Invite un contributeur (par e-mail) sur un projet. Réservé au propriétaire. */
export async function inviteContributorAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = inviteContributorSchema.safeParse({
    projectId: formData.get("projectId"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const { projectId, email, role } = parsed.data;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Projet introuvable." };
  if (project.ownerId !== user.id) {
    return { error: "Seul le propriétaire peut inviter des contributeurs." };
  }

  // L'invité n'a peut-être jamais ouvert DISTRIB : on crée son compte à vide —
  // le magic link sur cet e-mail le connectera directement à ce compte.
  const invitee = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email },
  });

  try {
    await prisma.projectContributor.create({
      data: { projectId, userId: invitee.id, role },
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return { error: "Cette personne contribue déjà au projet." };
    }
    throw e;
  }

  await createNotification({
    userId: invitee.id,
    type: "CONTRIBUTOR_INVITED",
    payload: { projectId, projectTitle: project.title, role },
  });

  revalidatePath(`/projects/${projectId}`);
  return undefined;
}

/** Approuve ou rejette une version (le reviewer décide pour SA part). */
export async function decideApprovalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = decideApprovalSchema.safeParse({
    approvalId: formData.get("approvalId"),
    decision: formData.get("decision"),
    comment: formData.get("comment") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const { approvalId, decision, comment } = parsed.data;

  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
    include: { version: { select: { id: true, projectId: true, status: true } } },
  });
  if (!approval) return { error: "Approbation introuvable." };
  if (approval.reviewerId !== user.id) {
    return { error: "Cette approbation ne vous est pas adressée." };
  }
  if (approval.status !== "PENDING") {
    return { error: "Vous avez déjà tranché pour cette version." };
  }
  if (approval.version.status !== "PENDING") {
    return { error: "Cette version n'est plus en attente d'approbation." };
  }

  await prisma.approval.update({
    where: { id: approvalId },
    data: { status: decision, comment: comment ?? null, decidedAt: new Date() },
  });

  if (decision === "REJECTED") {
    await rejectVersion(approval.version.id, user.id);
  } else {
    // Unanimité atteinte ? (plus aucune approbation PENDING sur la version)
    const remaining = await prisma.approval.count({
      where: { versionId: approval.version.id, status: "PENDING" },
    });
    if (remaining === 0) {
      await finalizeApprovedVersion(approval.version.id);
    }
  }

  revalidatePath(`/projects/${approval.version.projectId}`);
  return undefined;
}

/**
 * Définit la répartition des droits d'une version (somme = 100 %, validée ici
 * ET par le trigger SQL déféré). Remplace l'éventuelle répartition existante —
 * les splits ne sont pas des fichiers de vault, leur remplacement est licite.
 */
export async function setSplitsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  // Les lignes arrivent en parallèle : contributorId[i] / percentage[i] / roleLabel[i].
  const contributorIds = formData.getAll("contributorId").map(String);
  const percentages = formData.getAll("percentage").map(String);
  const roleLabels = formData.getAll("roleLabel").map(String);

  const parsed = setSplitsSchema.safeParse({
    versionId: formData.get("versionId"),
    entries: contributorIds.map((contributorId, i) => ({
      contributorId,
      percentage: percentages[i],
      roleLabel: roleLabels[i] || undefined,
    })),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Répartition invalide." };
  }
  const { versionId, entries } = parsed.data;

  const version = await prisma.version.findUnique({
    where: { id: versionId },
    include: { project: { include: { contributors: true } } },
  });
  if (!version) return { error: "Version introuvable." };

  const isMember =
    version.project.ownerId === user.id ||
    version.project.contributors.some((c) => c.userId === user.id);
  if (!isMember) return { error: "Accès refusé à ce projet." };

  // Chaque part doit viser un contributeur du projet.
  const validIds = new Set(version.project.contributors.map((c) => c.id));
  if (!entries.every((e) => validIds.has(e.contributorId))) {
    return { error: "Une part référence un contributeur étranger au projet." };
  }

  await prisma.$transaction([
    prisma.split.deleteMany({ where: { versionId } }),
    prisma.split.createMany({
      data: entries.map((e) => ({
        versionId,
        contributorId: e.contributorId,
        percentage: e.percentage,
        roleLabel: e.roleLabel ?? null,
      })),
    }),
  ]);

  revalidatePath(`/projects/${version.projectId}`);
  return undefined;
}

/** Marque toutes les notifications de l'utilisateur comme lues. */
export async function markNotificationsReadAction(): Promise<void> {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}

/** Détecte une violation de contrainte unique Prisma (P2002). */
function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "P2002"
  );
}
