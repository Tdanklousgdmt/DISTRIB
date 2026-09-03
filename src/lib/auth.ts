import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Resend from "next-auth/providers/resend";

import { prisma } from "@/lib/prisma";
import { optionalEnv, resendConfigured } from "@/lib/env";
import { rememberLocalMagicLink } from "@/lib/local-magic-links";

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
      // Sans RESEND_API_KEY (dev 100 % local), le lien magique est affiché
      // dans la console du serveur au lieu d'être envoyé par e-mail.
      async sendVerificationRequest({ identifier, url, provider }) {
        if (!resendConfigured()) {
          // Affiché aussi sur /verify (hors production) — voir local-magic-links.
          rememberLocalMagicLink(identifier, url);
          console.log(
            "\n──────────────────────────────────────────────────\n" +
              `🔑 LIEN MAGIQUE (mode local, pas d'e-mail envoyé)\n` +
              `   Destinataire : ${identifier}\n` +
              `   ${url}\n` +
              "──────────────────────────────────────────────────\n",
          );
          return;
        }
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: provider.from,
            to: [identifier],
            subject: "Votre lien de connexion DISTRIB",
            text: `Connectez-vous à DISTRIB : ${url}\n\nCe lien expire dans 24 h. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`,
          }),
        });
        if (!res.ok) {
          throw new Error(`Resend a répondu ${res.status} : ${await res.text()}`);
        }
      },
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
