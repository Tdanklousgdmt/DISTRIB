"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/session";
import { signLocally } from "@/lib/esign/service";
import type { ActionState } from "../actions";

/**
 * Cérémonie de signature (pilote local) : consentement exprès + nom + tracé.
 * L'adresse IP et le navigateur sont relevés ici, côté serveur — ils font
 * partie de la piste d'audit consignée sur la page de signatures du PDF.
 */
export async function signLocallyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const signerId = String(formData.get("signerId") ?? "");
  const signedName = String(formData.get("signedName") ?? "").trim();
  const consent = formData.get("consent") === "on";
  const image = String(formData.get("signatureImage") ?? "");

  if (!consent) return { error: "Le consentement est requis pour signer." };
  if (signedName.length < 2) return { error: "Indiquez votre nom complet." };

  const h = await headers();
  const ipAddress =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  const userAgent = h.get("user-agent");

  const result = await signLocally({
    signerId,
    userId: user.id,
    signedName,
    signatureImage: image.startsWith("data:image/png;base64,") && image.length < 400_000 ? image : null,
    ipAddress,
    userAgent,
  });
  if (result.error) return { error: result.error };

  revalidatePath(`/sign/${signerId}`);
  if (result.versionId) revalidatePath("/projects", "layout");
  return undefined;
}
