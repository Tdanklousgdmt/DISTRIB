// Accès centralisé aux variables d'environnement, avec garde explicite.
//
// Beaucoup de services (S3, Resend, Polygon) ne sont provisionnés qu'au fil des
// sprints. Plutôt que de planter au boot, chaque module vérifie *à l'usage* que
// sa config est présente, et renvoie une erreur métier claire sinon.

/** Renvoie la variable demandée ou `undefined` si vide/absente. */
export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

/** Renvoie la variable demandée ou lève une erreur explicite. */
export function requireEnv(name: string): string {
  const value = optionalEnv(name);
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}

/** Vrai si TOUTES les variables fournies sont renseignées. */
export function hasEnv(...names: string[]): boolean {
  return names.every((name) => optionalEnv(name) !== undefined);
}

/** Config S3 — présente uniquement si le bucket vault est provisionné. */
export function s3Configured(): boolean {
  return hasEnv(
    "AWS_REGION",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "S3_BUCKET_VAULT",
  );
}

/** Config email magic-link (Resend). */
export function resendConfigured(): boolean {
  return hasEnv("RESEND_API_KEY", "EMAIL_FROM");
}
