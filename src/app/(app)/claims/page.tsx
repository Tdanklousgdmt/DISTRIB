import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { ClaimResolution } from "./ClaimResolution";

const claimStatusLabels: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "En attente", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  AUTHORIZED: { label: "Autorisée", cls: "bg-green-500/15 text-green-700 dark:text-green-400" },
  SPLIT_NEGOTIATED: { label: "Split en négo", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  DISPUTED: { label: "Litige", cls: "bg-red-500/15 text-red-700 dark:text-red-400" },
  RESOLVED: { label: "Résolue", cls: "bg-black/5 dark:bg-white/10" },
};

const platformLabels: Record<string, string> = {
  spotify: "Spotify",
  apple_music: "Apple Music",
  deezer: "Deezer",
  youtube: "YouTube",
  soundcloud: "SoundCloud",
  unknown: "Autre plateforme",
};

export default async function ClaimsPage() {
  const user = await requireUser();

  const [claims, externalMatches] = await Promise.all([
    // Réclamations où je suis d'un côté ou de l'autre.
    prisma.claim.findMany({
      where: {
        OR: [
          { targetFile: { version: { project: { ownerId: user.id } } } },
          { claimantFile: { version: { project: { ownerId: user.id } } } },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: {
        targetFile: {
          include: {
            version: { include: { project: { select: { id: true, title: true, ownerId: true } } } },
          },
        },
        claimantFile: {
          include: {
            version: { include: { project: { select: { id: true, title: true, ownerId: true } } } },
          },
        },
      },
    }),
    // Correspondances DSP externes sur MES fichiers.
    prisma.externalMatch.findMany({
      where: { vaultFile: { version: { project: { ownerId: user.id } } } },
      orderBy: { detectedAt: "desc" },
      take: 50,
      include: { vaultFile: { select: { filename: true } } },
    }),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Réclamations</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Correspondances détectées par empreinte acoustique — dans le vault et sur
          les plateformes externes.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
          Vault interne
        </h2>
        {claims.length === 0 ? (
          <p className="rounded-xl border border-dashed border-black/15 p-6 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
            Aucune correspondance détectée entre vos œuvres et le reste du vault.
          </p>
        ) : (
          <ul className="space-y-4">
            {claims.map((c) => {
              const status = claimStatusLabels[c.status] ?? claimStatusLabels.PENDING;
              const iAmTarget = c.targetFile.version.project.ownerId === user.id;
              const decidable =
                iAmTarget && (c.status === "PENDING" || c.status === "SPLIT_NEGOTIATED");
              return (
                <li
                  key={c.id}
                  className="rounded-xl border border-black/10 p-4 dark:border-white/10"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium">
                      Similarité {(Number(c.similarityScore) * 100).toFixed(1)} %
                      <span className="ml-2 text-xs font-normal text-black/50 dark:text-white/50">
                        {iAmTarget
                          ? "votre œuvre est l'originale"
                          : "votre dépôt correspond à une œuvre antérieure"}
                      </span>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${status.cls}`}>
                      {status.label}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div className="rounded-lg bg-black/[.03] p-3 dark:bg-white/[.04]">
                      <div className="text-xs text-black/50 dark:text-white/50">
                        Œuvre originale (antérieure)
                      </div>
                      <div className="mt-1 truncate font-medium">
                        {c.targetFile.filename}
                      </div>
                      <Link
                        href={`/projects/${c.targetFile.version.project.id}`}
                        className="text-xs underline"
                      >
                        {c.targetFile.version.project.title}
                      </Link>
                    </div>
                    <div className="rounded-lg bg-black/[.03] p-3 dark:bg-white/[.04]">
                      <div className="text-xs text-black/50 dark:text-white/50">
                        Dépôt en correspondance
                      </div>
                      <div className="mt-1 truncate font-medium">
                        {c.claimantFile.filename}
                      </div>
                      <Link
                        href={`/projects/${c.claimantFile.version.project.id}`}
                        className="text-xs underline"
                      >
                        {c.claimantFile.version.project.title}
                      </Link>
                    </div>
                  </div>

                  {c.resolutionNote && (
                    <p className="mt-2 text-xs italic text-black/50 dark:text-white/50">
                      « {c.resolutionNote} »
                    </p>
                  )}

                  {decidable && (
                    <div className="mt-3 border-t border-black/10 pt-3 dark:border-white/10">
                      <ClaimResolution claimId={c.id} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
          Plateformes externes (scan AudD)
        </h2>
        {externalMatches.length === 0 ? (
          <p className="rounded-xl border border-dashed border-black/15 p-6 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
            Aucune correspondance externe détectée. Le scan tourne automatiquement
            sur vos fichiers protégés.
          </p>
        ) : (
          <ul className="divide-y divide-black/10 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
            {externalMatches.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">
                    {platformLabels[m.platform] ?? m.platform}
                  </span>
                  {" — "}
                  {m.title ?? "titre inconnu"}
                  {m.artist ? ` · ${m.artist}` : ""}
                  <div className="text-xs text-black/40 dark:text-white/40">
                    Fichier : {m.vaultFile.filename} ·{" "}
                    {m.detectedAt.toLocaleDateString("fr-FR")}
                  </div>
                </div>
                {m.externalUrl && (
                  <a
                    href={m.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs underline"
                  >
                    Ouvrir ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
