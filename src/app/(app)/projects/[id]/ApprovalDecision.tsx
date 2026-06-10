"use client";

import { useActionState } from "react";

import { decideApprovalAction, type ActionState } from "../../actions";

// Boutons Approuver / Rejeter affichés au reviewer quand SA part est PENDING.
export function ApprovalDecision({ approvalId }: { approvalId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    decideApprovalAction,
    undefined,
  );

  return (
    <form action={action} className="mt-2 space-y-2">
      <input type="hidden" name="approvalId" value={approvalId} />
      <input
        type="text"
        name="comment"
        maxLength={2000}
        placeholder="Commentaire (optionnel)"
        className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-xs outline-none focus:border-foreground dark:border-white/20"
      />
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          name="decision"
          value="APPROVED"
          disabled={pending}
          className="rounded-full bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {pending ? "…" : "Approuver"}
        </button>
        <button
          type="submit"
          name="decision"
          value="REJECTED"
          disabled={pending}
          className="rounded-full border border-red-600/40 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-600/10 disabled:opacity-50"
        >
          Rejeter
        </button>
      </div>
    </form>
  );
}
