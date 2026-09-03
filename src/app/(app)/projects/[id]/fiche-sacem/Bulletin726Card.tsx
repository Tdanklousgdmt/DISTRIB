"use client";

import Link from "next/link";
import { useActionState } from "react";

import { prepareBulletin726Action, type ActionState } from "../../../actions";

export interface BulletinSignerRow {
  id: string;
  userId: string;
  name: string;
  status: "PENDING" | "SIGNED" | "DECLINED";
}

export interface BulletinRequestSummary {
  id: string;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  signers: BulletinSignerRow[];
  providerLabel: string;
}

// Formulaire officiel SACEM 726 : DISTRIB pré-remplit, l'artiste complète ce
// qui n'est pas dans le vault (genre, groupe, première exploitation…), puis
// chaque créateur signe dans sa case via le plugin esign.
export function Bulletin726Card({
  versionId,
  currentUserId,
  request,
  defaults,
  creators,
}: {
  versionId: string;
  currentUserId: string;
  request: BulletinRequestSummary | null;
  defaults: { genre: string; sousTitre: string; groupe: string; lieu: string; premiereExploitation: string };
  creators: Array<{ name: string; categories: string; part: string }>;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(prepareBulletin726Action, undefined);
  const docUrl = request ? `/api/signature-requests/${request.id}/document` : null;
  const mine = request?.signers.find((s) => s.userId === currentUserId) ?? null;

  const inputCls =
    "mt-1 w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground dark:border-white/20";

  return (
    <section className="rounded-xl border border-black/10 p-5 dark:border-white/10">
      <div className="font-mono text-[10px] uppercase tracking-[.12em]" style={{ color: "var(--accent)" }}>
        ● Formulaire officiel SACEM — bulletin 726
      </div>
      <h2 className="mt-1 font-semibold">Bulletin de déclaration, pré-rempli et signé par tous</h2>
      <p className="mt-1 text-xs text-black/50 dark:text-white/50">
        Titre, durée, interprètes, créateurs, parts et codes IPI sont reportés depuis le vault. Chaque
        ayant droit signe dans sa propre case ; le PDF final est archivé, prêt à transmettre.
      </p>

      <ul className="mt-4 space-y-1 border-y border-black/10 py-3 text-sm dark:border-white/10">
        {creators.map((c) => (
          <li key={c.name} className="flex justify-between gap-3">
            <span className="truncate">
              {c.name} <span className="text-black/50 dark:text-white/50">· {c.categories}</span>
            </span>
            <span className="font-mono">{c.part} %</span>
          </li>
        ))}
      </ul>

      {request && request.status !== "CANCELLED" ? (
        <div className="mt-4 space-y-3">
          <ul className="space-y-1.5">
            {request.signers.map((s) => (
              <li key={s.id} className="flex items-center justify-between text-sm">
                <span>
                  {s.name}
                  {s.userId === currentUserId && <span className="ml-1 text-xs text-black/40 dark:text-white/40">(vous)</span>}
                </span>
                {s.status === "SIGNED" ? (
                  <span className="rounded-full bg-green-500/15 px-2 py-0.5 font-mono text-[10.5px] text-green-700 dark:text-green-400">
                    Signée
                  </span>
                ) : s.userId === currentUserId && request.status === "PENDING" ? (
                  <Link href={`/sign/${s.id}`} className="rounded-full bg-foreground px-2.5 py-0.5 text-[11px] font-medium text-background">
                    Signer →
                  </Link>
                ) : (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-mono text-[10.5px] text-amber-700 dark:text-amber-400">
                    En attente
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 px-3 py-2 text-xs dark:border-white/10">
            <span className="text-black/60 dark:text-white/60">Procédé : {request.providerLabel}</span>
            {request.status === "COMPLETED" ? (
              <a href={`${docUrl}?signed=1`} className="font-medium underline">
                Bulletin 726 signé par tous — PDF
              </a>
            ) : (
              <a href={docUrl ?? "#"} target="_blank" rel="noreferrer" className="underline">
                Bulletin pré-rempli — PDF
              </a>
            )}
          </div>
          {request.status === "PENDING" && !mine && (
            <p className="text-xs text-black/50 dark:text-white/50">Vous n&apos;êtes pas signataire de ce bulletin.</p>
          )}
          {request.status === "COMPLETED" && (
            <form action={action} className="pt-1">
              <input type="hidden" name="versionId" value={versionId} />
              <input type="hidden" name="genre" value={defaults.genre} />
              <input type="hidden" name="suivrePhono" value="on" />
              <button type="submit" disabled={pending} className="text-xs underline disabled:opacity-50">
                Préparer une nouvelle version du bulletin
              </button>
            </form>
          )}
        </div>
      ) : (
        <form action={action} className="mt-4 space-y-3">
          <input type="hidden" name="versionId" value={versionId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="b-genre" className="block text-sm font-medium">
                Genre <span className="text-red-600">*</span>
              </label>
              <input id="b-genre" name="genre" required defaultValue={defaults.genre} placeholder="Chanson, rap, électro…" className={inputCls} />
            </div>
            <div>
              <label htmlFor="b-sous" className="block text-sm font-medium">
                Sous-titre
              </label>
              <input id="b-sous" name="sousTitre" defaultValue={defaults.sousTitre} className={inputCls} />
            </div>
            <div>
              <label htmlFor="b-groupe" className="block text-sm font-medium">
                Nom du groupe
              </label>
              <input id="b-groupe" name="groupe" defaultValue={defaults.groupe} className={inputCls} />
            </div>
            <div>
              <label htmlFor="b-date" className="block text-sm font-medium">
                Première exploitation
              </label>
              <input id="b-date" name="premiereExploitation" type="date" defaultValue={defaults.premiereExploitation} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="b-lieu" className="block text-sm font-medium">
                Lieu ou diffuseur / exploitant
              </label>
              <input id="b-lieu" name="lieu" defaultValue={defaults.lieu} className={inputCls} />
            </div>
          </div>
          <label className="flex items-start gap-2 text-xs text-black/70 dark:text-white/70">
            <input type="checkbox" name="suivrePhono" defaultChecked className="mt-0.5" />
            <span>
              Partage des droits DEP et « radio mécaniques » aligné sur les parts phono ci-dessus (rubrique D du
              bulletin) — c&apos;est la répartition signée dans DISTRIB.
            </span>
          </label>
          {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {pending ? "Préparation…" : "Préparer le bulletin et l'adresser en signature"}
          </button>
        </form>
      )}
    </section>
  );
}
