"use client";

import { useActionState, useState } from "react";

import { inviteContributorAction, type ActionState } from "../../actions";

const roleOptions = [
  { value: "CO_AUTHOR", label: "Co-auteur·e" },
  { value: "BEATMAKER", label: "Beatmaker" },
  { value: "CO_BEATMAKER", label: "Co-beatmaker" },
  { value: "ARTIST", label: "Artiste" },
];

// Invitation par LIEN (parcours du collaborateur invité, §2.4) : l'inviteur
// obtient un lien à transmettre ; l'invité découvre le projet sans compte et
// crée son accès pour approuver. L'e-mail part aussi si Resend est configuré.
export function InviteContributorForm({
  projectId,
  defaultRole,
}: {
  projectId: string;
  defaultRole?: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    inviteContributorAction,
    undefined,
  );
  const [copied, setCopied] = useState(false);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* le champ reste sélectionnable à la main */
    }
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      <div>
        <label htmlFor="invite-email" className="block text-sm font-medium">
          Inviter un contributeur
        </label>
        <input
          id="invite-email"
          type="email"
          name="email"
          required
          placeholder="beatmaker@exemple.com"
          className="mt-1 w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground dark:border-white/20"
        />
      </div>
      <div>
        <label htmlFor="invite-role" className="block text-sm font-medium">
          Rôle
        </label>
        <select
          id="invite-role"
          name="role"
          defaultValue={defaultRole}
          className="mt-1 w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground dark:border-white/20 dark:bg-black"
        >
          {roleOptions.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
      >
        {pending ? "Invitation…" : "Inviter un contributeur"}
      </button>

      {state?.inviteUrl && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-xs">
          <div className="font-medium text-green-800 dark:text-green-300">Invitation créée — envoyez ce lien</div>
          <p className="mt-1 text-black/60 dark:text-white/60">
            Votre collaborateur découvre le projet sans compte, puis crée son accès pour approuver.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              readOnly
              value={state.inviteUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-md border border-black/10 bg-transparent px-2 py-1 font-mono text-[11px] dark:border-white/10"
            />
            <button
              type="button"
              onClick={() => copy(state.inviteUrl!)}
              className="shrink-0 rounded-md border border-black/15 px-2 py-1 text-[11px] font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              {copied ? "Copié ✓" : "Copier"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
