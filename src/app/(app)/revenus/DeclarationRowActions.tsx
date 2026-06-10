"use client";

import { useActionState } from "react";

import {
  markDeclarationPaidAction,
  markDeclarationTransmittedAction,
} from "../sacem-actions";
import type { ActionState } from "../actions";

export function DeclarationRowActions({
  declarationId,
  status,
}: {
  declarationId: string;
  status: string;
}) {
  const [tState, tAction, tPending] = useActionState<ActionState, FormData>(
    markDeclarationTransmittedAction,
    undefined,
  );
  const [pState, pAction, pPending] = useActionState<ActionState, FormData>(
    markDeclarationPaidAction,
    undefined,
  );

  if (status === "PAID") return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "PENDING_SIGNATURE" || status === "SIGNED" ? (
        <form action={tAction} className="flex items-center gap-2">
          <input type="hidden" name="declarationId" value={declarationId} />
          <input
            type="text"
            name="reference"
            placeholder="Réf. SACEM (optionnel)"
            className="w-36 rounded-lg border border-black/15 bg-transparent px-2 py-1 text-xs outline-none focus:border-foreground dark:border-white/20"
          />
          <button
            type="submit"
            disabled={tPending}
            className="rounded-full border border-black/15 px-3 py-1 text-xs font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
          >
            {tPending ? "…" : "Marquer transmise"}
          </button>
          {tState?.error && <span className="text-xs text-red-600">{tState.error}</span>}
        </form>
      ) : null}

      {status === "TRANSMITTED" ? (
        <form action={pAction} className="flex items-center gap-2">
          <input type="hidden" name="declarationId" value={declarationId} />
          <input
            type="number"
            name="amountEuros"
            step="0.01"
            min="0.01"
            required
            placeholder="Montant €"
            className="w-28 rounded-lg border border-black/15 bg-transparent px-2 py-1 text-xs outline-none focus:border-foreground dark:border-white/20"
          />
          <button
            type="submit"
            disabled={pPending}
            className="rounded-full bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {pPending ? "…" : "Paiement reçu"}
          </button>
          {pState?.error && <span className="text-xs text-red-600">{pState.error}</span>}
        </form>
      ) : null}
    </div>
  );
}
