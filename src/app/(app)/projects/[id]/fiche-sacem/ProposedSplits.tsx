"use client";

import { useActionState, useState } from "react";

import { sendSplitsForSignatureAction, type ActionState } from "../../../actions";
import Link from "next/link";

export interface ProposedRow {
  contributorId: string;
  name: string;
  userId: string;
  color: string;
  initials: string;
  roleLabel: string;
  percentage: number;
  splitId: string | null;
  signedAt: string | null;
  signerId: string | null; // SignatureSigner.id (plugin esign) — lien de cérémonie
}

export interface SignatureSummary {
  id: string;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  providerLabel: string;
  level: string;
  signedPdfUrl: string | null;
}

// « Utiliser la fiche proposée » — écran p.66 : répartition déduite des
// attestations, chaque part modifiable (curseur), total contrôlé à 100 %,
// puis « Adresser en signature » à tous. Une fois adressée, chacun signe sa part.
export function ProposedSplits({
  versionId,
  rows: initialRows,
  alreadySent,
  currentUserId,
  signature,
}: {
  versionId: string;
  rows: ProposedRow[];
  alreadySent: boolean;
  currentUserId: string;
  signature: SignatureSummary | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    sendSplitsForSignatureAction,
    undefined,
  );
  const [rows, setRows] = useState(initialRows);
  const [editing, setEditing] = useState(!alreadySent);

  const total = Math.round(rows.reduce((s, r) => s + r.percentage * 100, 0)) / 100;
  const totalOk = total === 100;
  const anySigned = rows.some((r) => r.signedAt);

  function update(i: number, pct: number) {
    const clamped = Math.max(0, Math.min(100, Math.round(pct * 100) / 100));
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, percentage: clamped } : r)));
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="versionId" value={versionId} />
      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li key={r.contributorId} className="space-y-1.5">
            <input type="hidden" name="contributorId" value={r.contributorId} />
            <input type="hidden" name="roleLabel" value={r.roleLabel} />
            <div className="flex items-center gap-3">
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px] font-mono text-[10px] font-semibold text-white"
                style={{ background: r.color }}
              >
                {r.initials}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {r.name}
                  {r.userId === currentUserId && <span className="ml-1 text-xs text-black/40 dark:text-white/40">(vous)</span>}
                </div>
                <div className="font-mono text-[10.5px] text-black/50 dark:text-white/50">{r.roleLabel}</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  name="percentage"
                  step="0.01"
                  min="0"
                  max="100"
                  value={r.percentage}
                  readOnly={!editing}
                  onChange={(e) => update(i, Number(e.target.value))}
                  className="w-20 rounded-lg border border-black/15 bg-transparent px-2 py-1 text-right font-mono text-sm tabular-nums outline-none focus:border-foreground read-only:border-transparent read-only:bg-transparent dark:border-white/20"
                />
                <span className="font-mono text-xs text-black/40 dark:text-white/40">%</span>
                {alreadySent && r.splitId ? (
                  r.signedAt ? (
                    <span className="rounded-full bg-green-500/15 px-2 py-0.5 font-mono text-[10.5px] text-green-700 dark:text-green-400">
                      Signée
                    </span>
                  ) : r.userId === currentUserId && r.signerId && signature?.status === "PENDING" ? (
                    <Link
                      href={`/sign/${r.signerId}`}
                      className="rounded-full bg-foreground px-2.5 py-0.5 text-[11px] font-medium text-background"
                    >
                      Signer →
                    </Link>
                  ) : (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-mono text-[10.5px] text-amber-700 dark:text-amber-400">
                      En attente
                    </span>
                  )
                ) : null}
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={0.5}
              value={r.percentage}
              disabled={!editing}
              onChange={(e) => update(i, Number(e.target.value))}
              className="w-full accent-current disabled:opacity-40"
              style={{ color: r.color }}
              aria-label={`Part de ${r.name}`}
            />
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between border-t border-black/10 pt-3 font-mono text-xs dark:border-white/10">
        <span className="font-semibold">Total</span>
        <span className={totalOk ? "text-green-700 dark:text-green-400" : "text-red-600"}>
          {total.toFixed(2)} % {totalOk ? "✓" : "(doit faire 100)"}
        </span>
      </div>

      {editing && anySigned && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Modifier la répartition invalidera les signatures déjà recueillies — chacun devra signer à nouveau.
        </p>
      )}
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}

      {signature && (
        <div className="rounded-lg border border-black/10 px-3 py-2 text-xs dark:border-white/10">
          <div className="flex items-center justify-between gap-2">
            <span className="text-black/60 dark:text-white/60">
              Procédé : {signature.providerLabel} · niveau {signature.level.toLowerCase()}
            </span>
            {signature.status === "COMPLETED" && signature.signedPdfUrl ? (
              <a href={signature.signedPdfUrl} className="font-medium underline">
                Fiche signée par tous — PDF
              </a>
            ) : (
              <span className="font-mono text-[10.5px] text-amber-700 dark:text-amber-400">
                Signatures en cours
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-full border border-black/15 px-4 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Modifier les parts
          </button>
        ) : (
          <button
            type="submit"
            disabled={pending || !totalOk}
            className="flex-1 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
          >
            {pending ? "Envoi…" : alreadySent ? "Adresser à nouveau en signature" : "Adresser en signature"}
          </button>
        )}
      </div>
    </form>
  );
}
