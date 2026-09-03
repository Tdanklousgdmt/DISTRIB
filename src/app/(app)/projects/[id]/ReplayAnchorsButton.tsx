"use client";

import { useActionState } from "react";

import { replayAnchorsAction, type ActionState } from "../../actions";

export function ReplayAnchorsButton({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(replayAnchorsAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-black/15 px-3 py-1 text-xs font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
      >
        {pending ? "Inscription en cours…" : "Relancer l'ancrage"}
      </button>
      {state?.error && <span className="text-xs text-amber-700 dark:text-amber-400">{state.error}</span>}
    </form>
  );
}
