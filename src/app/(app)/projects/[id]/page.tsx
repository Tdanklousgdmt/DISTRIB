import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { buildProjectLedger } from "@/lib/ledger";
import { formatBytes, formatDuration, relativeTime } from "@/lib/format";
import { avatarColor, displayName, initials } from "@/lib/avatar";
import { aiDisclosureLabels, contributorRoleLabels } from "@/lib/validators";
import { findProjectTemplate } from "@/lib/project-templates";
import { DepositDialog } from "./DepositDialog";
import { UploadForm } from "./UploadForm";
import { InviteContributorForm } from "./InviteContributorForm";
import { ApprovalDecision } from "./ApprovalDecision";

// ─────────────────────────────────────────────────────────────────────────────
// Historique du projet — écran central du prototype (p.64), « validé sans
// explication » : chaque dépôt est une carte avec son auteur, son rôle, ses
// fichiers, son attestation entre guillemets et l'état d'approbation de chacun.
// « Clôturer et préparer la déclaration » n'apparaît qu'une fois tous les
// dépôts scellés.
// ─────────────────────────────────────────────────────────────────────────────

function Avatar({ seed, label, size = 32 }: { seed: string; label: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[7px] font-mono font-semibold text-white"
      style={{ background: avatarColor(seed), width: size, height: size, fontSize: size * 0.34 }}
    >
      {initials(label)}
    </span>
  );
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ template?: string }>;
}) {
  const { id } = await params;
  const { template: templateKey } = await searchParams;
  const template = findProjectTemplate(templateKey);
  const user = await requireUser();

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      owner: { select: { email: true, name: true } },
      contributors: { include: { user: { select: { id: true, email: true, name: true } } } },
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          files: { orderBy: { uploadedAt: "asc" } },
          createdBy: { select: { id: true, email: true, name: true } },
          approvals: { include: { reviewer: { select: { id: true, email: true, name: true } } } },
          splits: { include: { contributor: { include: { user: { select: { name: true, email: true } } } } } },
        },
      },
    },
  });
  if (!project) notFound();

  const isOwner = project.ownerId === user.id;
  const me = project.contributors.find((c) => c.userId === user.id);
  if (!isOwner && !me) notFound();

  const hasOnchainTx = project.versions.some(
    (v) => v.finalPolygonTxHash || v.files.some((f) => f.polygonTxHash),
  );
  const ledger = hasOnchainTx ? await buildProjectLedger(project.id) : null;

  const roleOf = (userId: string) => project.contributors.find((c) => c.userId === userId)?.role;
  const pendingForMe = project.versions.filter(
    (v) => v.status === "PENDING" && v.approvals.some((a) => a.reviewerId === user.id && a.status === "PENDING"),
  );
  const sealed = project.versions.filter((v) => v.status === "APPROVED").length;
  const awaiting = project.versions.filter((v) => v.status === "PENDING").length;
  const canClose = sealed > 0 && awaiting === 0;

  return (
    <div className="space-y-8">
      {/* En-tête */}
      <div>
        <Link href="/projects" className="text-xs text-black/50 hover:underline dark:text-white/50">
          ← Mes projets
        </Link>
        <p className="mt-3 font-mono text-[10.5px] uppercase tracking-[.14em]" style={{ color: "var(--accent)" }}>
          — Historique du projet
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
          <span
            className={
              "rounded-full px-2 py-0.5 text-xs " +
              (project.canPublish
                ? "bg-green-500/15 text-green-700 dark:text-green-400"
                : project.publishBlockedReason
                  ? "bg-red-500/15 text-red-700 dark:text-red-400"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-400")
            }
            title={project.publishBlockedReason ?? undefined}
          >
            {project.canPublish ? "Publiable" : project.publishBlockedReason ? `Bloqué — ${project.publishBlockedReason}` : "En cours"}
          </span>
          <div className="ml-auto flex items-center gap-3">
            {hasOnchainTx && (
              <a href={`/api/projects/${project.id}/ledger/pdf`} className="text-xs underline">
                Certificat PDF
              </a>
            )}
            <DepositDialog projectId={project.id} defaultRole={me?.role ?? "ARTIST"} />
          </div>
        </div>
        <p className="mt-2 max-w-xl text-sm text-black/60 dark:text-white/60">
          Chaque dépôt est présenté dans l&apos;ordre chronologique, avec son auteur, son rôle, ses
          fichiers et l&apos;attestation correspondante. Les indicateurs signalent l&apos;état des
          approbations.
          {project.isrc && <span className="ml-1 font-mono text-xs">ISRC {project.isrc}</span>}
        </p>
      </div>

      {/* Action requise */}
      {pendingForMe.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-amber-600 text-[11px] text-amber-700 dark:text-amber-400">
            !
          </span>
          <div className="text-sm">
            <div className="font-mono text-[10.5px] uppercase tracking-[.12em] text-amber-700 dark:text-amber-400">
              Action requise
            </div>
            <p className="mt-0.5">
              <strong>{displayName(pendingForMe[0].createdBy)}</strong> a déposé « {pendingForMe[0].description.slice(0, 80)}
              {pendingForMe[0].description.length > 80 ? "…" : ""} ». Votre validation est requise avant que le projet ne se
              poursuive.
              {pendingForMe.length > 1 && ` (${pendingForMe.length} dépôts vous attendent.)`}
            </p>
          </div>
        </div>
      )}

      <section className="grid gap-8 md:grid-cols-[1fr_300px]">
        {/* Fil des dépôts */}
        <div>
          {project.versions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-black/15 p-6 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
              Aucun dépôt pour l&apos;instant. Déposez un premier fichier avec votre attestation : il est
              daté dès sa réception, puis attend l&apos;approbation des autres contributeurs.
            </p>
          ) : (
            <ol className="relative space-y-4 border-l border-black/10 pl-8 dark:border-white/10">
              {project.versions.map((v) => {
                const myPending = v.approvals.find((a) => a.reviewerId === user.id && a.status === "PENDING");
                const isMine = v.createdById === user.id;
                const role = v.depositRole ?? roleOf(v.createdById) ?? "ARTIST";
                const roleLine = contributorRoleLabels[role] + (v.depositRoleDetail ? ` · ${v.depositRoleDetail}` : "");
                const node =
                  v.status === "APPROVED"
                    ? { glyph: "✓", cls: "border-green-600 text-green-700 dark:text-green-400" }
                    : v.status === "REJECTED"
                      ? { glyph: "✕", cls: "border-red-600 text-red-700 dark:text-red-400" }
                      : v.status === "OBSOLETE"
                        ? { glyph: "·", cls: "border-black/20 text-black/30 dark:border-white/20 dark:text-white/30" }
                        : { glyph: "○", cls: "border-amber-600 text-amber-700 dark:text-amber-400" };
                return (
                  <li key={v.id} className="relative">
                    <span
                      className={
                        "absolute -left-[41px] top-4 grid h-6 w-6 place-items-center rounded-full border bg-background text-[11px] " +
                        node.cls
                      }
                    >
                      {node.glyph}
                    </span>
                    <article
                      className={
                        "rounded-xl border p-4 " +
                        (myPending
                          ? "border-amber-500/60 dark:border-amber-400/50"
                          : v.status === "OBSOLETE"
                            ? "border-black/5 opacity-60 dark:border-white/5"
                            : "border-black/10 dark:border-white/10")
                      }
                    >
                      {/* Auteur */}
                      <header className="flex items-center gap-3">
                        <Avatar seed={v.createdBy.id} label={displayName(v.createdBy)} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <span className="truncate">{displayName(v.createdBy)}</span>
                            {isMine && (
                              <span className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[.1em] dark:bg-white/10">
                                vous
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[11px] text-black/50 dark:text-white/50">{roleLine}</div>
                        </div>
                        <div className="text-right font-mono text-[11px] text-black/40 dark:text-white/40">
                          <div>{relativeTime(v.createdAt)}</div>
                          <div>Version {v.versionNumber}{v.durationSeconds != null ? ` · ${formatDuration(v.durationSeconds)}` : ""}</div>
                        </div>
                      </header>

                      {/* Fichiers */}
                      {v.files.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {v.files.map((f) => (
                            <span
                              key={f.id}
                              className="inline-flex items-center gap-2 rounded-md border border-black/10 bg-black/[.03] px-2 py-1 font-mono text-[11px] dark:border-white/10 dark:bg-white/[.04]"
                              title={`SHA-256 ${f.sha256Hash}`}
                            >
                              <span className="text-[9.5px] font-semibold tracking-[.06em] text-black/50 dark:text-white/50">{f.fileType}</span>
                              <span className="max-w-[220px] truncate">{f.filename}</span>
                              <span className="text-black/40 dark:text-white/40">{formatBytes(f.sizeBytes)}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      {v.files.some((f) => f.aiCategories.length > 0) && (
                        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
                          Part IA déclarée :{" "}
                          {Array.from(new Set(v.files.flatMap((f) => f.aiCategories)))
                            .map((c) => aiDisclosureLabels[c])
                            .join(", ")}
                        </p>
                      )}

                      {/* Attestation */}
                      <blockquote className="mt-3 border-l-2 border-black/15 pl-3 text-sm leading-relaxed text-black/80 dark:border-white/20 dark:text-white/80">
                        « {v.description} »
                      </blockquote>

                      {/* Approbations */}
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11.5px]">
                        {v.approvals.map((a) => {
                          const who = a.reviewerId === user.id ? "Vous" : displayName(a.reviewer);
                          const cls =
                            a.status === "APPROVED"
                              ? "text-green-700 dark:text-green-400"
                              : a.status === "REJECTED"
                                ? "text-red-700 dark:text-red-400"
                                : "text-amber-700 dark:text-amber-400";
                          const verb =
                            a.status === "APPROVED"
                              ? (who === "Vous" ? "avez approuvé" : "a approuvé")
                              : a.status === "REJECTED"
                                ? (who === "Vous" ? "avez contesté" : "a contesté")
                                : a.reviewerId === user.id
                                  ? "en attente de votre validation"
                                  : "en attente";
                          return (
                            <span key={a.id} className={"inline-flex items-center gap-1.5 " + cls}>
                              <Avatar seed={a.reviewer.id} label={displayName(a.reviewer)} size={18} />
                              {who} {verb}
                              {a.comment && (
                                <span className="font-sans italic text-black/40 dark:text-white/40">« {a.comment} »</span>
                              )}
                            </span>
                          );
                        })}
                      </div>

                      {myPending && v.status === "PENDING" && <ApprovalDecision approvalId={myPending.id} />}

                      {/* Compléter mon propre dépôt encore en attente */}
                      {v.status === "PENDING" && isMine && (
                        <div className="mt-3 border-t border-black/10 pt-3 dark:border-white/10">
                          <UploadForm versionId={v.id} />
                        </div>
                      )}

                      {/* Répartition signée, en résumé */}
                      {v.splits.length > 0 && (
                        <p className="mt-3 font-mono text-[11px] text-black/50 dark:text-white/50">
                          Répartition :{" "}
                          {v.splits
                            .map(
                              (s) =>
                                `${displayName(s.contributor.user)} ${Number(s.percentage).toFixed(0)} %${s.signedAt ? " ✓" : ""}`,
                            )
                            .join(" · ")}
                        </p>
                      )}

                      {/* Mention d'état — vocabulaire du prototype */}
                      <footer className="mt-3 flex flex-wrap items-center gap-3 border-t border-black/10 pt-3 font-mono text-[10.5px] uppercase tracking-[.06em] dark:border-white/10">
                        {v.status === "APPROVED" ? (
                          <>
                            <span className="text-green-700 dark:text-green-400">● Approuvé par tous</span>
                            <span className="text-black/50 dark:text-white/50">
                              ⛨ Scellé par consentement collectif
                              {v.finalizedAt ? ` · ${v.finalizedAt.toLocaleDateString("fr-FR")}` : ""}
                            </span>
                          </>
                        ) : v.status === "REJECTED" ? (
                          <span className="text-red-700 dark:text-red-400">● Contesté — un nouveau dépôt est attendu</span>
                        ) : v.status === "OBSOLETE" ? (
                          <span className="text-black/40 dark:text-white/40">Remplacé par un dépôt plus récent</span>
                        ) : v.files.length > 0 ? (
                          <span className="text-black/50 dark:text-white/50">⛨ Fichier daté et protégé</span>
                        ) : (
                          <span className="text-amber-700 dark:text-amber-400">En attente de fichier</span>
                        )}
                      </footer>
                    </article>
                  </li>
                );
              })}
              <li className="relative font-mono text-[11px] text-black/40 dark:text-white/40">
                <span className="absolute -left-[37px] top-0 grid h-4 w-4 place-items-center rounded-full border border-black/15 text-[9px] dark:border-white/15">
                  +
                </span>
                Projet créé par {displayName(project.owner)} — {project.contributors.length} contributeur
                {project.contributors.length > 1 ? "s" : ""}
              </li>
            </ol>
          )}
        </div>

        {/* Colonne de droite */}
        <aside className="space-y-6">
          <div>
            <h2 className="mb-2 font-mono text-[10.5px] uppercase tracking-[.14em] text-black/50 dark:text-white/50">
              Contributeurs
            </h2>
            <ul className="rounded-xl border border-black/10 text-sm dark:border-white/10">
              {project.contributors.map((c) => (
                <li key={c.id} className="flex items-center gap-3 border-b border-black/5 px-3 py-2.5 last:border-0 dark:border-white/5">
                  <Avatar seed={c.user.id} label={displayName(c.user)} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {displayName(c.user)}
                      {c.userId === user.id && <span className="ml-1 text-xs text-black/40 dark:text-white/40">(vous)</span>}
                    </div>
                    <div className="font-mono text-[10.5px] text-black/50 dark:text-white/50">
                      {contributorRoleLabels[c.role]}
                      {!c.acceptedAt && c.userId !== project.ownerId && " · invitation en attente"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {isOwner && (
              <div className="mt-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
                {template && (
                  <p className="mb-2 text-xs text-black/50 dark:text-white/50">
                    Modèle « {template.label} » — {template.hint}
                  </p>
                )}
                <InviteContributorForm projectId={project.id} defaultRole={template?.suggestedRoles[0]} />
              </div>
            )}
          </div>

          <div>
            <h2 className="mb-2 font-mono text-[10.5px] uppercase tracking-[.14em] text-black/50 dark:text-white/50">
              Clôture du projet
            </h2>
            <div className="rounded-xl border border-black/10 p-4 text-sm dark:border-white/10">
              <p className="text-black/60 dark:text-white/60">
                Lorsque l&apos;ensemble des contributeurs atteste que le projet est finalisé, DISTRIB
                analyse les attestations et prépare votre déclaration SACEM.
              </p>
              <ul className="mt-3 space-y-1 font-mono text-[11px]">
                <li className="text-green-700 dark:text-green-400">
                  ● {sealed} dépôt{sealed > 1 ? "s" : ""} scellé{sealed > 1 ? "s" : ""}
                </li>
                <li className={awaiting > 0 ? "text-amber-700 dark:text-amber-400" : "text-black/40 dark:text-white/40"}>
                  ● {awaiting} dépôt{awaiting > 1 ? "s" : ""} en attente
                </li>
              </ul>
              {canClose ? (
                <Link
                  href={`/projects/${project.id}/fiche-sacem`}
                  className="mt-4 block rounded-full bg-foreground px-4 py-2 text-center text-sm font-medium text-background"
                >
                  Clôturer et préparer la déclaration →
                </Link>
              ) : (
                <p className="mt-4 text-xs text-black/40 dark:text-white/40">
                  Disponible une fois tous les dépôts scellés.
                </p>
              )}
              <Link
                href={`/projects/${project.id}/fiche-sacem`}
                className="mt-2 block text-center text-xs underline text-black/50 dark:text-white/50"
              >
                Voir la fiche SACEM
              </Link>
            </div>
          </div>
        </aside>
      </section>

      {ledger && ledger.rows.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
              Registre blockchain
            </h2>
            <a href={`/api/projects/${project.id}/ledger/pdf`} className="text-xs underline">
              Exporter en PDF
            </a>
          </div>
          <p className="text-xs text-black/50 dark:text-white/50">
            Réseau Polygon {ledger.network === "mainnet" ? "mainnet" : "Amoy (testnet)"} · Contrat{" "}
            <span className="font-mono">{ledger.contractAddress ?? "non déployé"}</span> · données interrogées en
            direct sur la blockchain, non stockées.
          </p>
          <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
            <table className="w-full min-w-[1000px] text-left text-xs">
              <thead>
                <tr className="border-b border-black/10 text-black/50 dark:border-white/10 dark:text-white/50">
                  <th className="px-3 py-2 font-medium">Objet</th>
                  <th className="px-3 py-2 font-medium">Transaction Hash</th>
                  <th className="px-3 py-2 font-medium">Method</th>
                  <th className="px-3 py-2 font-medium">User</th>
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
                        <a href={row.onchain.explorerUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-blue-600 hover:underline dark:text-blue-400" title={row.rawHash}>
                          {row.rawHash.slice(0, 10)}…{row.rawHash.slice(-6)}
                        </a>
                      ) : (
                        <span className="font-mono" title={row.rawHash}>
                          {row.rawHash.slice(0, 10)}…{row.rawHash.slice(-6)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{row.method}</td>
                    <td className="px-3 py-2">{row.user.name ?? row.user.email}</td>
                    <td className="px-3 py-2 tabular-nums">{row.onchain?.blockNumber ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.onchain?.timestamp ? row.onchain.timestamp.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono" title={row.onchain?.from ?? undefined}>
                      {row.onchain?.from ? `${row.onchain.from.slice(0, 8)}…${row.onchain.from.slice(-6)}` : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono" title={row.onchain?.to ?? undefined}>
                      {row.onchain?.to ? `${row.onchain.to.slice(0, 8)}…${row.onchain.to.slice(-6)}` : "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{row.onchain ? `${row.onchain.valuePol} POL` : "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{row.onchain?.feePol ? `${row.onchain.feePol} POL` : "—"}</td>
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
