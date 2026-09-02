import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/session";
import { readVaultObject } from "@/lib/storage";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/vault-files/[id]/audio — relit le fichier pour écoute comparative
// (réclamations de similarité, section 1.8 du cahier des charges : "deux
// extraits ... comparés côte à côte"). Jamais de lien de téléchargement
// public — accès réservé aux membres du projet propriétaire, ou aux deux
// parties d'une réclamation impliquant ce fichier.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const file = await prisma.vaultFile.findUnique({
    where: { id },
    include: {
      version: { include: { project: { include: { contributors: true } } } },
    },
  });
  if (!file) {
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  }

  const isProjectMember =
    file.version.project.ownerId === user.id ||
    file.version.project.contributors.some((c) => c.userId === user.id);

  let authorized = isProjectMember;
  if (!authorized) {
    const claim = await prisma.claim.findFirst({
      where: { OR: [{ targetFileId: id }, { claimantFileId: id }] },
      include: {
        targetFile: {
          include: { version: { include: { project: { include: { contributors: true } } } } },
        },
        claimantFile: {
          include: { version: { include: { project: { include: { contributors: true } } } } },
        },
      },
    });
    if (claim) {
      const isMember = (p: { ownerId: string; contributors: { userId: string }[] }) =>
        p.ownerId === user.id || p.contributors.some((c) => c.userId === user.id);
      authorized =
        isMember(claim.targetFile.version.project) ||
        isMember(claim.claimantFile.version.project);
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const bytes = await readVaultObject(file.s3Key);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.mimeType || "audio/wav",
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.filename)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
