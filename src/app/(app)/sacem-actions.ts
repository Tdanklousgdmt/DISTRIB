"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { createSignatureRequest } from "@/lib/yousign";
import { renderDeclarationPdf } from "@/lib/declarations";
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

  await prisma.concert.create({
    data: {
      artistUserId: user.id,
      projectId: data.projectId ?? null,
      date: data.date,
      venue: data.venue,
      city: data.city ?? null,
      country: data.country ?? null,
      estimatedAudience: data.estimatedAudience ?? null,
      setlist: data.setlist,
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
    include: { declaration: true, artist: true },
  });
  if (!concert) return { error: "Concert introuvable." };
  if (concert.artistUserId !== user.id) return { error: "Accès refusé." };
  if (concert.declaration) return { error: "Ce concert est déjà déclaré." };

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

  if (version.status !== "APPROVED") {
    return { error: "Seule une version approuvée à l'unanimité peut être déclarée." };
  }
  if (version.splits.length === 0) {
    return { error: "Définissez la répartition des droits avant de déclarer l'œuvre." };
  }
  if (version.declarations.length > 0) {
    return { error: "Cette version est déjà déclarée." };
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
