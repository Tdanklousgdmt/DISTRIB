import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

// Parcours guidé — les trois gestes qui font qu'un compte devient utile :
// créer un projet, inviter un collaborateur, déposer un fichier. L'état de
// chaque étape est déduit des vraies données, rien n'est stocké à part.
export default async function OnboardingPage() {
  const user = await requireUser();

  const [ownedProjects, invitedContributors, uploadedFiles] = await Promise.all([
    prisma.project.findMany({
      where: { ownerId: user.id },
      select: { id: true, title: true },
      orderBy: { createdAt: "asc" },
      take: 1,
    }),
    prisma.projectContributor.count({
      where: { project: { ownerId: user.id }, userId: { not: user.id } },
    }),
    prisma.vaultFile.count({ where: { uploadedById: user.id } }),
  ]);

  const firstProject = ownedProjects[0] ?? null;

  const steps = [
    {
      n: 1,
      title: "Créer un espace de projet",
      detail: "Un projet = une œuvre. Choisissez un modèle si vous voulez un coup de pouce.",
      done: firstProject !== null,
      href: firstProject ? `/projects/${firstProject.id}` : "/projects",
      cta: firstProject ? `Ouvrir « ${firstProject.title} »` : "Créer mon premier projet",
    },
    {
      n: 2,
      title: "Inviter un collaborateur",
      detail: "Le geste qui change tout : la preuve vaut pour tous les contributeurs, pas juste pour vous.",
      done: invitedContributors > 0,
      href: firstProject ? `/projects/${firstProject.id}` : "/projects",
      cta: "Inviter quelqu'un",
    },
    {
      n: 3,
      title: "Déposer un premier fichier",
      detail: "Il est horodaté à la seconde où il arrive. Décrivez votre contribution : c'est votre preuve de paternité.",
      done: uploadedFiles > 0,
      href: firstProject ? `/projects/${firstProject.id}` : "/vault",
      cta: "Déposer un fichier",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Parcours guidé</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Trois gestes, et votre vault est vivant. {doneCount}/3 déjà faits.
        </p>
      </div>

      <ol className="space-y-3">
        {steps.map((s) => (
          <li
            key={s.n}
            className={
              "flex items-start gap-4 rounded-xl border p-4 " +
              (s.done
                ? "border-black/10 opacity-70 dark:border-white/10"
                : "border-black/20 dark:border-white/25")
            }
          >
            <span
              className={
                "grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-xs font-semibold " +
                (s.done
                  ? "bg-green-500/15 text-green-700 dark:text-green-400"
                  : "border border-black/20 dark:border-white/25")
              }
            >
              {s.done ? "✓" : s.n}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{s.title}</div>
              <p className="mt-0.5 text-sm text-black/60 dark:text-white/60">{s.detail}</p>
              {!s.done && (
                <Link
                  href={s.href}
                  className="mt-3 inline-block rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background"
                >
                  {s.cta} →
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>

      {doneCount === 3 && (
        <p className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-800 dark:text-green-300">
          Tout est en place. Prochaine étape naturelle : faire approuver votre version, puis
          signer la répartition — la Fiche SACEM de votre projet vous dit exactement ce qui manque.
        </p>
      )}
    </div>
  );
}
