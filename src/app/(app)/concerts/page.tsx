import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { NewConcertForm } from "./NewConcertForm";
import { DeclareLiveButton } from "./DeclareLiveButton";
import { DeclareSpedidamForm } from "./DeclareSpedidamForm";

const statusLabels: Record<string, { label: string; cls: string }> = {
  SCHEDULED: {
    label: "À venir",
    cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  },
  DECLARED: {
    label: "Déclaré",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  PAID: { label: "Payé", cls: "bg-green-500/15 text-green-700 dark:text-green-400" },
};

export default async function ConcertsPage() {
  const user = await requireUser();

  const [concerts, projects, programs] = await Promise.all([
    prisma.concert.findMany({
      where: { artistUserId: user.id },
      orderBy: { date: "desc" },
      include: {
        project: { select: { title: true } },
        declarations: true,
        program: { select: { name: true, reference: true } },
      },
    }),
    prisma.project.findMany({
      where: {
        OR: [{ ownerId: user.id }, { contributors: { some: { userId: user.id } } }],
      },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
    prisma.concertProgram.findMany({
      where: { artistUserId: user.id },
      select: { id: true, name: true, reference: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const now = new Date();

  return (
    <div className="grid gap-10 md:grid-cols-[1fr_340px]">
      <section className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Concerts</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Vos dates, leurs déclarations SACEM et les rappels automatiques
            (J-15, J-5, lendemain).
          </p>
        </div>

        {concerts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-black/15 p-6 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
            Aucun concert. Ajoutez votre prochaine date pour ne jamais rater une
            déclaration.
          </p>
        ) : (
          <ul className="space-y-3">
            {concerts.map((c) => {
              const status = statusLabels[c.status] ?? statusLabels.SCHEDULED;
              const isPast = c.date < now;
              const setlist = Array.isArray(c.setlist) ? (c.setlist as unknown[]) : [];
              const liveDeclaration = c.declarations.find((d) => d.type === "LIVE");
              const spedidamDeclaration = c.declarations.find(
                (d) => d.type === "SPEDIDAM_PRESENCE",
              );
              return (
                <li
                  key={c.id}
                  className="rounded-xl border border-black/10 p-4 dark:border-white/10"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">
                      {c.date.toLocaleDateString("fr-FR", {
                        weekday: "short",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}{" "}
                      — {c.venue}
                      {c.city ? `, ${c.city}` : ""}
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${status.cls}`}>
                      {status.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                    {c.project?.title ? `Projet : ${c.project.title} · ` : ""}
                    {setlist.length} titre{setlist.length > 1 ? "s" : ""} à la setlist
                    {c.estimatedAudience ? ` · jauge ~${c.estimatedAudience}` : ""}
                    {c.program && ` · programme « ${c.program.name} » (réf. ${c.program.reference})`}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-black/10 pt-3 dark:border-white/10">
                    {liveDeclaration ? (
                      <a
                        href={`/api/declarations/${liveDeclaration.id}/pdf`}
                        className="rounded-full border border-black/15 px-3 py-1 text-xs font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                      >
                        Bulletin SACEM PDF
                      </a>
                    ) : isPast || daysUntil(c.date, now) <= 30 ? (
                      <DeclareLiveButton concertId={c.id} />
                    ) : (
                      <span className="text-xs text-black/40 dark:text-white/40">
                        Déclarable à partir de J-30
                      </span>
                    )}
                    {spedidamDeclaration ? (
                      <a
                        href={`/api/declarations/${spedidamDeclaration.id}/pdf`}
                        className="rounded-full border border-black/15 px-3 py-1 text-xs font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                      >
                        Feuille SPEDIDAM — PDF
                      </a>
                    ) : (
                      <DeclareSpedidamForm concertId={c.id} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
          Nouveau concert
        </h2>
        <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
          <NewConcertForm projects={projects} programs={programs} />
        </div>
      </aside>
    </div>
  );
}

function daysUntil(date: Date, from: Date): number {
  return Math.ceil((date.getTime() - from.getTime()) / 86_400_000);
}
