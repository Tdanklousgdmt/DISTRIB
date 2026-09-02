"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { createSignatureRequest } from "@/lib/yousign";
import { renderDeclarationPdf } from "@/lib/declarations";
import { buildSacemChecklist } from "@/lib/sacem-checklist";
import {
  createConcertSchema,
  markDeclarationPaidSchema,
} from "@/lib/validators";
import type { ActionState } from "./actions";

// ─────────────────────────────────────────────────────────────────────────────
// Server Actions Sprint 4 — concerts & déclarations SACEM.
// ─────────────────────────────────────────────────────────────────────────────

/** Crée un concert (à venir) pour l'artiste connecté. */
export async function createConcertAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = createConcertSchema.safeParse({
    date: formData.get("date"),
    venue: formData.get("venue"),
    city: formData.get("city") ?? "",
    country: formData.get("country") ?? "",
    estimatedAudience: formData.get("estimatedAudience") || undefined,
    setlist: formData.get("setlist") ?? "",
    projectId: formData.get("projectId") ?? "",
    programId: formData.get("programId") ?? "",
    saveAsProgram: formData.get("saveAsProgram") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const data = parsed.data;

  // Si un projet est lié, vérifier qu'il appartient bien à l'utilisateur.
  if (data.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
      include: { contributors: { select: { userId: true } } },
    });
    const member =
      project &&
      (project.ownerId === user.id ||
        project.contributors.some((c) => c.userId === user.id));
    if (!member) return { error: "Projet introuvable ou accès refusé." };
  }

  // Programme-type réutilisable : soit on rattache un programme existant (et
  // sa setlist pré-remplit la date si aucune setlist saisie ici), soit on
  // enregistre cette setlist comme nouveau programme réutilisable.
  let programId = data.programId ?? null;
  let setlist = data.setlist;
  if (programId) {
    const program = await prisma.concertProgram.findUnique({ where: { id: programId } });
    if (!program || program.artistUserId !== user.id) {
      return { error: "Programme introuvable." };
    }
    if (setlist.length === 0 && Array.isArray(program.setlist)) {
      setlist = program.setlist as string[];
    }
  } else if (data.saveAsProgram) {
    const program = await prisma.concertProgram.create({
      data: { artistUserId: user.id, name: data.saveAsProgram, setlist },
    });
    programId = program.id;
  }

  await prisma.concert.create({
    data: {
      artistUserId: user.id,
      projectId: data.projectId ?? null,
      programId,
      date: data.date,
      venue: data.venue,
      city: data.city ?? null,
      country: data.country ?? null,
      estimatedAudience: data.estimatedAudience ?? null,
      setlist,
    },
  });

  revalidatePath("/concerts");
  return undefined;
}

/**
 * Déclare un concert à la SACEM : génère le bulletin live, crée la
 * SacemDeclaration et — si Yousign est provisionné — lance la signature eIDAS.
 */
export async function declareLiveAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const concertId = String(formData.get("concertId") ?? "");

  const concert = await prisma.concert.findUnique({
    where: { id: concertId },
    include: { declarations: true, artist: true },
  });
  if (!concert) return { error: "Concert introuvable." };
  if (concert.artistUserId !== user.id) return { error: "Accès refusé." };
  if (concert.declarations.some((d) => d.type === "LIVE")) {
    return { error: "Ce concert est déjà déclaré." };
  }

  const declaration = await prisma.sacemDeclaration.create({
    data: {
      type: "LIVE",
      concertId: concert.id,
      projectId: concert.projectId,
      status: "PENDING_SIGNATURE",
    },
  });

  await prisma.concert.update({
    where: { id: concert.id },
    data: { status: "DECLARED" },
  });

  // Signature eIDAS si provisionnée — sinon l'artiste signe le PDF à la main.
  const pdf = await renderDeclarationPdf(declaration.id);
  if (pdf) {
    const yousignId = await createSignatureRequest({
      pdfBytes: pdf.bytes,
      filename: pdf.filename,
      signerEmail: concert.artist.email,
      signerName: concert.artist.name,
    });
    if (yousignId) {
      await prisma.sacemDeclaration.update({
        where: { id: declaration.id },
        data: { sacemReference: null, submittedAt: null },
      });
    }
  }

  revalidatePath("/concerts");
  revalidatePath("/revenus");
  return undefined;
}

/** Déclare une œuvre (version approuvée) : bulletin + signature si dispo. */
export async function declareOeuvreAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const versionId = String(formData.get("versionId") ?? "");

  const version = await prisma.version.findUnique({
    where: { id: versionId },
    include: {
      project: { include: { contributors: { select: { userId: true } } } },
      splits: true,
      declarations: { where: { type: "OEUVRE" } },
    },
  });
  if (!version) return { error: "Version introuvable." };

  const member =
    version.project.ownerId === user.id ||
    version.project.contributors.some((c) => c.userId === user.id);
  if (!member) return { error: "Accès refusé." };

  if (version.declarations.length > 0) {
    return { error: "Cette version est déjà déclarée." };
  }

  const checklist = await buildSacemChecklist(version.id);
  if (!checklist || !checklist.ready) {
    const firstMissing = checklist?.items.find((i) => i.blocking && !i.ok);
    return {
      error: firstMissing
        ? `Checklist incomplète — ${firstMissing.label.toLowerCase()}. Voir la Fiche SACEM du projet.`
        : "Checklist de déclaration incomplète.",
    };
  }

  const declaration = await prisma.sacemDeclaration.create({
    data: {
      type: "OEUVRE",
      projectId: version.projectId,
      versionId: version.id,
      status: "PENDING_SIGNATURE",
    },
  });

  const me = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const pdf = await renderDeclarationPdf(declaration.id);
  if (pdf) {
    await createSignatureRequest({
      pdfBytes: pdf.bytes,
      filename: pdf.filename,
      signerEmail: me.email,
      signerName: me.name,
    });
  }

  revalidatePath(`/projects/${version.projectId}`);
  revalidatePath("/revenus");
  return undefined;
}

/**
 * Attestation ADAMI (participation à l'enregistrement) — dérivée des
 * contributeurs d'une version approuvée à l'unanimité, comme les
 * déclarations SACEM. Une seule attestation par version.
 */
export async function declareAdamiAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const versionId = String(formData.get("versionId") ?? "");

  const version = await prisma.version.findUnique({
    where: { id: versionId },
    include: {
      project: { include: { contributors: { select: { userId: true } } } },
      declarations: { where: { type: "ADAMI_ATTESTATION" } },
    },
  });
  if (!version) return { error: "Version introuvable." };

  const member =
    version.project.ownerId === user.id ||
    version.project.contributors.some((c) => c.userId === user.id);
  if (!member) return { error: "Accès refusé." };
  if (version.status !== "APPROVED") {
    return { error: "Seule une version approuvée à l'unanimité peut donner lieu à une attestation." };
  }
  if (version.declarations.length > 0) {
    return { error: "Une attestation ADAMI existe déjà pour cette version." };
  }

  await prisma.sacemDeclaration.create({
    data: {
      type: "ADAMI_ATTESTATION",
      projectId: version.projectId,
      versionId: version.id,
      status: "PENDING_SIGNATURE",
    },
  });

  revalidatePath(`/projects/${version.projectId}`);
  return undefined;
}

/**
 * Feuille de présence SPEDIDAM pour un concert — la liste des musiciens
 * présents est saisie ici (une ligne "Nom - Rôle") et conservée sur le
 * concert pour les dates suivantes qui réutilisent le même programme.
 */
export async function declareSpedidamAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const concertId = String(formData.get("concertId") ?? "");
  const performersRaw = String(formData.get("performers") ?? "");

  const performers = performersRaw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((line) => {
      const [name, ...rest] = line.split("-").map((s) => s.trim());
      return { name: name || line, role: rest.join("-") || "Musicien" };
    });

  const concert = await prisma.concert.findUnique({
    where: { id: concertId },
    include: { declarations: true },
  });
  if (!concert) return { error: "Concert introuvable." };
  if (concert.artistUserId !== user.id) return { error: "Accès refusé." };
  if (concert.declarations.some((d) => d.type === "SPEDIDAM_PRESENCE")) {
    return { error: "Une feuille de présence existe déjà pour ce concert." };
  }

  await prisma.$transaction([
    prisma.concert.update({ where: { id: concertId }, data: { performers } }),
    prisma.sacemDeclaration.create({
      data: {
        type: "SPEDIDAM_PRESENCE",
        concertId,
        status: "PENDING_SIGNATURE",
      },
    }),
  ]);

  revalidatePath("/concerts");
  return undefined;
}

/** Marque une déclaration comme transmise à la SACEM (référence optionnelle). */
export async function markDeclarationTransmittedAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const declarationId = String(formData.get("declarationId") ?? "");
  const reference = String(formData.get("reference") ?? "").trim() || null;

  const { canAccessDeclaration } = await import("@/lib/declarations");
  if (!(await canAccessDeclaration(declarationId, user.id))) {
    return { error: "Accès refusé." };
  }

  await prisma.sacemDeclaration.update({
    where: { id: declarationId },
    data: { status: "TRANSMITTED", submittedAt: new Date(), sacemReference: reference },
  });

  revalidatePath("/revenus");
  return undefined;
}

/** Enregistre un paiement SACEM reçu (saisie manuelle — MVP). */
export async function markDeclarationPaidAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = markDeclarationPaidSchema.safeParse({
    declarationId: formData.get("declarationId"),
    amountEuros: formData.get("amountEuros"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Montant invalide." };
  }
  const { declarationId, amountEuros } = parsed.data;

  const { canAccessDeclaration } = await import("@/lib/declarations");
  if (!(await canAccessDeclaration(declarationId, user.id))) {
    return { error: "Accès refusé." };
  }

  const declaration = await prisma.sacemDeclaration.update({
    where: { id: declarationId },
    data: {
      status: "PAID",
      paidAt: new Date(),
      amountReceivedCents: Math.round(amountEuros * 100),
    },
  });

  // Concert lié → statut PAID + notification.
  if (declaration.concertId) {
    await prisma.concert.update({
      where: { id: declaration.concertId },
      data: { status: "PAID" },
    });
  }
  await prisma.notification.create({
    data: {
      userId: user.id,
      type: "PAYMENT_RECEIVED",
      payload: { declarationId, amountCents: Math.round(amountEuros * 100) },
    },
  });

  revalidatePath("/revenus");
  revalidatePath("/concerts");
  return undefined;
}
