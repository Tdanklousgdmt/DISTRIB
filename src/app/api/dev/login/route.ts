import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────────────────────
// Connexion directe pour le développement local — contourne le lien magique
// par e-mail (utile tant que Resend n'est pas provisionné).
//
// Verrouillage dur : cette route ne fonctionne QUE si NODE_ENV !== "production".
// Ce n'est pas une option désactivable par variable d'environnement — le check
// porte sur NODE_ENV lui-même, qui vaut "production" pour tout build/déploiement
// réel (Railway inclus). Impossible à activer par erreur en prod.
// ─────────────────────────────────────────────────────────────────────────────

const bodySchema = z.object({ email: z.string().trim().toLowerCase().email() });

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Non disponible." }, { status: 404 });
  }

  const form = await request.formData();
  const parsed = bodySchema.safeParse({ email: form.get("email") });
  if (!parsed.success) {
    return NextResponse.json({ error: "E-mail invalide." }, { status: 400 });
  }
  const { email } = parsed.data;

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email },
  });

  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 jours, comme la session par défaut d'Auth.js
  const session = await prisma.session.create({
    data: { sessionToken: randomUUID(), userId: user.id, expires },
  });

  const res = NextResponse.redirect(new URL("/dashboard", request.url), { status: 303 });
  res.cookies.set("authjs.session-token", session.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires,
  });
  return res;
}
