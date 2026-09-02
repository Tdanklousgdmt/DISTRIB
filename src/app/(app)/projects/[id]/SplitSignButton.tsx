"use client";

import { useActionState } from "react";

import { signSplitAction, type ActionState } from "../../actions";

// Chaque contributeur signe sa propre part — la modification de la
// répartition invalide automatiquement les signatures déjà recueillies
// (voir setSplitsAction).
export function SplitSignButton({ splitId }: { splitId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    signSplitAction,
    undefined,
  );

  return (
    <form action={action} className="inline">
      <input type="hidden" name="splitId" value={splitId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-black/15 px-2 py-0.5 text-[11px] font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
      >
        {pending ? "…" : "Signer ma part"}
      </button>
      {state?.error && <p className="text-[11px] text-red-600">{state.error}</p>}
    </form>
  );
}
