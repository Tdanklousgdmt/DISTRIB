"use client";

import { useActionState, useState } from "react";

import { createConcertAction } from "../sacem-actions";
import type { ActionState } from "../actions";

const inputCls =
  "mt-1 w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground dark:border-white/20";

export function NewConcertForm({
  projects,
  programs,
}: {
  projects: Array<{ id: string; title: string }>;
  programs: Array<{ id: string; name: string; reference: string }>;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createConcertAction,
    undefined,
  );
  const [programId, setProgramId] = useState("");

  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="c-date" className="block text-sm font-medium">
            Date
          </label>
          <input id="c-date" type="date" name="date" required className={inputCls} />
        </div>
        <div>
          <label htmlFor="c-audience" className="block text-sm font-medium">
            Jauge estimée
          </label>
          <input
            id="c-audience"
            type="number"
            name="estimatedAudience"
            min={1}
            placeholder="150"
            className={inputCls}
          />
        </div>
      </div>
      <div>
        <label htmlFor="c-venue" className="block text-sm font-medium">
          Lieu / salle
        </label>
        <input
          id="c-venue"
          name="venue"
          required
          maxLength={200}
          placeholder="Le Trianon"
          className={inputCls}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="c-city" className="block text-sm font-medium">
            Ville
          </label>
          <input id="c-city" name="city" maxLength={120} placeholder="Paris" className={inputCls} />
        </div>
        <div>
          <label htmlFor="c-country" className="block text-sm font-medium">
            Pays
          </label>
          <input
            id="c-country"
            name="country"
            maxLength={120}
            placeholder="France"
            className={inputCls}
          />
        </div>
      </div>
      <div>
        <label htmlFor="c-project" className="block text-sm font-medium">
          Projet lié <span className="text-black/40 dark:text-white/40">(optionnel)</span>
        </label>
        <select id="c-project" name="projectId" className={inputCls + " dark:bg-black"}>
          <option value="">—</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>
      {programs.length > 0 && (
        <div>
          <label htmlFor="c-program" className="block text-sm font-medium">
            Programme réutilisé <span className="text-black/40 dark:text-white/40">(optionnel)</span>
          </label>
          <select
            id="c-program"
            name="programId"
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
            className={inputCls + " dark:bg-black"}
          >
            <option value="">— Nouveau programme —</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (réf. {p.reference})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-black/50 dark:text-white/50">
            Sa référence pré-remplit la déclaration de l&apos;organisateur.
          </p>
        </div>
      )}
      <div>
        <label htmlFor="c-setlist" className="block text-sm font-medium">
          Setlist <span className="text-black/40 dark:text-white/40">(un titre par ligne)</span>
        </label>
        <textarea
          id="c-setlist"
          name="setlist"
          rows={4}
          placeholder={"Nuit blanche\nLueur\n…"}
          className={inputCls}
        />
      </div>
      {!programId && (
        <div>
          <label htmlFor="c-save-program" className="block text-sm font-medium">
            Enregistrer comme programme réutilisable{" "}
            <span className="text-black/40 dark:text-white/40">(optionnel)</span>
          </label>
          <input
            id="c-save-program"
            name="saveAsProgram"
            maxLength={200}
            placeholder="Ex : Programme tournée 2026"
            className={inputCls}
          />
        </div>
      )}
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? "Création…" : "Ajouter le concert"}
      </button>
    </form>
  );
}
