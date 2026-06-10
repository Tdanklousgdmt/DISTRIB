import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

/**
 * Récupère l'utilisateur authentifié ou redirige vers /signin.
 * À utiliser dans tout Server Component / Server Action protégé.
 *
 * Rappel Next 16 : on ne s'appuie PAS sur le proxy (ex-middleware) pour
 * l'autorisation — la vérification se fait ici, au plus près de la donnée.
 */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  return session.user;
}

/** Variante pour les route handlers : renvoie l'user ou `null` (pas de redirect). */
export async function getUser() {
  const session = await auth();
  return session?.user?.id ? session.user : null;
}
