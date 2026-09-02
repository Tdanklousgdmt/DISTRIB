import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { optionalEnv } from "@/lib/env";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/monthly-digest — rapport mensuel récapitulatif (droits en
// attente, échéances) envoyé à chaque utilisateur actif.
//
// À appeler 1×/jour — n'envoie réellement qu'une fois par mois civil et par
// utilisateur (vérifié via la dernière notification MONTHLY_DIGEST envoyée) :
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/monthly-digest
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const secret = optionalEnv("CRON_SECRET");
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const in30Days = new Date(now.getTime() + 30 * 86_400_000);
  const last30Days = new Date(now.getTime() - 30 * 86_400_000);

  // Utilisateurs "actifs" : propriétaires ou contributeurs d'au moins un projet.
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { ownedProjects: { some: {} } },
        { contributions: { some: {} } },
        { ownedConcerts: { some: {} } },
      ],
    },
    select: { id: true, email: true },
  });

  let sent = 0;

  for (const user of users) {
    const alreadySentThisMonth = await prisma.notification.findFirst({
      where: { userId: user.id, type: "MONTHLY_DIGEST", createdAt: { gte: monthStart } },
      select: { id: true },
    });
    if (alreadySentThisMonth) continue;

    const membership = {
      OR: [{ ownerId: user.id }, { contributors: { some: { userId: user.id } } }],
    };

    const [pendingApprovals, unsignedSplits, upcomingConcerts, recentPayments] = await Promise.all([
      prisma.approval.count({ where: { reviewerId: user.id, status: "PENDING" } }),
      prisma.split.count({
        where: { signedAt: null, contributor: { userId: user.id } },
      }),
      prisma.concert.count({
        where: { artistUserId: user.id, date: { gte: now, lte: in30Days } },
      }),
      prisma.sacemDeclaration.findMany({
        where: {
          status: "PAID",
          paidAt: { gte: last30Days },
          OR: [{ concert: { artistUserId: user.id } }, { project: membership }],
        },
        select: { amountReceivedCents: true },
      }),
    ]);

    // Rien à raconter ce mois-ci → pas de notification creuse.
    if (
      pendingApprovals === 0 &&
      unsignedSplits === 0 &&
      upcomingConcerts === 0 &&
      recentPayments.length === 0
    ) {
      continue;
    }

    const paidCents = recentPayments.reduce((s, d) => s + (d.amountReceivedCents ?? 0), 0);
    const paidLabel = (paidCents / 100).toLocaleString("fr-FR", {
      style: "currency",
      currency: "EUR",
    });

    await prisma.notification.create({
      data: {
        userId: user.id,
        type: "MONTHLY_DIGEST",
        payload: { pendingApprovals, unsignedSplits, upcomingConcerts, paidCents },
      },
    });

    await sendEmail({
      to: user.email,
      subject: "Votre récapitulatif DISTRIB du mois",
      text: [
        `${pendingApprovals} approbation${pendingApprovals > 1 ? "s" : ""} en attente de votre décision.`,
        `${unsignedSplits} répartition${unsignedSplits > 1 ? "s" : ""} en attente de votre signature.`,
        `${upcomingConcerts} concert${upcomingConcerts > 1 ? "s" : ""} dans les 30 prochains jours.`,
        `${paidLabel} perçus ces 30 derniers jours.`,
      ].join("\n"),
    });
    sent++;
  }

  return NextResponse.json({ ok: true, digestsSent: sent });
}
