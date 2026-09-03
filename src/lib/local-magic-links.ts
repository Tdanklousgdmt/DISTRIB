// ─────────────────────────────────────────────────────────────────────────────
// Mode 100 % local (pas de RESEND_API_KEY) : aucun e-mail ne part. Sans cela,
// l'utilisateur reste bloqué sur « Vérifiez votre boîte mail » — le lien n'existe
// que dans la console du serveur. On garde donc le dernier lien généré en
// mémoire pour l'afficher sur la page /verify.
//
// Verrouillage dur : inerte en production (NODE_ENV), quel que soit l'état de
// la configuration e-mail. Rien n'est persisté, rien ne quitte le processus.
// ─────────────────────────────────────────────────────────────────────────────

export interface LocalMagicLink {
  email: string;
  url: string;
  createdAt: number;
}

const TTL_MS = 15 * 60 * 1000;

declare global {
  // eslint-disable-next-line no-var
  var distribLocalMagicLink: LocalMagicLink | undefined;
}

export function localMagicLinksEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function rememberLocalMagicLink(email: string, url: string): void {
  if (!localMagicLinksEnabled()) return;
  globalThis.distribLocalMagicLink = { email, url, createdAt: Date.now() };
}

/** Le dernier lien généré, s'il a moins de 15 minutes. Toujours undefined en production. */
export function latestLocalMagicLink(): LocalMagicLink | undefined {
  if (!localMagicLinksEnabled()) return undefined;
  const link = globalThis.distribLocalMagicLink;
  if (!link || Date.now() - link.createdAt > TTL_MS) return undefined;
  return link;
}
