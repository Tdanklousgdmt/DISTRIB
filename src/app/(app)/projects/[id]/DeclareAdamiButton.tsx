"use client";

import { useActionState } from "react";

import { declareAdamiAction } from "../../sacem-actions";
import type { ActionState } from "../../actions";

export function DeclareAdamiButton({ versionId }: { versionId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    declareAdamiAction,
    undefined,
  );

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="versionId" value={versionId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-black/15 px-3 py-1 text-xs font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
      >
        {pending ? "Génération…" : "Attestation ADAMI"}
      </button>
      {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
