import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

// Couleur déterministe pour la tuile d'un projet — même palette pour un même
// titre à chaque rendu, sans dépendre d'un champ "couleur" en base.
const TILE_COLORS = ["#2E3350", "#2E5043", "#5A3A2E", "#3E3A63", "#3E5A63", "#5A2E3E"];
function tileColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return TILE_COLORS[hash % TILE_COLORS.length];
}
function initials(title: string): string {
  const words = title.trim().split(/\s+/);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "??";
}

function euros(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

const declarationLabel: Record<string, string> = {
  PENDING_SIGNATURE: "À signer",
  SIGNED: "Signée",
  TRANSMITTED: "Transmise",
  PAID: "Payée",
};

const declarationTypeLabel: Record<string, string> = {
  OEUVRE: "Œuvre",
  LIVE: "Live",
  ADAMI_ATTESTATION: "Attestation ADAMI",
  SPEDIDAM_PRESENCE: "Présence SPEDIDAM",
};

export default async function DashboardPage() {
  const user = await requireUser();
  const membership = {
    OR: [{ ownerId: user.id }, { contributors: { some: { userId: user.id } } }],
  };

  const [projects, fileCount, anchoredCount, pendingApprovals, declarations] = await Promise.all([
    prisma.project.findMany({
      where: membership,
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: { _count: { select: { versions: true, contributors: true } } },
    }),
    prisma.vaultFile.count({ where: { version: { project: membership } } }),
    prisma.vaultFile.count({ where: { version: { project: membership }, polygonTxHash: { not: null } } }),
    prisma.approval.count({ where: { reviewerId: user.id, status: "PENDING" } }),
    prisma.sacemDeclaration.findMany({
      where: {
        OR: [
          { concert: { artistUserId: user.id } },
          { project: membership },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 4,
      include: {
        project: { select: { title: true } },
        version: { select: { versionNumber: true } },
        concert: { select: { date: true, venue: true, city: true } },
      },
    }),
  ]);

  const projectCount = await prisma.project.count({ where: membership });
  const publishableCount = await prisma.project.count({ where: { ...membership, canPublish: true } });

  // Parcours guidé : proposé tant que les 3 gestes fondateurs ne sont pas faits.
  // Collaborateur invité : quelqu'un qui n'a créé aucun projet mais a une
  // approbation en attente — on l'accueille avant de le noyer dans le dashboard.
  const [ownedCount, invitedCount] = await Promise.all([
    prisma.project.count({ where: { ownerId: user.id } }),
    prisma.projectContributor.count({
      where: { project: { ownerId: user.id }, userId: { not: user.id } },
    }),
  ]);
  const onboardingDone = ownedCount > 0 && invitedCount > 0 && fileCount > 0;
  const isInvitedNewcomer = ownedCount === 0 && pendingApprovals > 0;
  const invitedProject = isInvitedNewcomer ? projects[0] : null;
  const totalReceivedCents = declarations
    .filter((d) => d.status === "PAID")
    .reduce((s, d) => s + (d.amountReceivedCents ?? 0), 0);

  const stats = [
    {
      label: "Projets actifs",
      value: projectCount,
      detail: `${publishableCount} publiable${publishableCount > 1 ? "s" : ""}`,
      href: "/projects",
    },
    {
      label: "Fichiers protégés",
      value: fileCount,
      detail: `${anchoredCount} ancré${anchoredCount > 1 ? "s" : ""} on-chain`,
      href: "/vault",
    },
    {
      label: "Approbations en attente",
      value: pendingApprovals,
      detail: pendingApprovals > 0 ? "Votre validation est attendue" : "Rien à traiter",
      warn: pendingApprovals > 0,
    },
    {
      label: "Perçu (déclarations affichées)",
      value: euros(totalReceivedCents),
      detail: "Voir le détail par source",
      href: "/revenus",
    },
  ];

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Vue d&apos;ensemble de votre vault protégé.
        </p>
      </div>

      {invitedProject && (
        <div className="rounded-xl border border-black/20 p-5 dark:border-white/25">
          <h2 className="font-medium">Bienvenue — on vous attend sur « {invitedProject.title} »</h2>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Quelqu&apos;un vous a invité·e à contribuer. Il vous reste une chose à faire :
            approuver (ou refuser) la version déposée. Vous pourrez créer vos propres projets
            ensuite.
          </p>
          <Link
            href={`/projects/${invitedProject.id}`}
            className="mt-4 inline-block rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            Voir ce qui m&apos;attend →
          </Link>
        </div>
      )}

      {!onboardingDone && !invitedProject && (
        <Link
          href="/onboarding"
          className="block rounded-xl border border-dashed border-black/20 p-4 text-sm hover:border-black/40 dark:border-white/25 dark:hover:border-white/50"
        >
          <span className="font-medium">Parcours guidé →</span>
          <span className="ml-2 text-black/50 dark:text-white/50">
            Trois gestes pour rendre votre vault vivant : projet, collaborateur, fichier.
          </span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-black/10 p-4 dark:border-white/10">
            <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
            <div className="mt-1 text-xs text-black/60 dark:text-white/60">{s.label}</div>
            <div
              className={
                "mt-1.5 text-xs " +
                (s.warn ? "text-amber-600 dark:text-amber-400" : "text-black/40 dark:text-white/40")
              }
            >
              {s.detail}
            </div>
            {s.href && (
              <Link href={s.href} className="mt-2 inline-block text-xs underline">
                Voir tout →
              </Link>
            )}
          </div>
        ))}
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
            Mes projets
          </h2>
          <Link href="/projects" className="text-xs underline">
            Tous les projets →
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/15 p-6 dark:border-white/15">
            <h3 className="font-medium">Protégez votre prochaine création</h3>
            <p className="mt-1 text-sm text-black/60 dark:text-white/60">
              Créez un projet, déposez vos fichiers (WAV, projets DAW, paroles) — ils sont
              horodatés et rendus immuables dès l&apos;upload.
            </p>
            <Link
              href="/projects"
              className="mt-4 inline-block rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
            >
              Nouveau projet
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex flex-col gap-4 rounded-xl border border-black/10 p-5 hover:border-black/20 dark:border-white/10 dark:hover:border-white/25"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-semibold text-white"
                    style={{ background: tileColor(p.id) }}
                  >
                    {initials(p.title)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{p.title}</div>
                    <div className="text-xs text-black/50 dark:text-white/50">
                      {p._count.versions} version{p._count.versions > 1 ? "s" : ""} ·{" "}
                      {p._count.contributors} contributeur{p._count.contributors > 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
                <span
                  className={
                    "w-fit rounded-full px-2 py-0.5 text-xs " +
                    (p.canPublish
                      ? "bg-green-500/15 text-green-700 dark:text-green-400"
                      : "bg-amber-500/15 text-amber-700 dark:text-amber-400")
                  }
                >
                  {p.canPublish ? "Publiable" : "En cours"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {declarations.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
              Revenus récents
            </h2>
            <Link href="/revenus" className="text-xs underline">
              Tout voir →
            </Link>
          </div>
          <ul className="divide-y divide-black/10 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
            {declarations.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 truncate">
                  {declarationTypeLabel[d.type] ?? d.type} —{" "}
                  {d.project
                    ? `${d.project.title}${d.version ? ` (v${d.version.versionNumber})` : ""}`
                    : d.concert
                      ? `${d.concert.venue}${d.concert.city ? `, ${d.concert.city}` : ""}`
                      : "?"}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {d.amountReceivedCents != null && (
                    <span className="font-mono tabular-nums">{euros(d.amountReceivedCents)}</span>
                  )}
                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs dark:bg-white/10">
                    {declarationLabel[d.status] ?? d.status}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
