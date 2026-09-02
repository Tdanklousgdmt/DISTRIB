"use client";

import { useActionState, useState } from "react";

import { declareSpedidamAction } from "../sacem-actions";
import type { ActionState } from "../actions";

// Feuille de présence SPEDIDAM — liste des musiciens présents, une ligne
// "Nom - Rôle". Repliée par défaut pour ne pas alourdir la carte concert.
export function DeclareSpedidamForm({ concertId }: { concertId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    declareSpedidamAction,
    undefined,
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-black/15 px-3 py-1 text-xs font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
      >
        Feuille de présence SPEDIDAM
      </button>
    );
  }

  return (
    <form action={action} className="w-full space-y-2">
      <input type="hidden" name="concertId" value={concertId} />
      <textarea
        name="performers"
        rows={3}
        placeholder={"Nom - Rôle\nEx : Julie Marchand - Batterie"}
        className="w-full rounded-lg border border-black/15 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-foreground dark:border-white/20"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full border border-black/15 px-3 py-1 text-xs font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
        >
          {pending ? "Génération…" : "Générer la feuille"}
        </button>
        {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
