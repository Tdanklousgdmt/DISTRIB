"use client";

import { useActionState } from "react";

import { createProjectAction, type ActionState } from "../actions";

export function NewProjectForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createProjectAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-3">
      <div>
        <label htmlFor="title" className="block text-sm font-medium">
          Titre du projet
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={200}
          placeholder="Ex : Nuit blanche"
          className="mt-1 w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground dark:border-white/20"
        />
      </div>
      <div>
        <label htmlFor="isrc" className="block text-sm font-medium">
          ISRC <span className="text-black/40 dark:text-white/40">(optionnel)</span>
        </label>
        <input
          id="isrc"
          name="isrc"
          placeholder="FRABC2400001"
          className="mt-1 w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 font-mono text-sm uppercase outline-none focus:border-foreground dark:border-white/20"
        />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? "Création…" : "Créer le projet"}
      </button>
    </form>
  );
}
