import { NextResponse } from "next/server";

import { getUser } from "@/lib/session";
import { canAccessDeclaration, renderDeclarationPdf } from "@/lib/declarations";

// GET /api/declarations/:id/pdf — télécharge le bulletin SACEM (généré à la volée).
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
