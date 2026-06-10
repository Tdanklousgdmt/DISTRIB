import Link from "next/link";

// Page affichée après l'envoi du lien magique (Auth.js `verifyRequest`).
export default function VerifyPage() {
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
