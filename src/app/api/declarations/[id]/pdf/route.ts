import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/session";
import { canAccessDeclaration, renderDeclarationPdf } from "@/lib/declarations";
import { readVaultObject } from "@/lib/storage";

// GET /api/declarations/:id/pdf — le bulletin : soit la fiche que l'artiste a
// déposée lui-même (archivée dans le vault, servie telle quelle), soit le
// bulletin généré à la volée depuis les données du projet.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { id } = await params;
  if (!(await canAccessDeclaration(id, user.id))) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const declaration = await prisma.sacemDeclaration.findUnique({
    where: { id },
    select: { pdfS3Key: true },
  });
  if (declaration?.pdfS3Key) {
    const bytes = await readVaultObject(declaration.pdfS3Key);
    // Nom lisible : celui de l'objet du vault sans son préfixe de hash.
    const base = declaration.pdfS3Key.split("/").pop() ?? "declaration.pdf";
    const filename = base.replace(/^[0-9a-f]{64}-/, "");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const pdf = await renderDeclarationPdf(id);
  if (!pdf) {
    return NextResponse.json({ error: "Déclaration introuvable." }, { status: 404 });
  }

  return new NextResponse(Buffer.from(pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdf.filename}"`,
    },
  });
}
