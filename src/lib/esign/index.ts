import "server-only";

import { optionalEnv, yousignConfigured } from "@/lib/env";

import { localProvider } from "./local";
import { yousignProvider } from "./yousign";
import type { SignatureLevel, SignatureProvider } from "./types";

export type { EsignCreateInput, EsignCreateResult, EsignSignerInput, SignatureLevel, SignatureProvider, SignatureProviderKind } from "./types";

/**
 * Fournisseur actif. ESIGN_PROVIDER=yousign (+ YOUSIGN_API_KEY) pour le
 * prestataire eIDAS ; sinon le pilote local — l'app fonctionne sans aucun tiers.
 */
export function getSignatureProvider(): SignatureProvider {
  const wanted = (optionalEnv("ESIGN_PROVIDER") ?? "local").toLowerCase();
  if (wanted === "yousign" && yousignConfigured()) return yousignProvider;
  return localProvider;
}

/** Niveau demandé (ESIGN_LEVEL), rabattu sur ce que le fournisseur sait faire. */
export function requestedSignatureLevel(provider: SignatureProvider): SignatureLevel {
  const wanted = (optionalEnv("ESIGN_LEVEL") ?? "ADVANCED").toUpperCase() as SignatureLevel;
  return provider.supportedLevels.includes(wanted) ? wanted : provider.supportedLevels[0];
}
