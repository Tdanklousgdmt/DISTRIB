import type { SignatureProvider } from "./types";

// Pilote local : signature électronique « simple » (eIDAS, art. 25 — effet
// juridique non refusé au seul motif de sa forme électronique ; art. 1367 C.
// civ. : procédé fiable d'identification garantissant le lien avec l'acte).
//
// La cérémonie se déroule dans DISTRIB (/sign/[signerId]) : lecture du
// document, consentement exprès, nom tapé + tracé, horodatage serveur, IP,
// navigateur, hash SHA-256 du document — consignés sur la page de signatures
// ajoutée au PDF final. Aucun tiers, aucune donnée qui sort.
export const localProvider: SignatureProvider = {
  kind: "LOCAL",
  label: "Signature DISTRIB (électronique simple)",
  supportedLevels: ["SIMPLE"],
  async createRequest(input) {
    const signerLinks: Record<string, string> = {};
    for (const s of input.signers) signerLinks[s.id] = `/sign/${s.id}`;
    return { externalId: null, signerLinks };
  },
};
