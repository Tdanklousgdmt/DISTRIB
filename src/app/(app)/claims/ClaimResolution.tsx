"use client";

import { useActionState } from "react";

import { resolveClaimAction } from "../claims-actions";
import type { ActionState } from "../actions";

// Choix de résolution offerts au propriétaire de l'œuvre originale.
export function ClaimResolution({ claimId }: { claimId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    resolveClaimAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="claimId" value={claimId} />
      <input
        type="text"
        name="note"
        maxLength={5000}
        placeholder="Note (optionnelle)"
        className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-xs outline-none focus:border-foreground dark:border-white/20"
      />
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="action"
          value="AUTHORIZE"
          disabled={pending}
          className="rounded-full bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          Autoriser
        </button>
        <button
          type="submit"
          name="action"
          value="NEGOTIATE_SPLIT"
          disabled={pending}
          className="rounded-full border border-black/15 px-3 py-1 text-xs font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
        >
          Négocier un split
        </button>
        <button
          type="submit"
          name="action"
          value="REPORT"
          disabled={pending}
          className="rounded-full border border-red-600/40 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-600/10 disabled:opacity-50"
        >
          Signaler le litige
        </button>
      </div>
    </form>
  );
}
