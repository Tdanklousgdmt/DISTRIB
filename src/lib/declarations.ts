import "server-only";

import { prisma } from "@/lib/prisma";
import { buildLivePdf, buildOeuvrePdf } from "@/lib/pdf";

// Construit le PDF d'une déclaration depuis la BDD (à la volée — pas besoin
// de S3 pour télécharger un bulletin, le stockage n'est qu'un cache).
export async function renderDeclarationPdf(declarationId: string): Promise<{
  bytes: Uint8Array;
  filename: string;
} | null> {
  const declaration = await prisma.sacemDeclaration.findUnique({
    where: { id: declarationId },
    include: {
      project: true,
      version: {
        include: {
          files: { select: { filename: true, sha256Hash: true } },
          splits: { include: { contributor: { include: { user: true } } } },
        },
      },
      concert: { include: { artist: true } },
    },
  });
  if (!declaration) return null;

  if (declaration.type === "OEUVRE" && declaration.version && declaration.project) {
    const v = declaration.version;
    const bytes = await buildOeuvrePdf({
      projectTitle: declaration.project.title,
      isrc: declaration.project.isrc,
      versionNumber: v.versionNumber,
      finalizedAt: v.finalizedAt,
      finalPolygonTxHash: v.finalPolygonTxHash,
      rightHolders: v.splits.map((s) => ({
        name: s.contributor.user.name ?? s.contributor.user.email,
        role: s.roleLabel ?? s.contributor.role,
        percentage: Number(s.percentage).toFixed(2),
      })),
      files: v.files.map((f) => ({ filename: f.filename, sha256: f.sha256Hash })),
      generatedAt: new Date(),
    });
    const slug = declaration.project.title.replace(/[^\w-]+/g, "_").slice(0, 60);
    return { bytes, filename: `sacem-oeuvre-${slug}-v${v.versionNumber}.pdf` };
  }

  if (declaration.type === "LIVE" && declaration.concert) {
    const concert = declaration.concert;
    const setlist = Array.isArray(concert.setlist)
      ? (concert.setlist as unknown[]).map(String)
      : [];
    const bytes = await buildLivePdf({
      artistName: concert.artist.name ?? concert.artist.email,
      date: concert.date,
      venue: concert.venue,
      city: concert.city,
      country: concert.country,
      estimatedAudience: concert.estimatedAudience,
      actualAudience: concert.actualAudience,
      setlist,
      generatedAt: new Date(),
    });
    const day = concert.date.toISOString().slice(0, 10);
    return { bytes, filename: `sacem-live-${day}.pdf` };
  }

  return null;
}

/** L'utilisateur a-t-il le droit de voir cette déclaration ? */
export async function canAccessDeclaration(
  declarationId: string,
  userId: string,
): Promise<boolean> {
  const declaration = await prisma.sacemDeclaration.findUnique({
    where: { id: declarationId },
    include: {
      project: { include: { contributors: { select: { userId: true } } } },
      concert: { select: { artistUserId: true } },
    },
  });
  if (!declaration) return false;
  if (declaration.concert?.artistUserId === userId) return true;
  if (declaration.project) {
    if (declaration.project.ownerId === userId) return true;
    if (declaration.project.contributors.some((c) => c.userId === userId)) return true;
  }
  return false;
}
