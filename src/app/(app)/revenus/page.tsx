import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { DeclarationRowActions } from "./DeclarationRowActions";

const statusLabels: Record<string, string> = {
  PENDING_SIGNATURE: "À signer",
  SIGNED: "Signée",
  TRANSMITTED: "Transmise",
  PAID: "Payée",
};

function euros(cents: number | null): string {
  return cents == null
    ? "—"
    : (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export default async function RevenusPage() {
  const user = await requireUser();

  // Déclarations visibles : projets dont je suis membre + mes concerts.
  const declarations = await prisma.sacemDeclaration.findMany({
    where: {
      OR: [
        { concert: { artistUserId: user.id } },
        { project: { ownerId: user.id } },
        { project: { contributors: { some: { userId: user.id } } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { title: true } },
      version: { select: { versionNumber: true } },
      concert: { select: { date: true, venue: true, city: true } },
    },
  });

  const paid = declarations.filter((d) => d.status === "PAID");
  const totalCents = paid.reduce((s, d) => s + (d.amountReceivedCents ?? 0), 0);
  const oeuvreCents = paid
    .filter((d) => d.type === "OEUVRE")
    .reduce((s, d) => s + (d.amountReceivedCents ?? 0), 0);
  const liveCents = totalCents - oeuvreCents;
  const pendingCount = declarations.filter((d) => d.status !== "PAID").length;

  const stats = [
    { label: "Total perçu", value: euros(totalCents) },
    { label: "Droits d'auteur (œuvres)", value: euros(oeuvreCents) },
    { label: "Droits live (concerts)", value: euros(liveCents) },
    { label: "Déclarations en cours", value: String(pendingCount) },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Revenus</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Vue unifiée de vos déclarations SACEM et des paiements reçus.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-black/10 p-4 dark:border-white/10"
          >
            <div className="text-xl font-semibold tabular-nums">{s.value}</div>
            <div className="mt-1 text-xs text-black/60 dark:text-white/60">{s.label}</div>
          </div>
        ))}
      </div>

      {declarations.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/15 p-6 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
          Aucune déclaration pour l&apos;instant. Déclarez une œuvre depuis la page d&apos;un
          projet (version approuvée) ou un concert depuis la page Concerts.
        </p>
      ) : (
        <ul className="divide-y divide-black/10 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
          {declarations.map((d) => (
            <li key={d.id} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 text-sm font-medium">
                  {d.type === "OEUVRE"
                    ? `Œuvre — ${d.project?.title ?? "?"}${
                        d.version ? ` (v${d.version.versionNumber})` : ""
                      }`
                    : `Live — ${d.concert?.venue ?? "?"}${
                        d.concert?.city ? `, ${d.concert.city}` : ""
                      } le ${d.concert?.date.toLocaleDateString("fr-FR") ?? "?"}`}
                </div>
                <div className="flex items-center gap-2">
                  {d.amountReceivedCents != null && (
                    <span className="font-mono text-sm tabular-nums">
                      {euros(d.amountReceivedCents)}
                    </span>
                  )}
                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs dark:bg-white/10">
                    {statusLabels[d.status] ?? d.status}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={`/api/declarations/${d.id}/pdf`}
                  className="text-xs underline"
                >
                  Bulletin PDF
                </a>
                {d.sacemReference && (
                  <span className="text-xs text-black/40 dark:text-white/40">
                    Réf. {d.sacemReference}
                  </span>
                )}
                <DeclarationRowActions declarationId={d.id} status={d.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
