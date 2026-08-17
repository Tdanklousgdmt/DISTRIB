import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/session";
import { buildProjectLedger, toLedgerPdfData } from "@/lib/ledger";
import { buildLedgerPdf } from "@/lib/pdf";

// GET /api/projects/:id/ledger/pdf — registre des transactions blockchain du
// projet (attestation pour un tiers : label, avocat). Réservé aux membres.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { contributors: { select: { userId: true } } },
  });
  if (!project) {
    return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
  }
  const authorized =
    project.ownerId === user.id || project.contributors.some((c) => c.userId === user.id);
  if (!authorized) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const ledger = await buildProjectLedger(id);
  if (!ledger) {
    return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
  }

  const bytes = await buildLedgerPdf(toLedgerPdfData(ledger));
  const slug = ledger.projectTitle.replace(/[^\w-]+/g, "_").slice(0, 60);

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="registre-blockchain-${slug}.pdf"`,
    },
  });
}
