import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Resend from "next-auth/providers/resend";

import { prisma } from "@/lib/prisma";
import { optionalEnv } from "@/lib/env";

// ─────────────────────────────────────────────────────────────────────────────
// Auth.js v5 (NextAuth beta) — magic link e-mail via Resend, sessions en base.
//
// Non-négo #5 : l'artiste ne voit aucune complexité technique. L'auth se limite
// à « entrez votre e-mail » → lien magique. Pas de mot de passe, pas de wallet.
// ─────────────────────────────────────────────────────────────────────────────

export const authConfig = {
  adapter: PrismaAdapter(prisma),
  // Derrière le proxy Railway, l'hôte est transmis via X-Forwarded-Host.
  trustHost: true,
  // Sessions en base (et non JWT) : on s'appuie sur le Prisma adapter et les
  // tables Session / VerificationToken déjà présentes dans le schéma.
  session: { strategy: "database" },
  pages: {
    signIn: "/signin",
    verifyRequest: "/verify",
  },
  providers: [
    Resend({
      apiKey: optionalEnv("RESEND_API_KEY") ?? "re_placeholder",
      from: optionalEnv("EMAIL_FROM") ?? "DISTRIB <noreply@example.com>",
    }),
  ],
  callbacks: {
    // Expose l'id utilisateur dans la session pour les requêtes Prisma côté serveur.
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
