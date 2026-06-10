import { redirect } from "next/navigation";

import { signIn, auth } from "@/lib/auth";
import { resendConfigured } from "@/lib/env";

// Connexion par lien magique (non-négo #5 : pas de mot de passe, zéro friction).
export default async function SignInPage() {
  // Déjà connecté → dashboard.
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  async function sendMagicLink(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    if (!email) return;
    // Auth.js envoie le lien et redirige vers la page verifyRequest (/verify).
    await signIn("resend", { email, redirectTo: "/dashboard" });
  }

  const configured = resendConfigured();

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="font-mono text-2xl font-bold tracking-tight">DISTRIB</div>
          <p className="mt-2 text-sm text-black/60 dark:text-white/60">
            Protégez vos droits musicaux. Connectez-vous pour accéder à votre vault.
          </p>
        </div>

        {!configured && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Envoi d&apos;e-mails non configuré (RESEND_API_KEY manquant). Renseignez-le
            dans <code>.env.local</code> pour recevoir le lien.
          </p>
        )}

        <form action={sendMagicLink} className="space-y-3">
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="vous@exemple.com"
            className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-foreground dark:border-white/20"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background"
          >
            Recevoir mon lien de connexion
          </button>
        </form>

        <p className="text-center text-xs text-black/40 dark:text-white/40">
          Un lien à usage unique vous sera envoyé par e-mail.
        </p>
      </div>
    </div>
  );
}
