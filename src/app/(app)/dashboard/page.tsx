import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export default async function DashboardPage() {
  const user = await requireUser();

  // Compteurs vault de l'utilisateur (projets possédés ou contribués).
  const [projectCount, versionCount, fileCount, pendingApprovals] = await Promise.all([
    prisma.project.count({
      where: {
        OR: [{ ownerId: user.id }, { contributors: { some: { userId: user.id } } }],
      },
    }),
    prisma.version.count({
      where: { project: { contributors: { some: { userId: user.id } } } },
    }),
    prisma.vaultFile.count({ where: { uploadedById: user.id } }),
    prisma.approval.count({ where: { reviewerId: user.id, status: "PENDING" } }),
  ]);

  const stats = [
    { label: "Projets", value: projectCount, href: "/projects" },
    { label: "Versions déposées", value: versionCount },
    { label: "Fichiers protégés", value: fileCount },
    { label: "Approbations en attente", value: pendingApprovals },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Vue d&apos;ensemble de votre vault protégé.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-black/10 p-4 dark:border-white/10"
          >
            <div className="text-3xl font-semibold tabular-nums">{s.value}</div>
            <div className="mt-1 text-xs text-black/60 dark:text-white/60">{s.label}</div>
            {s.href && (
              <Link href={s.href} className="mt-2 inline-block text-xs underline">
                Voir
              </Link>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-dashed border-black/15 p-6 dark:border-white/15">
        <h2 className="font-medium">Protégez votre prochaine création</h2>
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
    </div>
  );
}
