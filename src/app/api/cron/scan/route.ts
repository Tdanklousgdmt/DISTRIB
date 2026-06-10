import { NextResponse } from "next/server";

import { optionalEnv } from "@/lib/env";
import { scanVaultBatch } from "@/lib/audd";

// GET /api/cron/scan — scan AudD des fichiers du vault (Sprint 5).
// À appeler 1×/jour. Quota AudD gratuit : 500 req/mois → 10 fichiers/jour max.
export async function GET(request: Request) {
  const secret = optionalEnv("CRON_SECRET");
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const scanned = await scanVaultBatch(10);
  return NextResponse.json({ ok: true, filesScanned: scanned });
}
