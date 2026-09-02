import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { avatarColor, displayName, initials } from "@/lib/avatar";
import { contributorRoleLabels } from "@/lib/validators";
import { acceptInviteAction } from "../actions";

// Page publique de découverte : l'invité voit le projet AVANT d'avoir un compte
// (qui l'invite, à quel rôle, qui contribue déjà, combien de dépôts). Un seul
// bouton ensuite. Aucun fichier ni attestation n'est exposé ici.
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const contributor = await prisma.projectContributor.findUnique({
    where: { inviteToken: token },
    include: {
      user: { select: { id: true, email: true, name: true } },
      project: {
        include: {
          owner: { select: { id: true, email: true, name: true } },
          contributors: { include: { user: { select: { id: true, email: true, name: true } } } },
          _count: { select: { versions: true } },
        },
      },
    },
  });
  if (!contributor) notFound();

  const session = await auth();
  const isInvitee = session?.user?.id === contributor.userId;
  const isSomeoneElse = !!session?.user && !isInvitee;
  const project = contributor.project;

  return (
    <div className="mx-auto w-full max-w-md px-6 py-16">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="grid h-[26px] w-[26px] place-items-center rounded-[7px]" style={{ background: "var(--ink)" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--on-ink)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px]">
            <path d="M12 2l7 4v6c0 4.5-3 7.5-7 10-4-2.5-7-5.5-7-10V6z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </span>
        <span className="font-mono text-[15px] font-semibold tracking-[.16em]">DISTRIB</span>
      </div>

      <p className="font-mono text-[10.5px] uppercase tracking-[.14em]" style={{ color: "var(--accent)" }}>
        — Invitation
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        {displayName(project.owner)} vous invite sur « {project.title} »
      </h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        En tant que <strong>{contributorRoleLabels[contributor.role]}</strong>. Ce que vous déposerez
        ou approuverez sur ce projet sera daté et signé à votre nom.
      </p>

      <div className="mt-6 rounded-xl border border-black/10 p-4 text-sm dark:border-white/10">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10.5px] uppercase tracking-[.12em] text-black/50 dark:text-white/50">Contributeurs</span>
          <span className="font-mono text-[11px] text-black/40 dark:text-white/40">
            {project._count.versions} dépôt{project._count.versions > 1 ? "s" : ""}
          </span>
        </div>
        <ul className="mt-2 space-y-2">
          {project.contributors.map((c) => (
            <li key={c.id} className="flex items-center gap-2.5">
              <span
                className="grid h-7 w-7 place-items-center rounded-[6px] font-mono text-[10px] font-semibold text-white"
                style={{ background: avatarColor(c.user.id) }}
              >
                {initials(displayName(c.user))}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {displayName(c.user)}
                {c.id === contributor.id && <span className="ml-1 text-xs text-black/40 dark:text-white/40">(vous)</span>}
              </span>
              <span className="font-mono text-[10.5px] text-black/50 dark:text-white/50">{contributorRoleLabels[c.role]}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 rounded-lg border-l-2 border-black/60 bg-black/[.03] px-4 py-3 text-xs dark:border-white/60 dark:bg-white/[.04]">
        <div className="font-mono text-[10px] uppercase tracking-[.12em] text-black/50 dark:text-white/50">Déroulement</div>
        <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-black/70 dark:text-white/70">
          <li>Vous créez votre accès avec votre e-mail — sans mot de passe.</li>
          <li>Vous approuvez ou contestez les dépôts qui vous attendent.</li>
          <li>Vous signez votre part quand la répartition vous est adressée.</li>
        </ol>
      </div>

      {isSomeoneElse ? (
        <p className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          Vous êtes connecté·e avec un autre compte. Cette invitation est adressée à{" "}
          <span className="font-mono">{contributor.user.email}</span>.{" "}
          <Link href="/signin" className="underline">
            Changer de compte
          </Link>
        </p>
      ) : (
        <form action={acceptInviteAction} className="mt-6 space-y-2">
          <input type="hidden" name="token" value={token} />
          <button type="submit" className="w-full rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background">
            {isInvitee ? "Ouvrir le projet →" : "Créer mon accès et approuver →"}
          </button>
          <p className="text-center text-[11px] text-black/40 dark:text-white/40">
            Accès pour <span className="font-mono">{contributor.user.email}</span>
            {process.env.NODE_ENV === "production" ? " — un lien de connexion vous sera envoyé." : ""}
          </p>
        </form>
      )}
    </div>
  );
}
