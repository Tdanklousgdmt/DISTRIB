import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { optionalEnv } from "@/lib/env";
import { pendingAnchorsForProject, replayPendingAnchors } from "@/lib/blockchain";

// GET /api/cron/replay-anchors — rejoue les ancrages Polygon manquants (wallet
// rechargé, RPC indisponible au moment du dépôt…). À appeler toutes les heures :
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/replay-anchors
export async function GET(request: Request) {
  const secret = optionalEnv("CRON_SECRET");
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const projects = await prisma.project.findMany({ select: { id: true, title: true } });
  const report: Array<{ project: string; done: number; remaining: number }> = [];
  for (const p of projects) {
    const pending = await pendingAnchorsForProject(p.id);
    if (pending.total === 0) continue;
    const r = await replayPendingAnchors(p.id);
    report.push({ project: p.title, ...r });
    if (r.remaining > 0 && r.done === 0) break; // inutile d'insister si le wallet est vide
  }
  return NextResponse.json({ ok: true, report });
}
