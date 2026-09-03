"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { registerProjectOnchain } from "@/lib/blockchain";
import { startSplitsSignatureRequest } from "@/lib/esign/service";
import {
  createNotification,
  finalizeApprovedVersion,
  rejectVersion,
  requestApprovals,
} from "@/lib/vault";
import {
  attachOwnFicheSchema,
  createProjectSchema,
  createVersionSchema,
  decideApprovalSchema,
  inviteContributorSchema,
  ipiCodeSchema,
  setSplitsSchema,
} from "@/lib/validators";
import { findProjectTemplate } from "@/lib/project-templates";

// ─────────────────────────────────────────────────────────────────────────────
// Server Actions — mutations du vault. Chaque action revérifie l'auth (les
// actions sont joignables en POST direct, pas seulement via l'UI — cf. doc Next).
// ─────────────────────────────────────────────────────────────────────────────

export type ActionState =
  | { error?: string; versionId?: string; inviteUrl?: string }
  | undefined;

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
  const template = findProjectTemplate(String(formData.get("template") ?? ""));
  redirect(`/projects/${projectId}${template ? `?template=${template.key}` : ""}`);
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
    durationSeconds: formData.get("duration") || undefined,
    depositRole: formData.get("depositRole"),
    depositRoleDetail: formData.get("depositRoleDetail") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const {
    projectId,
    description,
    parentVersionId,
    durationSeconds,
    depositRole,
    depositRoleDetail,
  } = parsed.data;

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
      durationSeconds: durationSeconds ?? null,
      depositRole,
      depositRoleDetail: depositRoleDetail ?? null,
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
  // pas besoin (ex. un formulaire qui ne lit que state?.error).
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

  // Parcours du collaborateur invité (§2.4) : un LIEN, pas seulement un compte.
  // Il découvre le projet sans être connecté, puis crée son accès pour approuver.
  let inviteToken: string;
  try {
    const contributor = await prisma.projectContributor.create({
      data: { projectId, userId: invitee.id, role, inviteToken: randomUUID() },
    });
    inviteToken = contributor.inviteToken!;
  } catch (e) {
    if (isUniqueViolation(e)) {
      return { error: "Cette personne contribue déjà au projet." };
    }
    throw e;
  }

  const base = (process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const inviteUrl = `${base}/invite/${inviteToken}`;

  await createNotification({
    userId: invitee.id,
    type: "CONTRIBUTOR_INVITED",
    payload: { projectId, projectTitle: project.title, role, inviteUrl },
  });

  // E-mail best-effort (no-op sans RESEND_API_KEY) — le lien affiché à
  // l'inviteur reste le canal principal tant que l'e-mail n'est pas provisionné.
  await sendEmail({
    to: email,
    subject: `Vous êtes invité·e à contribuer à « ${project.title} »`,
    text: `${user.name ?? user.email} vous invite sur DISTRIB pour approuver et signer votre part sur « ${project.title} ».\n\nDécouvrir le projet : ${inviteUrl}`,
  });

  revalidatePath(`/projects/${projectId}`);
  return { inviteUrl };
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

  // Une part à 0 % n'est pas un ayant droit : elle ne figure ni sur la fiche
  // ni parmi les signataires (contributeur arrivé après coup, technicien…).
  const parsed = setSplitsSchema.safeParse({
    versionId: formData.get("versionId"),
    entries: contributorIds
      .map((contributorId, i) => ({
        contributorId,
        percentage: percentages[i],
        roleLabel: roleLabels[i] || undefined,
      }))
      .filter((e) => Number(e.percentage) > 0),
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

  // Cascade d'invalidation : toute signature déjà recueillie sur cette
  // répartition devient caduque dès qu'elle est modifiée — on prévient les
  // contributeurs concernés avant de remplacer les lignes.
  const previouslySigned = await prisma.split.findMany({
    where: { versionId, signedAt: { not: null } },
    include: { contributor: { select: { userId: true } } },
  });

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

  if (previouslySigned.length > 0) {
    await Promise.all(
      previouslySigned.map((s) =>
        createNotification({
          userId: s.contributor.userId,
          type: "SPLIT_INVALIDATED",
          payload: {
            projectId: version.projectId,
            projectTitle: version.project.title,
            versionId,
            versionNumber: version.versionNumber,
          },
        }),
      ),
    );
  }

  revalidatePath(`/projects/${version.projectId}`);
  return undefined;
}

/**
 * « Adresser en signature » (fiche SACEM, écran p.66 du prototype) : enregistre
 * la répartition proposée puis ouvre une demande de signature électronique
 * (plugin esign — pilote local ou prestataire eIDAS) pour chaque contributeur.
 * Réutilise setSplitsAction — donc hérite de la cascade d'invalidation si une
 * répartition signée est modifiée.
 */
export async function sendSplitsForSignatureAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const saved = await setSplitsAction(_prev, formData);
  if (saved?.error) return saved;

  const user = await requireUser();
  const versionId = String(formData.get("versionId") ?? "");
  const version = await prisma.version.findUnique({
    where: { id: versionId },
    select: { projectId: true },
  });
  if (!version) return { error: "Version introuvable." };

  try {
    await startSplitsSignatureRequest({ versionId, requestedById: user.id });
  } catch (e) {
    console.error("[esign] ouverture de la demande échouée :", e);
    return { error: "La demande de signature n'a pas pu être ouverte." };
  }

  revalidatePath(`/projects/${version.projectId}/fiche-sacem`);
  return undefined;
}

/**
 * « Déposer ma propre fiche » : l'artiste a déjà établi sa déclaration. Le PDF
 * est versé au vault (immuable, daté) puis rattaché comme bulletin de la
 * version — DISTRIB « se charge uniquement de la faire signer et de l'archiver ».
 */
export async function attachOwnFicheAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = attachOwnFicheSchema.safeParse({
    versionId: formData.get("versionId"),
    vaultFileId: formData.get("vaultFileId"),
  });
  if (!parsed.success) return { error: "Données invalides." };
  const { versionId, vaultFileId } = parsed.data;

  const version = await prisma.version.findUnique({
    where: { id: versionId },
    include: {
      project: { include: { contributors: { select: { userId: true } } } },
      declarations: { where: { type: "OEUVRE" }, select: { id: true } },
    },
  });
  if (!version) return { error: "Version introuvable." };
  const member =
    version.project.ownerId === user.id ||
    version.project.contributors.some((c) => c.userId === user.id);
  if (!member) return { error: "Accès refusé." };
  if (version.declarations.length > 0) {
    return { error: "Cette version a déjà un bulletin de déclaration." };
  }

  const file = await prisma.vaultFile.findUnique({ where: { id: vaultFileId } });
  if (!file || file.versionId !== versionId) return { error: "Fichier introuvable." };

  await prisma.sacemDeclaration.create({
    data: {
      type: "OEUVRE",
      projectId: version.projectId,
      versionId,
      status: "PENDING_SIGNATURE",
      pdfS3Bucket: file.s3Bucket,
      pdfS3Key: file.s3Key,
    },
  });

  revalidatePath(`/projects/${version.projectId}`);
  revalidatePath(`/projects/${version.projectId}/fiche-sacem`);
  revalidatePath("/revenus");
  return undefined;
}

/**
 * Met à jour le code IPI de l'utilisateur connecté — requis par la checklist
 * de déclaration SACEM (art. L.113-3 CPI, identification des ayants droit).
 */
export async function updateMyIpiCodeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = ipiCodeSchema.safeParse(formData.get("ipiCode"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Code IPI invalide." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { ipiCode: parsed.data ?? null },
  });

  revalidatePath("/projects");
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
