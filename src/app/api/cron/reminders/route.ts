import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { optionalEnv } from "@/lib/env";
import type { NotificationType } from "@/generated/prisma/enums";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/reminders — rappels concerts J-15 / J-5 / J+1 (Sprint 4).
//
// À appeler 1×/jour (cron Railway, GitHub Actions, cron-job.org…) :
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/reminders
//
// Idempotent : chaque rappel n'est envoyé qu'une fois (reminderJxSentAt).
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

interface ReminderRule {
  type: NotificationType;
  field: "reminderJ15SentAt" | "reminderJ5SentAt" | "reminderJ1SentAt";
  /** Le rappel se déclenche quand date - now <= seuil (en jours). J+1 → négatif. */
  thresholdDays: number;
  subject: (venue: string, dateStr: string) => string;
  body: (venue: string, dateStr: string) => string;
}

const RULES: ReminderRule[] = [
  {
    type: "CONCERT_REMINDER_J15",
    field: "reminderJ15SentAt",
    thresholdDays: 15,
    subject: (v, d) => `J-15 — pensez à préparer la déclaration SACEM (${v}, ${d})`,
    body: (v, d) =>
      `Votre concert au ${v} a lieu le ${d}. Préparez votre setlist dans DISTRIB pour générer le programme SACEM en un clic.`,
  },
  {
    type: "CONCERT_REMINDER_J5",
    field: "reminderJ5SentAt",
    thresholdDays: 5,
    subject: (v, d) => `J-5 — votre concert approche (${v}, ${d})`,
    body: (v, d) =>
      `Plus que quelques jours avant votre date au ${v} (${d}). Vérifiez votre setlist — la déclaration n'attendra que votre signature.`,
  },
  {
    type: "CONCERT_REMINDER_J1",
    field: "reminderJ1SentAt",
    thresholdDays: -1, // lendemain du concert
    subject: (v, d) => `Et maintenant, déclarez ! (${v}, ${d})`,
    body: (v, d) =>
      `Votre concert au ${v} (${d}) est passé. Déclarez-le à la SACEM depuis DISTRIB pour percevoir vos droits.`,
  },
];

export async function GET(request: Request) {
  const secret = optionalEnv("CRON_SECRET");
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const now = new Date();
  let sent = 0;

  for (const rule of RULES) {
    // Concerts à venir (ou passés pour J+1) dont CE rappel n'a pas été envoyé.
    const horizon = new Date(now.getTime() + rule.thresholdDays * DAY_MS);
    const concerts = await prisma.concert.findMany({
      where: {
        [rule.field]: null,
        status: "SCHEDULED",
        // J-15/J-5 : date <= now+seuil ET date > now. J+1 : date < now-1j... simplifié :
        date:
          rule.thresholdDays >= 0
            ? { lte: horizon, gt: now }
            : { lte: new Date(now.getTime() - DAY_MS) },
      },
      include: { artist: { select: { id: true, email: true } } },
      take: 200,
    });

    for (const concert of concerts) {
      const dateStr = concert.date.toLocaleDateString("fr-FR");
      await prisma.$transaction([
        prisma.notification.create({
          data: {
            userId: concert.artist.id,
            type: rule.type,
            payload: { concertId: concert.id, venue: concert.venue, date: dateStr },
          },
        }),
        prisma.concert.update({
          where: { id: concert.id },
          data: { [rule.field]: now },
        }),
      ]);
      // E-mail best-effort (no-op sans RESEND_API_KEY).
      await sendEmail({
        to: concert.artist.email,
        subject: rule.subject(concert.venue, dateStr),
        text: rule.body(concert.venue, dateStr),
      });
      sent++;
    }
  }

  return NextResponse.json({ ok: true, remindersSent: sent });
}
