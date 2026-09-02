// Tuiles d'identité (avatar par initiales) — partagées entre la sidebar, les
// cartes de dépôt et la fiche SACEM, pour qu'une même personne ait toujours
// la même couleur partout. Fonctions pures, utilisables côté client et serveur.

export const AVATAR_COLORS = ["#4B4E8F", "#3F7A5E", "#8F5A3F", "#5A5A8F", "#3F7A8F", "#8F3F5A"];

export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** « Maya Kone » → MK ; « maya » → MA ; « maya.k@x.fr » → MA. */
export function initials(nameOrEmail: string): string {
  const base = nameOrEmail.split("@")[0].trim();
  const words = base.split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase() || "??";
}

/** Nom affichable : le nom s'il existe, sinon la partie locale de l'e-mail. */
export function displayName(user: { name: string | null; email: string }): string {
  return user.name?.trim() || user.email.split("@")[0];
}
