import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSignatureProvider } from "@/lib/esign";
import { requireUser } from "@/lib/session";
import { buildSacemChecklist } from "@/lib/sacem-checklist";
import { avatarColor, displayName, initials } from "@/lib/avatar";
import { contributorRoleLabels } from "@/lib/validators";
import { IpiCodeForm } from "./IpiCodeForm";
import { ProposedSplits, type ProposedRow } from "./ProposedSplits";
import { OwnFicheUpload } from "./OwnFicheUpload";
import { Bulletin726Card } from "./Bulletin726Card";
import { creatorCategories } from "@/lib/esign/service";
import { DeclareOeuvreButton } from "../DeclareOeuvreButton";
import { DeclareAdamiButton } from "../DeclareAdamiButton";

// ─────────────────────────────────────────────────────────────────────────────
// « Votre fiche SACEM : proposée, jamais imposée » (écran p.66 du prototype).
// La répartition est DÉDUITE des attestations déposées et validées, reste
// modifiable, puis est adressée en signature. Alternative : déposer sa propre
// fiche. « Déclarable » ne veut jamais dire « déclaré » : c'est l'artiste qui
// transmet.
// ─────────────────────────────────────────────────────────────────────────────

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

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
      contributors: {
        include: {
          user: {
            select: { id: true, email: true, name: true, ipiCode: true },
          },
        },
      },
      concerts: { orderBy: { date: "asc" }, take: 1, select: { date: true, venue: true, city: true } },
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          splits: true,
          signatureRequests: {
            where: { status: { in: ["PENDING", "COMPLETED"] } },
            orderBy: { createdAt: "desc" },
            include: { signers: true },
          },
          declarations: {
            where: { type: { in: ["OEUVRE", "ADAMI_ATTESTATION"] } },
            orderBy: { createdAt: "desc" },
            select: { id: true, type: true, status: true, pdfS3Key: true },
          },
        },
      },
    },
  });
  if (!project) notFound();

  const authorized =
    project.ownerId === user.id ||
    project.contributors.some((c) => c.userId === user.id);
  if (!authorized) notFound();

  const currentVersion = project.versions.find((v) => v.isCurrent) ?? null;
  const checklist = currentVersion
    ? await buildSacemChecklist(currentVersion.id)
    : null;
  // Déclaration d'œuvre : la plus récente qui porte un PDF signé (bulletin 726
  // ou fiche déposée), sinon la plus récente tout court.
  const oeuvre =
    currentVersion?.declarations.find((d) => d.type === "OEUVRE" && d.pdfS3Key) ??
    currentVersion?.declarations.find((d) => d.type === "OEUVRE") ??
    null;
  // Fiche « déposée » = PDF versé par l'artiste lui-même (pas un document
  // produit par DISTRIB dans le dossier des signatures).
  const ownFiche = Boolean(oeuvre?.pdfS3Key && !oeuvre.pdfS3Key.includes("/signatures/"));
  const adami =
    currentVersion?.declarations.find((d) => d.type === "ADAMI_ATTESTATION") ??
    null;

  // Répartition proposée : parts existantes si déjà adressées, sinon déduite des
  // dépôts scellés de chacun (poids = nombre de dépôts approuvés, minimum 1 pour
  // que personne ne parte à 0 %). Le libellé de rôle reprend la précision saisie
  // au dernier dépôt de la personne.
  let rows: ProposedRow[] = [];
  let alreadySent = false;
  const sigRequest = currentVersion?.signatureRequests.find((r) => r.kind === "SPLITS") ?? null;
  const bulletinRequest = currentVersion?.signatureRequests.find((r) => r.kind === "DECLARATION") ?? null;
  const bulletinMeta = (bulletinRequest?.metadata ?? {}) as {
    complements?: { genre?: string; sousTitre?: string | null; groupe?: string | null; lieu?: string | null; premiereExploitation?: string | null };
  };
  const firstConcert = project.concerts[0] ?? null;
  const bulletinDefaults = {
    genre: bulletinMeta.complements?.genre ?? "",
    sousTitre: bulletinMeta.complements?.sousTitre ?? "",
    groupe: bulletinMeta.complements?.groupe ?? "",
    lieu:
      bulletinMeta.complements?.lieu ??
      (firstConcert ? [firstConcert.venue, firstConcert.city].filter(Boolean).join(", ") : ""),
    premiereExploitation: (bulletinMeta.complements?.premiereExploitation ?? firstConcert?.date.toISOString() ?? "").slice(0, 10),
  };
  const categoryLabels: Record<string, string> = {
    compositeur: "Compositeur",
    auteur: "Auteur",
    arrangeur: "Arrangeur",
    adaptateur: "Adaptateur",
  };
  const bulletinCreators = (currentVersion?.splits ?? [])
    .filter((sp) => Number(sp.percentage) > 0)
    .map((sp) => {
      const c = project.contributors.find((pc) => pc.id === sp.contributorId);
      return {
        name: c ? displayName(c.user) : "—",
        categories: creatorCategories(c?.role ?? "ARTIST", sp.roleLabel).map((k) => categoryLabels[k]).join(" · "),
        part: Number(sp.percentage).toFixed(2),
      };
    });
  if (currentVersion) {
    const existing = currentVersion.splits;
    alreadySent = existing.length > 0;
    const sealedBy = new Map<string, number>();
    const lastRoleDetail = new Map<string, string>();
    for (const v of project.versions) {
      if (v.status === "APPROVED")
        sealedBy.set(v.createdById, (sealedBy.get(v.createdById) ?? 0) + 1);
      if (v.depositRoleDetail && !lastRoleDetail.has(v.createdById))
        lastRoleDetail.set(v.createdById, v.depositRoleDetail);
    }
    const weights = project.contributors.map((c) =>
      Math.max(1, sealedBy.get(c.userId) ?? 0),
    );
    const sum = weights.reduce((a, b) => a + b, 0);
    let allocated = 0;
    rows = project.contributors.map((c, i) => {
      const split = existing.find((s) => s.contributorId === c.id);
      let pct: number;
      if (split) {
        pct = Number(split.percentage);
      } else if (alreadySent) {
        // Une répartition existe déjà : un·e contributeur·rice arrivé·e depuis
        // (invitation par lien) démarre à 0 — c'est aux parties de lui faire
        // une place, jamais à DISTRIB de l'imposer.
        pct = 0;
      } else if (i === project.contributors.length - 1) {
        pct = round2(100 - allocated);
      } else {
        pct = round2((weights[i] / sum) * 100);
        allocated = round2(allocated + pct);
      }
      const detail = lastRoleDetail.get(c.userId);
      return {
        contributorId: c.id,
        userId: c.userId,
        name: displayName(c.user),
        color: avatarColor(c.userId),
        initials: initials(displayName(c.user)),
        roleLabel:
          split?.roleLabel ??
          (detail
            ? `${contributorRoleLabels[c.role]} · ${detail}`
            : contributorRoleLabels[c.role]),
        percentage: pct,
        splitId: split?.id ?? null,
        signedAt: split?.signedAt ? split.signedAt.toISOString() : null,
        signerId: sigRequest?.signers.find((sg) => sg.userId === c.userId)?.id ?? null,
      };
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/projects/${project.id}`}
          className="text-xs text-black/50 hover:underline dark:text-white/50"
        >
          ← {project.title}
        </Link>
        <p
          className="mt-3 font-mono text-[10.5px] uppercase tracking-[.14em]"
          style={{ color: "var(--accent)" }}
        >
          — Déclaration SACEM
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Votre fiche SACEM : proposée, jamais imposée
        </h1>
        <p className="mt-2 max-w-xl text-sm text-black/60 dark:text-white/60">
          DISTRIB a analysé les dépôts et les attestations du projet{" "}
          {project.title}, et vous propose une répartition fondée sur ce que
          chacun a déclaré et validé. Vous en conservez la maîtrise totale.
        </p>
      </div>

      <div className="rounded-lg border-l-2 border-black/60 bg-black/[.03] px-4 py-3 text-xs dark:border-white/60 dark:bg-white/[.04]">
        <div className="font-mono text-[10px] uppercase tracking-[.12em] text-black/50 dark:text-white/50">
          Déroulement
        </div>
        <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-black/70 dark:text-white/70">
          <li>
            Vous choisissez : partir de la fiche proposée, ou déposer la vôtre.
          </li>
          <li>DISTRIB l&apos;adresse en signature à chaque contributeur.</li>
          <li>
            Une fois signée par l&apos;ensemble des parties, elle est archivée
            dans l&apos;espace du projet — c&apos;est vous qui la transmettez.
          </li>
        </ol>
      </div>

      {!currentVersion ? (
        <p className="rounded-xl border border-dashed border-black/15 p-6 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
          Aucun dépôt scellé pour l&apos;instant — la fiche se remplit dès
          qu&apos;une version est approuvée par tous les contributeurs.
        </p>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-black/10 p-5 dark:border-white/10">
            <div
              className="font-mono text-[10px] uppercase tracking-[.12em]"
              style={{ color: "var(--accent)" }}
            >
              ● Recommandé · préparé pour vous
            </div>
            <h2 className="mt-1 font-semibold">Utiliser la fiche proposée</h2>
            <p className="mt-1 text-xs text-black/50 dark:text-white/50">
              Répartition déduite des attestations. Chaque part demeure
              modifiable avant l&apos;envoi.
            </p>
            <dl className="mt-4 space-y-1.5 border-b border-black/10 pb-3 text-sm dark:border-white/10">
              <div className="flex justify-between">
                <dt className="text-black/50 dark:text-white/50">Titre</dt>
                <dd className="font-mono">{project.title}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-black/50 dark:text-white/50">ISRC</dt>
                <dd className="font-mono">{project.isrc ?? "à attribuer"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-black/50 dark:text-white/50">Version</dt>
                <dd className="font-mono">v{currentVersion.versionNumber}</dd>
              </div>
            </dl>
            <div className="mt-4">
              {/* key : remonte le composant dès que les parts ou signatures changent côté serveur
                    (signature, envoi) — sinon son état local masquerait le nouvel état. */}
              <ProposedSplits
                key={rows
                  .map((r) => `${r.splitId}:${r.signedAt}:${r.percentage}:${r.signerId}`)
                  .join("|")}
                versionId={currentVersion.id}
                rows={rows}
                alreadySent={alreadySent}
                currentUserId={user.id}
                signature={
                  sigRequest
                    ? {
                        id: sigRequest.id,
                        status: sigRequest.status,
                        providerLabel: getSignatureProvider().label,
                        level: sigRequest.level,
                        signedPdfUrl:
                          sigRequest.status === "COMPLETED"
                            ? `/api/signature-requests/${sigRequest.id}/document?signed=1`
                            : null,
                      }
                    : null
                }
              />
            </div>
          </div>

          <div className="rounded-xl border border-black/10 p-5 dark:border-white/10">
            <div className="font-mono text-[10px] uppercase tracking-[.12em] text-black/50 dark:text-white/50">
              ○ À votre main
            </div>
            <h2 className="mt-1 font-semibold">Déposer ma propre fiche</h2>
            <p className="mt-1 text-xs text-black/50 dark:text-white/50">
              Vous avez déjà établi votre déclaration ? Déposez-la : DISTRIB se
              charge uniquement de la faire signer et de l&apos;archiver.
            </p>
            <div className="mt-4">
              {ownFiche ? (
                <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 text-sm">
                  <div className="font-medium text-green-800 dark:text-green-300">
                    Fiche déposée et archivée
                  </div>
                  <a
                    href={`/api/declarations/${oeuvre.id}/pdf`}
                    className="mt-1 inline-block text-xs underline"
                  >
                    Ouvrir le PDF
                  </a>
                </div>
              ) : oeuvre ? (
                <p className="text-xs text-black/50 dark:text-white/50">
                  Un bulletin a déjà été préparé à partir de la fiche proposée —{" "}
                  <a
                    href={`/api/declarations/${oeuvre.id}/pdf`}
                    className="underline"
                  >
                    l&apos;ouvrir
                  </a>
                  .
                </p>
              ) : (
                <OwnFicheUpload versionId={currentVersion.id} />
              )}
            </div>
          </div>
        </section>
      )}

      {currentVersion && (
        <Bulletin726Card
          versionId={currentVersion.id}
          currentUserId={user.id}
          request={
            bulletinRequest
              ? {
                  id: bulletinRequest.id,
                  status: bulletinRequest.status,
                  providerLabel: getSignatureProvider().label,
                  signers: bulletinRequest.signers.map((sg) => ({
                    id: sg.id,
                    userId: sg.userId,
                    name: displayName({ name: sg.name, email: sg.email }),
                    status: sg.status,
                  })),
                }
              : null
          }
          defaults={bulletinDefaults}
          creators={bulletinCreators}
        />
      )}

      {currentVersion && checklist && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-[10.5px] uppercase tracking-[.14em] text-black/50 dark:text-white/50">
              Contrôles avant transmission
            </h2>
            <span
              className={
                "rounded-full px-2 py-0.5 text-xs " +
                (checklist.ready
                  ? "bg-green-500/15 text-green-700 dark:text-green-400"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-400")
              }
            >
              {checklist.ready ? "Déclaration-ready" : "Incomplète"}
            </span>
          </div>
          <ul className="divide-y divide-black/10 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
            {checklist.items.map((item) => (
              <li
                key={item.key}
                className="flex items-start gap-3 px-4 py-3 text-sm"
              >
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
                    <p className="mt-0.5 text-xs text-black/50 dark:text-white/50">
                      {item.detail}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            {oeuvre ? (
              <a
                href={`/api/declarations/${oeuvre.id}/pdf`}
                className="text-xs underline"
              >
                Bulletin d&apos;œuvre — PDF
              </a>
            ) : (
              <DeclareOeuvreButton versionId={currentVersion.id} />
            )}
            {adami ? (
              <a
                href={`/api/declarations/${adami.id}/pdf`}
                className="text-xs underline"
              >
                Attestation ADAMI — PDF
              </a>
            ) : (
              <DeclareAdamiButton versionId={currentVersion.id} />
            )}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-mono text-[10.5px] uppercase tracking-[.14em] text-black/50 dark:text-white/50">
          Codes IPI des contributeurs
        </h2>
        <ul className="divide-y divide-black/10 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
          {project.contributors.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <span className="min-w-0 truncate">
                {displayName(c.user)}
                <span className="ml-1.5 text-xs text-black/40 dark:text-white/40">
                  ({contributorRoleLabels[c.role]})
                </span>
              </span>
              {c.user.id === user.id ? (
                <IpiCodeForm currentValue={c.user.ipiCode} />
              ) : c.user.ipiCode ? (
                <span className="font-mono text-xs">{c.user.ipiCode}</span>
              ) : (
                <span className="text-xs text-amber-700 dark:text-amber-400">
                  Non renseigné
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
