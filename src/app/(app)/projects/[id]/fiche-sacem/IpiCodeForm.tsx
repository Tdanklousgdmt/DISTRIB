"use client";

import { useActionState } from "react";

import { updateMyIpiCodeAction, type ActionState } from "../../../actions";

export function IpiCodeForm({ currentValue }: { currentValue: string | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateMyIpiCodeAction,
    undefined,
  );

  return (
    <form action={action} className="flex items-center gap-1.5">
      <input
        type="text"
        name="ipiCode"
        defaultValue={currentValue ?? ""}
        placeholder="Votre code IPI"
        maxLength={11}
        className="w-32 rounded-lg border border-black/15 bg-transparent px-2 py-1 text-right font-mono text-xs outline-none focus:border-foreground dark:border-white/20"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-black/15 px-2 py-1 text-[11px] font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
      >
        {pending ? "…" : "OK"}
      </button>
      {state?.error && <span className="text-[11px] text-red-600">{state.error}</span>}
    </form>
  );
}
