"use client";

import { useActionState, useState } from "react";

import { setSplitsAction, type ActionState } from "../../actions";

interface ContributorOption {
  id: string; // ProjectContributor.id
  label: string;
}

interface ExistingSplit {
  contributorId: string;
  percentage: number;
  roleLabel: string | null;
}

// Éditeur de répartition : une ligne par contributeur, somme = 100 % exigée
// (revalidée serveur + trigger SQL).
export function SplitsEditor({
  versionId,
  contributors,
  existing,
}: {
  versionId: string;
  contributors: ContributorOption[];
  existing: ExistingSplit[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    setSplitsAction,
    undefined,
  );

  // Lignes initiales : répartition existante, sinon égalitaire entre contributeurs.
  const [rows, setRows] = useState<ExistingSplit[]>(() => {
    if (existing.length > 0) return existing;
    const equal = Math.floor(10000 / contributors.length) / 100;
    const remainder = Math.round((100 - equal * contributors.length) * 100) / 100;
    return contributors.map((c, i) => ({
      contributorId: c.id,
      percentage: i === 0 ? Math.round((equal + remainder) * 100) / 100 : equal,
      roleLabel: null,
    }));
  });

  const total = Math.round(rows.reduce((s, r) => s + r.percentage * 100, 0)) / 100;
  const totalOk = total === 100;

  function update(i: number, patch: Partial<ExistingSplit>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="versionId" value={versionId} />
      {rows.map((row, i) => (
        <div key={row.contributorId} className="flex items-center gap-2 text-sm">
          <input type="hidden" name="contributorId" value={row.contributorId} />
          <span className="min-w-0 flex-1 truncate">
            {contributors.find((c) => c.id === row.contributorId)?.label ??
              row.contributorId}
          </span>
          <input
            type="text"
            name="roleLabel"
            defaultValue={row.roleLabel ?? ""}
            placeholder="Rôle (ex : Topline)"
            maxLength={100}
            className="w-28 rounded-lg border border-black/15 bg-transparent px-2 py-1 text-xs outline-none focus:border-foreground dark:border-white/20"
          />
          <input
            type="number"
            name="percentage"
            step="0.01"
            min="0.01"
            max="100"
            required
            value={row.percentage}
            onChange={(e) => update(i, { percentage: Number(e.target.value) })}
            className="w-20 rounded-lg border border-black/15 bg-transparent px-2 py-1 text-right text-xs tabular-nums outline-none focus:border-foreground dark:border-white/20"
          />
          <span className="text-xs text-black/40 dark:text-white/40">%</span>
        </div>
      ))}
      <div className="flex items-center justify-between pt-1 text-xs">
        <span className={totalOk ? "text-green-600" : "text-red-600"}>
          Total : {total.toFixed(2)} % {totalOk ? "✓" : "(doit faire 100)"}
        </span>
        <button
          type="submit"
          disabled={pending || !totalOk}
          className="rounded-full border border-black/15 px-3 py-1 font-medium hover:bg-black/5 disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/10"
        >
          {pending ? "Enregistrement…" : "Enregistrer la répartition"}
        </button>
      </div>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
