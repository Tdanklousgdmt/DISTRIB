import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { markNotificationsReadAction } from "../actions";

const typeLabels: Record<string, string> = {
  CONTRIBUTOR_INVITED: "Invitation à un projet",
  APPROVAL_REQUESTED: "Approbation demandée",
  VERSION_APPROVED: "Version approuvée",
  VERSION_REJECTED: "Version rejetée",
  CLAIM_DETECTED: "Correspondance détectée",
  CONCERT_REMINDER_J15: "Concert dans 15 jours",
  CONCERT_REMINDER_J5: "Concert dans 5 jours",
  CONCERT_REMINDER_J1: "Concert demain",
  SACEM_SIGNED: "Déclaration SACEM signée",
  PAYMENT_RECEIVED: "Paiement reçu",
  SPLIT_SIGNED: "Répartition signée",
  SPLIT_INVALIDATED: "Signature de répartition invalidée",
  SPLIT_SIGNATURE_REQUESTED: "Répartition adressée en signature",
  PENDING_REMINDER: "Rappel — action en attente",
  MONTHLY_DIGEST: "Récapitulatif mensuel",
};

function describe(type: string, payload: unknown): string {
  const p = (payload ?? {}) as Record<string, unknown>;
  const title = typeof p.projectTitle === "string" ? p.projectTitle : null;
  const vn = typeof p.versionNumber === "number" ? p.versionNumber : null;
  switch (type) {
    case "CONTRIBUTOR_INVITED":
      return title ? `Vous avez été invité·e sur « ${title} ».` : "Vous avez été invité·e sur un projet.";
    case "APPROVAL_REQUESTED":
      return title
        ? `Votre approbation est attendue sur « ${title} »${vn ? ` (version ${vn})` : ""}.`
        : "Votre approbation est attendue.";
    case "VERSION_APPROVED":
      return title
        ? `Version ${vn ?? ""} de « ${title} » approuvée à l'unanimité — fichier protégé.`
        : "Votre version a été approuvée.";
    case "VERSION_REJECTED":
      return title ? `Version ${vn ?? ""} de « ${title} » rejetée.` : "Votre version a été rejetée.";
    case "SPLIT_SIGNATURE_REQUESTED":
      return title
        ? `La répartition de « ${title} »${vn ? ` (version ${vn})` : ""} vous est adressée en signature.`
        : "Une répartition vous est adressée en signature.";
    case "SPLIT_INVALIDATED":
      return title
        ? `La répartition de « ${title} » a changé — votre signature n'est plus valable.`
        : "Une répartition que vous aviez signée a changé.";
    case "PENDING_REMINDER":
      return title
        ? `Une action est toujours en attente sur « ${title} ».`
        : (typeof p.label === "string" ? p.label : null)
          ? `Une action est toujours en attente (${p.label}).`
          : "Une action est toujours en attente.";
    case "MONTHLY_DIGEST": {
      const pa = typeof p.pendingApprovals === "number" ? p.pendingApprovals : 0;
      const us = typeof p.unsignedSplits === "number" ? p.unsignedSplits : 0;
      const uc = typeof p.upcomingConcerts === "number" ? p.upcomingConcerts : 0;
      return `Ce mois-ci : ${pa} approbation${pa > 1 ? "s" : ""}, ${us} signature${us > 1 ? "s" : ""} et ${uc} concert${uc > 1 ? "s" : ""} à venir.`;
    }
    default:
      return typeLabels[type] ?? type;
  }
}

export default async function NotificationsPage() {
  const user = await requireUser();

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        {unread > 0 && (
          <form action={markNotificationsReadAction}>
            <button
              type="submit"
              className="rounded-full border border-black/15 px-3 py-1.5 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Tout marquer comme lu
            </button>
          </form>
        )}
      </div>

      {notifications.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/15 p-6 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
          Aucune notification.
        </p>
      ) : (
        <ul className="divide-y divide-black/10 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
          {notifications.map((n) => {
            const p = (n.payload ?? {}) as Record<string, unknown>;
            const projectId = typeof p.projectId === "string" ? p.projectId : null;
            return (
              <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                <span
                  className={
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full " +
                    (n.readAt ? "bg-black/15 dark:bg-white/15" : "bg-blue-500")
                  }
                />
                <div className="min-w-0">
                  <div className="text-sm">{describe(n.type, n.payload)}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-black/40 dark:text-white/40">
                    <span>{n.createdAt.toLocaleString("fr-FR")}</span>
                    {projectId && (
                      <Link href={`/projects/${projectId}`} className="underline">
                        Voir le projet
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
