"use server";

import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { auth, signIn } from "@/lib/auth";
import { openPendingApprovalsForContributor } from "@/lib/vault";

// ─────────────────────────────────────────────────────────────────────────────
// « Créer mon accès et approuver » — parcours du collaborateur invité (§2.4) :
// le plus court possible, parce qu'un invité qui abandonne, c'est une version
// bloquée. Trois cas :
//   · déjà connecté avec le bon compte → on marque l'invitation acceptée et
//     on ouvre le projet ;
//   · en développement (pas de Resend) → accès direct, même mécanisme que
//     /api/dev/login, verrouillé sur NODE_ENV ;
//   · en production → lien magique vers l'e-mail de l'invité, retour direct
//     sur le projet.
// ─────────────────────────────────────────────────────────────────────────────

export async function acceptInviteAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (!token) redirect("/signin");

  const contributor = await prisma.projectContributor.findUnique({
    where: { inviteToken: token },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!contributor) redirect("/signin");

  const target = `/projects/${contributor.projectId}`;
  const session = await auth();

  if (session?.user?.id === contributor.userId) {
    await markAccepted(contributor.id);
    redirect(target);
  }

  if (process.env.NODE_ENV !== "production") {
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const created = await prisma.session.create({
      data: { sessionToken: randomUUID(), userId: contributor.userId, expires },
    });
    const jar = await cookies();
    jar.set("authjs.session-token", created.sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      expires,
    });
    await markAccepted(contributor.id);
    redirect(target);
  }

  await markAccepted(contributor.id);
  await signIn("resend", { email: contributor.user.email, redirectTo: target });
}

async function markAccepted(contributorId: string) {
  await prisma.projectContributor.updateMany({
    where: { id: contributorId, acceptedAt: null },
    data: { acceptedAt: new Date() },
  });
  // Filet de sécurité : les dépôts en attente au moment de l'arrivée.
  await openPendingApprovalsForContributor(contributorId);
}
