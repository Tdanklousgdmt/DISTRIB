import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/session";
import { readVaultObject } from "@/lib/storage";

// GET /api/signature-requests/:id/document[?signed=1]
// Le PDF soumis à signature (ou, une fois complet, le PDF scellé avec sa page
// de signatures). Réservé aux parties et au demandeur.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const { id } = await params;
  const req = await prisma.signatureRequest.findUnique({
    where: { id },
    include: { signers: { select: { userId: true } } },
  });
  if (!req) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  const allowed = req.requestedById === user.id || req.signers.some((s) => s.userId === user.id);
  if (!allowed) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const wantSigned = new URL(request.url).searchParams.get("signed") === "1";
  const key = wantSigned ? req.signedDocumentKey : req.documentKey;
  if (!key) return NextResponse.json({ error: "Document signé pas encore disponible." }, { status: 404 });

  const bytes = await readVaultObject(key);
  const filename = key.split("/").pop() ?? "document.pdf";
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${wantSigned ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
