import Link from "next/link";

import { resendConfigured } from "@/lib/env";
import { latestLocalMagicLink } from "@/lib/local-magic-links";

// Le lien change à chaque demande : jamais de rendu statique de cette page.
export const dynamic = "force-dynamic";

// Page affichée après l'envoi du lien magique (Auth.js `verifyRequest`).
// En mode local (pas de Resend, hors production), le lien est affiché ici
// même — sinon l'utilisateur attend un e-mail qui ne partira jamais.
export default function VerifyPage() {
  const local = !resendConfigured() ? latestLocalMagicLink() : undefined;

  if (local) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm space-y-4 text-center">
          <div className="font-mono text-2xl font-bold tracking-tight">DISTRIB</div>
          <h1 className="text-lg font-medium">Votre lien de connexion</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            Mode local : aucun e-mail n&apos;est envoyé. Voici le lien à usage unique
            généré pour <span className="font-medium">{local.email}</span>.
          </p>
          <a
            href={local.url}
            className="inline-block w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background"
          >
            Ouvrir mon lien de connexion →
          </a>
          <p className="text-[11px] text-black/40 dark:text-white/40">
            En production, ce lien arrive par e-mail — rien ne s&apos;affiche ici.
          </p>
          <Link href="/signin" className="inline-block text-xs underline">
            Changer d&apos;adresse
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm space-y-4 text-center">
        <div className="font-mono text-2xl font-bold tracking-tight">DISTRIB</div>
        <h1 className="text-lg font-medium">Vérifiez votre boîte mail</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Un lien de connexion à usage unique vient de vous être envoyé. Ouvrez-le sur
          cet appareil pour accéder à votre vault.
        </p>
        <Link href="/signin" className="inline-block text-xs underline">
          Renvoyer un lien
        </Link>
      </div>
    </div>
  );
}
