import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { buildSacemChecklist } from "@/lib/sacem-checklist";
import { IpiCodeForm } from "./IpiCodeForm";

const roleLabels: Record<string, string> = {
  ARTIST: "Artiste",
  CO_AUTHOR: "Co-auteur",
  BEATMAKER: "Beatmaker",
  CO_BEATMAKER: "Co-beatmaker",
};

export default async function FicheSacemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      contributors: { include: { user: { select: { id: true, email: true, name: true, ipiCode: true } } } },
      versions: {
        where: { isCurrent: true },
        include: { declarations: { where: { type: "OEUVRE" }, select: { id: true, status: true } } },
      },
    },
  });
  if (!project) notFound();

  const authorized =
    project.ownerId === user.id || project.contributors.some((c) => c.userId === user.id);
  if (!authorized) notFound();

  const currentVersion = project.versions[0] ?? null;
  const checklist = currentVersion ? await buildSacemChecklist(currentVersion.id) : null;
  const declaration = currentVersion?.declarations[0] ?? null;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/projects/${project.id}`}
          className="text-xs text-black/50 hover:underline dark:text-white/50"
        >
          ← {project.title}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Fiche SACEM</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Résumé déduit des attestations validées — modifiable, jamais déposé automatiquement.
          « Déclarable » ne veut pas dire « déclaré » : c&apos;est toujours vous qui transmettez.
        </p>
      </div>

      {!currentVersion ? (
        <p className="rounded-xl border border-dashed border-black/15 p-6 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
          Aucune version courante pour l&apos;instant — la fiche se remplit dès qu&apos;une version
          est approuvée à l&apos;unanimité.
        </p>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
              Checklist de déclaration — Version {currentVersion.versionNumber}
            </h2>
            {declaration ? (
              <a href={`/api/declarations/${declaration.id}/pdf`} className="text-xs underline">
                Bulletin déjà généré →
              </a>
            ) : (
              <span
                className={
                  "rounded-full px-2 py-0.5 text-xs " +
                  (checklist?.ready
                    ? "bg-green-500/15 text-green-700 dark:text-green-400"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-400")
                }
              >
                {checklist?.ready ? "Déclaration-ready" : "Incomplète"}
              </span>
            )}
          </div>

          <ul className="divide-y divide-black/10 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
            {checklist?.items.map((item) => (
              <li key={item.key} className="flex items-start gap-3 px-4 py-3 text-sm">
                <span
                  className={
                    "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] " +
                    (item.ok
                      ? "bg-green-500/15 text-green-700 dark:text-green-400"
                      : item.blocking
                        ? "bg-red-500/15 text-red-700 dark:text-red-400"
                        : "bg-black/5 text-black/40 dark:bg-white/10 dark:text-white/40")
                  }
                >
                  {item.ok ? "✓" : item.blocking ? "!" : "–"}
                </span>
                <div className="min-w-0">
                  <div>
                    {item.label}
                    {!item.blocking && (
                      <span className="ml-1.5 text-xs text-black/40 dark:text-white/40">
                        (facultatif)
                      </span>
                    )}
                  </div>
                  {item.detail && (
                    <p className="mt-0.5 text-xs text-black/50 dark:text-white/50">{item.detail}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
          Codes IPI des contributeurs
        </h2>
        <ul className="divide-y divide-black/10 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
          {project.contributors.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0 truncate">
                {c.user.name ?? c.user.email}
                <span className="ml-1.5 text-xs text-black/40 dark:text-white/40">
                  ({roleLabels[c.role] ?? c.role})
                </span>
              </span>
              {c.user.id === user.id ? (
                <IpiCodeForm currentValue={c.user.ipiCode} />
              ) : c.user.ipiCode ? (
                <span className="font-mono text-xs">{c.user.ipiCode}</span>
              ) : (
                <span className="text-xs text-amber-700 dark:text-amber-400">Non renseigné</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
