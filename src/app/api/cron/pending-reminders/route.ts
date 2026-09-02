import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { optionalEnv } from "@/lib/env";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/pending-reminders — "bots de relance intelligents" (au-delà
// des rappels de concert) : approbations, signatures de répartition et
// déclarations SACEM en attente depuis trop longtemps.
//
// À appeler 1×/jour :
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/pending-reminders
//
// Idempotent : une seule relance par entité, détectée en cherchant une
// notification PENDING_REMINDER existante pointant vers le même id dans son
// payload (pas de nouveau champ *SentAt par entité — trop de tables concernées).
// ─────────────────────────────────────────────────────────────────────────────

const APPROVAL_DELAY_MS = 3 * 86_400_000;
const SPLIT_DELAY_MS = 3 * 86_400_000;
const DECLARATION_DELAY_MS = 5 * 86_400_000;

async function alreadyReminded(key: string, entityId: string): Promise<boolean> {
  const existing = await prisma.notification.findFirst({
    where: { type: "PENDING_REMINDER", payload: { path: [key], equals: entityId } },
    select: { id: true },
  });
  return existing !== null;
}

export async function GET(request: Request) {
  const secret = optionalEnv("CRON_SECRET");
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const now = new Date();
  let sent = 0;

  // 1. Approbations en attente.
  const staleApprovals = await prisma.approval.findMany({
    where: { status: "PENDING", createdAt: { lte: new Date(now.getTime() - APPROVAL_DELAY_MS) } },
    include: { reviewer: { select: { id: true, email: true } }, version: { include: { project: true } } },
    take: 200,
  });
  for (const a of staleApprovals) {
    if (await alreadyReminded("approvalId", a.id)) continue;
    await prisma.notification.create({
      data: {
        userId: a.reviewerId,
        type: "PENDING_REMINDER",
        payload: {
          approvalId: a.id,
          projectId: a.version.projectId,
          projectTitle: a.version.project.title,
          versionNumber: a.version.versionNumber,
        },
      },
    });
    await sendEmail({
      to: a.reviewer.email,
      subject: `Rappel — une approbation vous attend sur « ${a.version.project.title} »`,
      text: `La version ${a.version.versionNumber} de « ${a.version.project.title} » attend toujours votre décision.`,
    });
    sent++;
  }

  // 2. Répartitions non signées.
  const staleSplits = await prisma.split.findMany({
    where: { signedAt: null, createdAt: { lte: new Date(now.getTime() - SPLIT_DELAY_MS) } },
    include: {
      contributor: { include: { user: { select: { id: true, email: true } } } },
      version: { include: { project: true } },
    },
    take: 200,
  });
  for (const s of staleSplits) {
    if (await alreadyReminded("splitId", s.id)) continue;
    await prisma.notification.create({
      data: {
        userId: s.contributor.userId,
        type: "PENDING_REMINDER",
        payload: {
          splitId: s.id,
          projectId: s.version.projectId,
          projectTitle: s.version.project.title,
        },
      },
    });
    await sendEmail({
      to: s.contributor.user.email,
      subject: `Rappel — signez votre part sur « ${s.version.project.title} »`,
      text: `Votre part de répartition (${Number(s.percentage).toFixed(2)} %) sur « ${s.version.project.title} » attend votre signature.`,
    });
    sent++;
  }

  // 3. Déclarations SACEM en attente de signature.
  const staleDeclarations = await prisma.sacemDeclaration.findMany({
    where: {
      status: "PENDING_SIGNATURE",
      createdAt: { lte: new Date(now.getTime() - DECLARATION_DELAY_MS) },
    },
    include: {
      project: { select: { title: true, ownerId: true } },
      concert: { select: { venue: true, artistUserId: true } },
    },
    take: 200,
  });
  for (const d of staleDeclarations) {
    if (await alreadyReminded("declarationId", d.id)) continue;
    const userId = d.concert?.artistUserId ?? d.project?.ownerId;
    if (!userId) continue;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) continue;
    const label = d.project?.title ?? d.concert?.venue ?? "votre déclaration";
    await prisma.notification.create({
      data: {
        userId,
        type: "PENDING_REMINDER",
        payload: { declarationId: d.id, label },
      },
    });
    await sendEmail({
      to: user.email,
      subject: `Rappel — une déclaration SACEM attend votre signature (${label})`,
      text: `Votre déclaration SACEM pour « ${label} » n'a pas encore été transmise.`,
    });
    sent++;
  }

  return NextResponse.json({ ok: true, remindersSent: sent });
}
