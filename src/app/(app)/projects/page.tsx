import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { NewProjectForm } from "./NewProjectForm";

export default async function ProjectsPage() {
  const user = await requireUser();

  const projects = await prisma.project.findMany({
    where: {
      OR: [{ ownerId: user.id }, { contributors: { some: { userId: user.id } } }],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { versions: true, contributors: true } },
    },
  });

  return (
    <div className="grid gap-10 md:grid-cols-[1fr_320px]">
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Mes projets</h1>
        {projects.length === 0 ? (
          <p className="rounded-xl border border-dashed border-black/15 p-6 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
            Aucun projet pour l&apos;instant. Créez-en un pour démarrer votre vault.
          </p>
        ) : (
          <ul className="divide-y divide-black/10 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-black/[.03] dark:hover:bg-white/[.04]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.title}</div>
                    <div className="mt-0.5 text-xs text-black/50 dark:text-white/50">
                      {p.isrc ? `ISRC ${p.isrc} · ` : ""}
                      {p._count.versions} version{p._count.versions > 1 ? "s" : ""} ·{" "}
                      {p._count.contributors} contributeur
                      {p._count.contributors > 1 ? "s" : ""}
                    </div>
                  </div>
                  <span
                    className={
                      "shrink-0 rounded-full px-2 py-0.5 text-xs " +
                      (p.canPublish
                        ? "bg-green-500/15 text-green-700 dark:text-green-400"
                        : "bg-amber-500/15 text-amber-700 dark:text-amber-400")
                    }
                  >
                    {p.canPublish ? "Publiable" : "En cours"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
          Nouveau projet
        </h2>
        <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
          <NewProjectForm />
        </div>
      </aside>
    </div>
  );
}
