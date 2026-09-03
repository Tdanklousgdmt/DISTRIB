import { createSignatureRequest } from "@/lib/yousign";

import type { SignatureProvider } from "./types";

// Adaptateur Yousign (prestataire français, liste de confiance ANSSI) derrière
// le même contrat que le pilote local. Démo : réutilise le client existant
// (une demande par signataire, livraison par e-mail Yousign). Pour la
// production il reste à brancher le webhook `signature_request.done` →
// SignatureSigner.SIGNED + récupération du PDF signé dans le vault.
export const yousignProvider: SignatureProvider = {
  kind: "YOUSIGN",
  label: "Yousign (eIDAS)",
  supportedLevels: ["SIMPLE", "ADVANCED", "QUALIFIED"],
  async createRequest(input) {
    let externalId: string | null = null;
    for (const s of input.signers) {
      const id = await createSignatureRequest({
        pdfBytes: input.pdfBytes,
        filename: input.filename,
        signerEmail: s.email,
        signerName: s.name,
      });
      externalId ??= id;
    }
    // Yousign envoie lui-même les liens par e-mail : rien à afficher côté DISTRIB.
    return { externalId, signerLinks: {} };
  },
};
