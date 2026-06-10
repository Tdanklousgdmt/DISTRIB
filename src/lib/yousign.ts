import "server-only";

import { optionalEnv, yousignConfigured } from "@/lib/env";

// ─────────────────────────────────────────────────────────────────────────────
// Yousign (signatures eIDAS) — Sprint 4.
//
// Tant que YOUSIGN_API_KEY n'est pas provisionné, ces fonctions renvoient null
// et le flux retombe sur la signature manuelle : l'artiste télécharge le PDF,
// le signe et la transmission est tracée à la main. Aucun flux ne casse.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = "https://api.yousign.app/v3";

async function yousignFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${optionalEnv("YOUSIGN_API_KEY")}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

/**
 * Crée une demande de signature pour un PDF de déclaration.
 * Renvoie l'id de la signature request Yousign, ou null (non configuré/erreur).
 */
export async function createSignatureRequest(params: {
  pdfBytes: Uint8Array;
  filename: string;
  signerEmail: string;
  signerName: string | null;
}): Promise<string | null> {
  if (!yousignConfigured()) return null;
  try {
    // 1. Créer la signature request (brouillon)
    const srRes = await yousignFetch("/signature_requests", {
      method: "POST",
      body: JSON.stringify({
        name: params.filename,
        delivery_mode: "email",
        timezone: "Europe/Paris",
      }),
    });
    if (!srRes.ok) throw new Error(`signature_requests → ${srRes.status}`);
    const sr = (await srRes.json()) as { id: string };

    // 2. Joindre le document (multipart)
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(params.pdfBytes)], { type: "application/pdf" }),
      params.filename,
    );
    form.append("nature", "signable_document");
    const docRes = await fetch(`${BASE_URL}/signature_requests/${sr.id}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${optionalEnv("YOUSIGN_API_KEY")}` },
      body: form,
    });
    if (!docRes.ok) throw new Error(`documents → ${docRes.status}`);

    // 3. Ajouter le signataire (signature simple eIDAS)
    const [firstName, ...rest] = (params.signerName ?? "Artiste DISTRIB").split(" ");
    const signerRes = await yousignFetch(`/signature_requests/${sr.id}/signers`, {
      method: "POST",
      body: JSON.stringify({
        info: {
          first_name: firstName,
          last_name: rest.join(" ") || "—",
          email: params.signerEmail,
          locale: "fr",
        },
        signature_level: "electronic_signature",
        signature_authentication_mode: "no_otp",
      }),
    });
    if (!signerRes.ok) throw new Error(`signers → ${signerRes.status}`);

    // 4. Activer
    const activateRes = await yousignFetch(`/signature_requests/${sr.id}/activate`, {
      method: "POST",
    });
    if (!activateRes.ok) throw new Error(`activate → ${activateRes.status}`);

    return sr.id;
  } catch (e) {
    console.error("[yousign] création de la demande échouée :", e);
    return null;
  }
}
