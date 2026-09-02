import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

const features = [
  {
    title: "Vault immuable",
    body: "Chaque fichier est horodaté, hashé (SHA-256) et verrouillé — aucune suppression possible, jamais.",
  },
  {
    title: "Preuve d'antériorité",
    body: "Vos dépôts sont ancrés on-chain. Une preuve juridique de paternité, sans que vous touchiez à la blockchain.",
  },
  {
    title: "SACEM automatisée",
    body: "Déclarations d'œuvres et de concerts générées et transmises pour vous (à venir).",
  },
];

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <span className="font-mono text-lg font-bold tracking-tight">DISTRIB</span>
        <Link
          href="/signin"
          className="rounded-full border border-black/15 px-4 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Se connecter
        </Link>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6">
        <section className="py-20 sm:py-28">
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Protégez vos droits musicaux, sans la complexité.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-black/60 dark:text-white/60">
            DISTRIB sécurise vos créations dès l&apos;upload : vault immuable, preuve
            d&apos;antériorité et déclarations automatiques. Vous créez, on protège.
          </p>
          <p className="mt-3 max-w-xl text-sm text-black/50 dark:text-white/50">
            Preuve et gestion de vos droits — pas de distribution. Votre distributeur reste le
            vôtre.
          </p>
          <div className="mt-8 flex items-center gap-4">
            <Link
              href="/signin"
              className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background"
            >
              Démarrer
            </Link>
            <Link href="/faq" className="text-sm underline">
              Ce que DISTRIB fait (et ne fait pas)
            </Link>
          </div>
        </section>

        <section className="grid gap-6 pb-24 sm:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-black/10 p-5 dark:border-white/10"
            >
              <h2 className="font-medium">{f.title}</h2>
              <p className="mt-2 text-sm text-black/60 dark:text-white/60">{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-black/10 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-6 py-6 text-xs text-black/40 dark:text-white/40">
          <span>DISTRIB — protection des droits musicaux pour artistes indépendants.</span>
          <Link href="/faq" className="underline">
            Aide
          </Link>
          <Link href="/cgu" className="underline">
            CGU
          </Link>
          <Link href="/confidentialite" className="underline">
            Données personnelles
          </Link>
        </div>
      </footer>
    </div>
  );
}
