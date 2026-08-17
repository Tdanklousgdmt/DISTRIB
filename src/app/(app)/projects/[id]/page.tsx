import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { NewVersionForm } from "./NewVersionForm";
import { UploadForm } from "./UploadForm";
import { InviteContributorForm } from "./InviteContributorForm";
import { ApprovalDecision } from "./ApprovalDecision";
import { SplitsEditor } from "./SplitsEditor";
import { DeclareOeuvreButton } from "./DeclareOeuvreButton";
import { buildProjectLedger } from "@/lib/ledger";

function formatBytes(bytes: bigint): string {
  const units = ["o", "Ko", "Mo", "Go"];
  let n = Number(bytes);
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const versionStatusLabels: Record<string, string> = {
  PENDING: "En attente d'approbation",
  APPROVED: "Approuvée",
  REJECTED: "Rejetée",
  OBSOLETE: "Obsolète",
};

const approvalStatusStyle: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  APPROVED: "bg-green-500/15 text-green-700 dark:text-green-400",
  REJECTED: "bg-red-500/15 text-red-700 dark:text-red-400",
};

const roleLabels: Record<string, string> = {
  ARTIST: "Artiste",
  CO_AUTHOR: "Co-auteur",
  BEATMAKER: "Beatmaker",
  CO_BEATMAKER: "Co-beatmaker",
};

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      owner: { select: { email: true, name: true } },
      contributors: { include: { user: { select: { email: true, name: true } } } },
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          files: { orderBy: { uploadedAt: "desc" } },
          createdBy: { select: { email: true, name: true } },
          approvals: {
            include: { reviewer: { select: { email: true, name: true } } },
          },
          splits: true,
          declarations: { where: { type: "OEUVRE" }, select: { id: true } },
        },
      },
    },
  });

  if (!project) notFound();

  const hasOnchainTx = project.versions.some(
    (v) => v.finalPolygonTxHash || v.files.some((f) => f.polygonTxHash),
  );

  const isOwner = project.ownerId === user.id;
  const authorized =
    isOwner || project.contributors.some((c) => c.userId === user.id);
  if (!authorized) notFound();

  // Registre blockchain : interrogé en direct sur Polygon (pas de cache) —
  // seulement si le projet a au moins une transaction, pour ne pas faire de
  // requêtes RPC inutiles sur un projet encore vide.
  const ledger = hasOnchainTx ? await buildProjectLedger(project.id) : null;

  const contributorOptions = project.contributors.map((c) => ({
    id: c.id,
    label:
      (c.user.name ?? c.user.email ?? c.id) +
      (roleLabels[c.role] ? ` · ${roleLabels[c.role]}` : ""),
  }));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/projects" className="text-xs text-black/50 hover:underline dark:text-white/50">
          ← Mes projets
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
          <span
            className={
              "rounded-full px-2 py-0.5 text-xs " +
              (project.canPublish
                ? "bg-green-500/15 text-green-700 dark:text-green-400"
                : "bg-amber-500/15 text-amber-700 dark:text-amber-400")
            }
          >
            {project.canPublish ? "Publiable" : "En cours"}
          </span>
          {hasOnchainTx && (
            <a
              href={`/api/projects/${project.id}/ledger/pdf`}
              className="ml-auto rounded-full border border-black/15 px-3 py-1 text-xs font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Registre blockchain (PDF)
            </a>
          )}
        </div>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          {project.isrc ? `ISRC ${project.isrc} · ` : ""}
          {project.contributors.length} contributeur
          {project.contributors.length > 1 ? "s" : ""}
        </p>
      </div>

      <section className="grid gap-8 md:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
            Versions
          </h2>

          {project.versions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-black/15 p-6 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
              Aucune version. Créez la première pour commencer à déposer des fichiers.
            </p>
          ) : (
            <ul className="space-y-4">
              {project.versions.map((v) => {
                const myPendingApproval = v.approvals.find(
                  (a) => a.reviewerId === user.id && a.status === "PENDING",
                );
                return (
                  <li
                    key={v.id}
                    className="rounded-xl border border-black/10 p-4 dark:border-white/10"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">
                        Version {v.versionNumber}
                        {v.isCurrent && (
                          <span className="ml-2 rounded-full bg-blue-500/15 px-2 py-0.5 text-xs text-blue-700 dark:text-blue-400">
                            Courante
                          </span>
                        )}
                      </div>
                      <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs dark:bg-white/10">
                        {versionStatusLabels[v.status] ?? v.status}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-black/70 dark:text-white/70">
                      {v.description}
                    </p>
                    <p className="mt-1 text-xs text-black/40 dark:text-white/40">
                      par {v.createdBy.name ?? v.createdBy.email}
                      {v.finalizedAt &&
                        ` · protégée le ${v.finalizedAt.toLocaleDateString("fr-FR")}`}
                    </p>

                    {/* Fichiers */}
                    {v.files.length > 0 && (
                      <ul className="mt-3 space-y-1.5 border-t border-black/10 pt-3 dark:border-white/10">
                        {v.files.map((f) => (
                          <li
                            key={f.id}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <span className="min-w-0 truncate">
                              <span className="rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-medium dark:bg-white/10">
                                {f.fileType}
                              </span>{" "}
                              {f.filename}
                            </span>
                            <span
                              className="shrink-0 font-mono text-xs text-black/40 dark:text-white/40"
                              title={`SHA-256 ${f.sha256Hash}`}
                            >
                              {formatBytes(f.sizeBytes)} · {f.sha256Hash.slice(0, 10)}…
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Upload (versions encore en attente uniquement) */}
                    {v.status === "PENDING" && (
                      <div className="mt-3 border-t border-black/10 pt-3 dark:border-white/10">
                        <UploadForm versionId={v.id} />
                      </div>
                    )}

                    {/* Approbations */}
                    {v.approvals.length > 0 && (
                      <div className="mt-3 border-t border-black/10 pt-3 dark:border-white/10">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
                          Approbations
                        </h3>
                        <ul className="mt-2 space-y-1">
                          {v.approvals.map((a) => (
                            <li
                              key={a.id}
                              className="flex items-center justify-between gap-2 text-sm"
                            >
                              <span className="min-w-0 truncate">
                                {a.reviewer.name ?? a.reviewer.email}
                                {a.comment && (
                                  <span className="ml-2 text-xs italic text-black/40 dark:text-white/40">
                                    « {a.comment} »
                                  </span>
                                )}
                              </span>
                              <span
                                className={
                                  "shrink-0 rounded-full px-2 py-0.5 text-xs " +
                                  (approvalStatusStyle[a.status] ?? "")
                                }
                              >
                                {a.status === "PENDING"
                                  ? "En attente"
                                  : a.status === "APPROVED"
                                    ? "Approuvé"
                                    : "Rejeté"}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {myPendingApproval && v.status === "PENDING" && (
                          <ApprovalDecision approvalId={myPendingApproval.id} />
                        )}
                      </div>
                    )}

                    {/* Déclaration SACEM (version approuvée avec splits) */}
                    {v.status === "APPROVED" && v.splits.length > 0 && (
                      <div className="mt-3 border-t border-black/10 pt-3 dark:border-white/10">
                        {v.declarations.length > 0 ? (
                          <a
                            href={`/api/declarations/${v.declarations[0].id}/pdf`}
                            className="text-xs underline"
                          >
                            Œuvre déclarée — bulletin PDF
                          </a>
                        ) : (
                          <DeclareOeuvreButton versionId={v.id} />
                        )}
                      </div>
                    )}

                    {/* Répartition des droits */}
                    <div className="mt-3 border-t border-black/10 pt-3 dark:border-white/10">
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
                        Répartition des droits
                      </h3>
                      {v.status === "PENDING" || v.splits.length === 0 ? (
                        <SplitsEditor
                          versionId={v.id}
                          contributors={contributorOptions}
                          existing={v.splits.map((s) => ({
                            contributorId: s.contributorId,
                            percentage: Number(s.percentage),
                            roleLabel: s.roleLabel,
                          }))}
                        />
                      ) : (
                        <ul className="space-y-1 text-sm">
                          {v.splits.map((s) => {
                            const c = contributorOptions.find(
                              (o) => o.id === s.contributorId,
                            );
                            return (
                              <li
                                key={s.id}
                                className="flex items-center justify-between gap-2"
                              >
                                <span className="min-w-0 truncate">
                                  {c?.label ?? s.contributorId}
                                  {s.roleLabel && (
                                    <span className="ml-1 text-xs text-black/40 dark:text-white/40">
                                      ({s.roleLabel})
                                    </span>
                                  )}
                                </span>
                                <span className="shrink-0 font-mono text-xs tabular-nums">
                                  {Number(s.percentage).toFixed(2)} %
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside className="space-y-6">
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
              Nouvelle version
            </h2>
            <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <NewVersionForm projectId={project.id} />
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
              Contributeurs
            </h2>
            <ul className="rounded-xl border border-black/10 text-sm dark:border-white/10">
              {project.contributors.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 border-b border-black/5 px-3 py-2 last:border-0 dark:border-white/5"
                >
                  <span className="min-w-0 truncate">{c.user.name ?? c.user.email}</span>
                  <span className="shrink-0 text-xs text-black/40 dark:text-white/40">
                    {roleLabels[c.role] ?? c.role}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {isOwner && (
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
                Inviter un contributeur
              </h2>
              <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
                <InviteContributorForm projectId={project.id} />
              </div>
            </div>
          )}
        </aside>
      </section>

      {ledger && ledger.rows.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
              Registre blockchain
            </h2>
            <a
              href={`/api/projects/${project.id}/ledger/pdf`}
              className="text-xs underline"
            >
              Exporter en PDF
            </a>
          </div>
          <p className="text-xs text-black/50 dark:text-white/50">
            Réseau Polygon {ledger.network === "mainnet" ? "mainnet" : "Amoy (testnet)"} · Contrat{" "}
            <span className="font-mono">{ledger.contractAddress ?? "non déployé"}</span> · données
            interrogées en direct sur la blockchain, non stockées.
          </p>
          <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead>
                <tr className="border-b border-black/10 text-black/50 dark:border-white/10 dark:text-white/50">
                  <th className="px-3 py-2 font-medium">Objet</th>
                  <th className="px-3 py-2 font-medium">Transaction Hash</th>
                  <th className="px-3 py-2 font-medium">Method</th>
                  <th className="px-3 py-2 font-medium">Block</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">From</th>
                  <th className="px-3 py-2 font-medium">To</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Txn Fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5">
                {ledger.rows.map((row) => (
                  <tr key={row.rawHash}>
                    <td className="px-3 py-2">{row.label}</td>
                    <td className="px-3 py-2">
                      {row.onchain ? (
                        <a
                          href={row.onchain.explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-blue-600 hover:underline dark:text-blue-400"
                          title={row.rawHash}
                        >
                          {row.rawHash.slice(0, 10)}…{row.rawHash.slice(-6)}
                        </a>
                      ) : (
                        <span className="font-mono" title={row.rawHash}>
                          {row.rawHash.slice(0, 10)}…{row.rawHash.slice(-6)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{row.method}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {row.onchain?.blockNumber ?? "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.onchain?.timestamp
                        ? row.onchain.timestamp.toLocaleString("fr-FR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono" title={row.onchain?.from ?? undefined}>
                      {row.onchain?.from
                        ? `${row.onchain.from.slice(0, 8)}…${row.onchain.from.slice(-6)}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono" title={row.onchain?.to ?? undefined}>
                      {row.onchain?.to
                        ? `${row.onchain.to.slice(0, 8)}…${row.onchain.to.slice(-6)}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {row.onchain ? `${row.onchain.valuePol} POL` : "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {row.onchain?.feePol ? `${row.onchain.feePol} POL` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
