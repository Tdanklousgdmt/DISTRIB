"use client";

import { useActionState } from "react";

import { inviteContributorAction, type ActionState } from "../../actions";

const roleOptions = [
  { value: "CO_AUTHOR", label: "Co-auteur" },
  { value: "BEATMAKER", label: "Beatmaker" },
  { value: "CO_BEATMAKER", label: "Co-beatmaker" },
  { value: "ARTIST", label: "Artiste" },
];

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

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      <div>
        <label htmlFor="invite-email" className="block text-sm font-medium">
          E-mail du contributeur
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
        className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
      >
        {pending ? "Invitation…" : "Inviter"}
      </button>
    </form>
  );
}
