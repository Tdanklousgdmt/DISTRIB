// ─────────────────────────────────────────────────────────────────────────────
// Plugin de signature électronique — contrat commun à tous les fournisseurs.
//
// DISTRIB ne dépend d'aucun prestataire en particulier (§6.1 du mémoire :
// critère éliminatoire = liste de confiance ANSSI, niveau avancé par défaut).
// Un fournisseur sait faire UNE chose : ouvrir une demande de signature sur un
// PDF pour N signataires, et rendre un lien de cérémonie par signataire.
// Tout le reste (document, archivage, statuts, notifications) est à DISTRIB.
// ─────────────────────────────────────────────────────────────────────────────

export type SignatureLevel = "SIMPLE" | "ADVANCED" | "QUALIFIED";
export type SignatureProviderKind = "LOCAL" | "YOUSIGN";

export interface EsignSignerInput {
  id: string; // SignatureSigner.id
  email: string;
  name: string | null;
}

export interface EsignCreateInput {
  requestId: string;
  title: string;
  filename: string;
  pdfBytes: Uint8Array;
  level: SignatureLevel;
  signers: EsignSignerInput[];
}

export interface EsignCreateResult {
  externalId: string | null;
  /** SignatureSigner.id → URL de cérémonie (relative pour le pilote local). */
  signerLinks: Record<string, string>;
}

export interface SignatureProvider {
  kind: SignatureProviderKind;
  /** Libellé affiché à l'utilisateur (« Signature DISTRIB », « Yousign »…). */
  label: string;
  supportedLevels: SignatureLevel[];
  createRequest(input: EsignCreateInput): Promise<EsignCreateResult>;
}
