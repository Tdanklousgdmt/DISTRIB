"use client";

import { useActionState } from "react";

import { createVersionAction, type ActionState } from "../../actions";

export function NewVersionForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createVersionAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      <div>
        <label htmlFor="description" className="block text-sm font-medium">
          Description de votre contribution
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={3}
          maxLength={5000}
          placeholder="Ex : Topline + mélodie du refrain, prod par X…"
          className="mt-1 w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground dark:border-white/20"
        />
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          Cette description est horodatée — c&apos;est votre preuve de paternité.
        </p>
      </div>
      <div>
        <label htmlFor="duration" className="block text-sm font-medium">
          Durée <span className="font-normal text-black/40 dark:text-white/40">(facultatif)</span>
        </label>
        <input
          id="duration"
          name="duration"
          type="text"
          placeholder="mm:ss"
          pattern="^(\d+:)?\d{1,2}:\d{2}$"
          className="mt-1 w-28 rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground dark:border-white/20"
        />
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          Requis pour la checklist de déclaration SACEM — renseignable plus tard.
        </p>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? "Création…" : "Nouvelle version"}
      </button>
    </form>
  );
}
