import "server-only";

import { prisma } from "@/lib/prisma";
import { appendSignaturePage, buildAdamiPdf, buildLivePdf, buildOeuvrePdf, buildSpedidamPdf } from "@/lib/pdf";
import { getSignatureProvider } from "@/lib/esign";

const roleLabels: Record<string, string> = {
  ARTIST: "Artiste",
  CO_AUTHOR: "Co-auteur",
  BEATMAKER: "Beatmaker",
  CO_BEATMAKER: "Co-beatmaker",
};

// Construit le PDF d'une déclaration depuis la BDD (à la volée — pas besoin
// de S3 pour télécharger un bulletin, le stockage n'est qu'un cache).
export async function renderDeclarationPdf(declarationId: string): Promise<{
  bytes: Uint8Array;
  filename: string;
} | null> {
  const declaration = await prisma.sacemDeclaration.findUnique({
    where: { id: declarationId },
    include: {
      project: {
        include: { contributors: { include: { user: { select: { name: true, email: true } } } } },
      },
      version: {
        include: {
          files: { select: { filename: true, sha256Hash: true, uploadedAt: true } },
          splits: { include: { contributor: { include: { user: true } } } },
          signatureRequests: {
            where: { status: "COMPLETED" },
            orderBy: { completedAt: "desc" },
            take: 1,
            include: { signers: true },
          },
        },
      },
      concert: { include: { artist: true } },
    },
  });
  if (!declaration) return null;

  if (declaration.type === "OEUVRE" && declaration.version && declaration.project) {
    const v = declaration.version;
    const signed = v.signatureRequests[0] ?? null;
    const generatedAt = new Date();
    // Durée de l'œuvre : celle de la version, sinon la dernière connue du projet.
    const durationSeconds =
      v.durationSeconds ??
      (
        await prisma.version.findFirst({
          where: { projectId: declaration.project.id, durationSeconds: { not: null } },
          orderBy: { versionNumber: "desc" },
          select: { durationSeconds: true },
        })
      )?.durationSeconds ??
      null;
    let bytes = await buildOeuvrePdf({
      projectTitle: declaration.project.title,
      isrc: declaration.project.isrc,
      versionNumber: v.versionNumber,
      finalizedAt: v.finalizedAt,
      finalPolygonTxHash: v.finalPolygonTxHash,
      durationSeconds,
      performers: declaration.project.contributors
        .filter((c) => c.role === "ARTIST")
        .map((c) => c.user.name ?? c.user.email),
      rightHolders: v.splits.map((s) => ({
        name: s.contributor.user.name ?? s.contributor.user.email,
        role: s.roleLabel ?? (roleLabels[s.contributor.role] ?? s.contributor.role),
        percentage: Number(s.percentage).toFixed(2),
        email: s.contributor.user.email,
        ipi: s.contributor.user.ipiCode,
        signedAt: s.signedAt,
      })),
      files: v.files.map((f) => ({ filename: f.filename, sha256: f.sha256Hash, uploadedAt: f.uploadedAt })),
      generatedAt,
      electronicallySigned: Boolean(signed),
    });
    if (signed) {
      bytes = await appendSignaturePage(bytes, {
        title: signed.title,
        requestId: signed.id,
        documentSha256: signed.documentSha256,
        providerLabel: getSignatureProvider().label,
        level: signed.level,
        completedAt: signed.completedAt ?? generatedAt,
        signers: signed.signers.map((sg) => ({
          name: sg.signedName ?? sg.name ?? sg.email,
          email: sg.email,
          signedAt: sg.signedAt,
          ipAddress: sg.ipAddress,
          userAgent: sg.userAgent,
          signatureImage: sg.signatureImage,
        })),
      });
    }
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

  if (declaration.type === "ADAMI_ATTESTATION" && declaration.version && declaration.project) {
    const v = declaration.version;
    const bytes = await buildAdamiPdf({
      projectTitle: declaration.project.title,
      versionNumber: v.versionNumber,
      finalizedAt: v.finalizedAt,
      performers: declaration.project.contributors.map((c) => ({
        name: c.user.name ?? c.user.email,
        role: roleLabels[c.role] ?? c.role,
      })),
      generatedAt: new Date(),
    });
    const slug = declaration.project.title.replace(/[^\w-]+/g, "_").slice(0, 60);
    return { bytes, filename: `adami-attestation-${slug}-v${v.versionNumber}.pdf` };
  }

  if (declaration.type === "SPEDIDAM_PRESENCE" && declaration.concert) {
    const concert = declaration.concert;
    const performers = Array.isArray(concert.performers)
      ? (concert.performers as unknown as Array<{ name: string; role: string }>)
      : [];
    const bytes = await buildSpedidamPdf({
      venue: concert.venue,
      date: concert.date,
      city: concert.city,
      performers,
      generatedAt: new Date(),
    });
    const day = concert.date.toISOString().slice(0, 10);
    return { bytes, filename: `spedidam-presence-${day}.pdf` };
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
