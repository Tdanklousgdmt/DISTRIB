import "server-only";

import { optionalEnv, resendConfigured } from "@/lib/env";

// Envoi d'e-mails transactionnels via l'API REST Resend (rappels concerts,
// confirmations). No-op silencieux si RESEND_API_KEY n'est pas provisionné —
// les notifications in-app restent la source principale d'information.
export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  if (!resendConfigured()) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${optionalEnv("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: optionalEnv("EMAIL_FROM"),
        to: [params.to],
        subject: params.subject,
        text: params.text,
      }),
    });
    if (!res.ok) {
      console.error("[email] Resend a répondu", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] envoi échoué :", e);
    return false;
  }
}
