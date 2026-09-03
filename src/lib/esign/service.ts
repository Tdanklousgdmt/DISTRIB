import "server-only";

import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { appendSignaturePage, buildOeuvrePdf } from "@/lib/pdf";
import {
  fillBulletin726,
  stampBulletin726Signatures,
  BULLETIN_726_MAX_CREATORS,
  type Bulletin726Creator,
  type CreatorCategory,
} from "@/lib/sacem/bulletin726";
import type { Bulletin726Input } from "@/lib/validators";
import { readVaultObject, storeVaultObject } from "@/lib/storage";
import { createNotification } from "@/lib/vault";
import { sendEmail } from "@/lib/email";
import { optionalEnv } from "@/lib/env";

import { getSignatureProvider, requestedSignatureLevel } from "./index";

// ─────────────────────────────────────────────────────────────────────────────
// Service de signature : ce que DISTRIB fait autour du fournisseur —
// produire le document, l'archiver, suivre les signataires, sceller le PDF
// final. Indépendant du pilote choisi.
// ─────────────────────────────────────────────────────────────────────────────

const CONSENT_TEXT =
  "J'ai lu le document ci-dessus. Je consens à le signer électroniquement et " +
  "reconnais que cette signature a la même valeur que ma signature manuscrite " +
  "(règlement eIDAS, art. 25 ; Code civil, art. 1367).";

export function signatureConsentText(): string {
  return CONSENT_TEXT;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Écrit dans le vault en tolérant un objet identique déjà présent (clé = hash). */
async function storeOnce(key: string, body: Uint8Array, hash: string): Promise<void> {
  try {
    await storeVaultObject({ key, body, contentType: "application/pdf", sha256: hash });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
}

function appUrl(path: string): string {
  return `${optionalEnv("AUTH_URL") ?? "http://localhost:3000"}${path}`;
}

/**
 * « Adresser en signature » : génère la fiche de répartition (PDF), l'archive,
 * ouvre une demande auprès du fournisseur actif pour chaque contributeur,
 * remplace toute demande encore ouverte sur cette version.
 */
export async function startSplitsSignatureRequest(params: {
  versionId: string;
  requestedById: string;
}): Promise<{ requestId: string; providerLabel: string }> {
  const version = await prisma.version.findUniqueOrThrow({
    where: { id: params.versionId },
    include: {
      project: {
        include: { contributors: { include: { user: { select: { id: true, email: true, name: true } } } } },
      },
      splits: { include: { contributor: { include: { user: { select: { id: true, email: true, name: true } } } } } },
      files: { select: { filename: true, sha256Hash: true } },
    },
  });

  await prisma.signatureRequest.updateMany({
    where: { versionId: version.id, status: "PENDING" },
    data: { status: "CANCELLED" },
  });

  const provider = getSignatureProvider();
  const level = requestedSignatureLevel(provider);
  const title = `Répartition des droits — ${version.project.title} (v${version.versionNumber})`;

  const pdfBytes = await buildOeuvrePdf({
    projectTitle: version.project.title,
    isrc: version.project.isrc,
    versionNumber: version.versionNumber,
    finalizedAt: version.finalizedAt,
    finalPolygonTxHash: version.finalPolygonTxHash,
    rightHolders: version.splits.map((s) => ({
      name: s.contributor.user.name ?? s.contributor.user.email,
      role: s.roleLabel ?? s.contributor.role,
      percentage: Number(s.percentage).toFixed(2),
    })),
    files: version.files.map((f) => ({ filename: f.filename, sha256: f.sha256Hash })),
    generatedAt: new Date(),
  });
  const hash = sha256(pdfBytes);
  const filename = `fiche-repartition-v${version.versionNumber}.pdf`;
  const documentKey = `${version.projectId}/${version.id}/signatures/${hash}-${filename}`;
  await storeOnce(documentKey, pdfBytes, hash);

  const request = await prisma.signatureRequest.create({
    data: {
      kind: "SPLITS",
      provider: provider.kind,
      level,
      title,
      versionId: version.id,
      documentKey,
      documentSha256: hash,
      requestedById: params.requestedById,
      // Signataires = les ayants droit de la fiche (part > 0), pas tout le projet.
      signers: {
        create: version.splits.map((s) => ({
          userId: s.contributor.user.id,
          email: s.contributor.user.email,
          name: s.contributor.user.name,
        })),
      },
    },
    include: { signers: true },
  });

  const result = await provider.createRequest({
    requestId: request.id,
    title,
    filename,
    pdfBytes,
    level,
    signers: request.signers.map((s) => ({ id: s.id, email: s.email, name: s.name })),
  });

  await prisma.signatureRequest.update({
    where: { id: request.id },
    data: { externalId: result.externalId },
  });
  await Promise.all(
    request.signers.map((s) =>
      prisma.signatureSigner.update({
        where: { id: s.id },
        data: { signatureLink: result.signerLinks[s.id] ?? null },
      }),
    ),
  );

  // Notifications + e-mails (le pilote local n'envoie rien lui-même).
  await Promise.all(
    request.signers.map(async (s) => {
      await createNotification({
        userId: s.userId,
        type: "SPLIT_SIGNATURE_REQUESTED",
        payload: {
          projectId: version.projectId,
          projectTitle: version.project.title,
          versionId: version.id,
          versionNumber: version.versionNumber,
          signerId: s.id,
        },
      });
      const link = result.signerLinks[s.id];
      if (s.userId !== params.requestedById && link) {
        await sendEmail({
          to: s.email,
          subject: `Votre part sur « ${version.project.title} » attend votre signature`,
          text:
            `Une répartition des droits vous est adressée en signature électronique sur DISTRIB : ` +
            `« ${version.project.title} » (version ${version.versionNumber}).\n\nSigner : ${appUrl(link)}`,
        });
      }
    }),
  );

  return { requestId: request.id, providerLabel: provider.label };
}

/**
 * Cérémonie locale : consigne la signature d'un signataire avec sa piste
 * d'audit, aligne Split.signedAt, et scelle le PDF final quand tout le monde
 * a signé.
 */
export async function signLocally(params: {
  signerId: string;
  userId: string;
  signedName: string;
  signatureImage: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<{ error?: string; completed?: boolean; versionId?: string | null }> {
  const signer = await prisma.signatureSigner.findUnique({
    where: { id: params.signerId },
    include: { request: { include: { signers: true, version: { select: { id: true, projectId: true, versionNumber: true } } } } },
  });
  if (!signer) return { error: "Demande de signature introuvable." };
  if (signer.userId !== params.userId) return { error: "Vous ne pouvez signer que pour vous-même." };
  if (signer.request.provider !== "LOCAL") return { error: "Cette demande est gérée par le prestataire externe." };
  if (signer.request.status !== "PENDING") return { error: "Cette demande n'est plus ouverte." };
  if (signer.status === "SIGNED") return { error: "Déjà signée." };

  const now = new Date();
  await prisma.signatureSigner.update({
    where: { id: signer.id },
    data: {
      status: "SIGNED",
      signedAt: now,
      signedName: params.signedName,
      signatureImage: params.signatureImage,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      consentText: CONSENT_TEXT,
    },
  });

  // La part correspondante est signée (checklist SACEM, page projet…).
  if (signer.request.kind === "SPLITS" && signer.request.versionId) {
    await prisma.split.updateMany({
      where: {
        versionId: signer.request.versionId,
        contributor: { userId: signer.userId },
        signedAt: null,
      },
      data: { signedAt: now },
    });
  }

  const remaining = signer.request.signers.filter((s) => s.id !== signer.id && s.status !== "SIGNED");
  if (remaining.length > 0) {
    return { completed: false, versionId: signer.request.versionId };
  }

  await sealSignedDocument(signer.request.id);
  return { completed: true, versionId: signer.request.versionId };
}

/** Tous ont signé : PDF original + page de signatures → vault, demande COMPLETED. */
async function sealSignedDocument(requestId: string): Promise<void> {
  const request = await prisma.signatureRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { signers: true, version: { include: { project: { select: { id: true, title: true } } } } },
  });
  const original = await readVaultObject(request.documentKey);
  const provider = getSignatureProvider();
  const completedAt = new Date();
  const meta = (request.metadata ?? {}) as { template?: string; signerOrder?: string[] };

  // Bulletin SACEM 726 : chaque marque va dans la case « Signature » de son
  // créateur, « Fait le » est daté, le formulaire est aplati.
  let stamped: Uint8Array = new Uint8Array(original);
  if (request.kind === "DECLARATION" && meta.template === "sacem-726") {
    const order = meta.signerOrder ?? request.signers.map((s) => s.userId);
    stamped = await stampBulletin726Signatures(
      stamped,
      request.signers
        .filter((s) => s.signedAt)
        .map((s) => ({
          index: order.indexOf(s.userId),
          name: s.signedName ?? s.name ?? s.email,
          signedAt: s.signedAt!,
          signatureImage: s.signatureImage,
        }))
        .filter((s) => s.index >= 0),
      completedAt,
    );
  }

  const signed = await appendSignaturePage(stamped, {
    title: request.title,
    requestId: request.id,
    documentSha256: request.documentSha256,
    providerLabel: provider.label,
    level: request.level,
    completedAt,
    signers: request.signers.map((s) => ({
      name: s.signedName ?? s.name ?? s.email,
      email: s.email,
      signedAt: s.signedAt,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      signatureImage: s.signatureImage,
    })),
  });
  const hash = sha256(signed);
  const base = request.documentKey.replace(/\.pdf$/, "");
  const signedKey = `${base}-signee-${hash.slice(0, 12)}.pdf`;
  await storeOnce(signedKey, signed, hash);

  await prisma.signatureRequest.update({
    where: { id: request.id },
    data: { status: "COMPLETED", completedAt, signedDocumentKey: signedKey, signedDocumentSha256: hash },
  });

  if (request.kind === "DECLARATION" && request.declarationId) {
    await prisma.sacemDeclaration.update({
      where: { id: request.declarationId },
      data: { status: "SIGNED", pdfS3Bucket: "vault", pdfS3Key: signedKey },
    });
    await Promise.all(
      request.signers.map((s) =>
        createNotification({
          userId: s.userId,
          type: "SACEM_SIGNED",
          payload: {
            projectId: request.version?.projectId ?? null,
            projectTitle: request.version?.project.title ?? null,
            declarationId: request.declarationId,
            requestId: request.id,
          },
        }),
      ),
    );
    return;
  }

  if (request.version) {
    await Promise.all(
      request.signers.map((s) =>
        createNotification({
          userId: s.userId,
          type: "SPLIT_SIGNED",
          payload: {
            projectId: request.version!.projectId,
            projectTitle: request.version!.project.title,
            versionId: request.versionId,
            versionNumber: request.version!.versionNumber,
            requestId: request.id,
          },
        }),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulletin SACEM 726 — pré-rempli depuis le vault, signé par chaque créateur.
// ─────────────────────────────────────────────────────────────────────────────

/** « Prénom Nom » → { prenom, nom } ; sans nom connu, l'identifiant e-mail. */
function splitName(name: string | null, email: string): { prenom: string; nom: string } {
  const clean = (name ?? "").trim();
  if (!clean) return { prenom: "", nom: email.split("@")[0] };
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return { prenom: "", nom: parts[0] };
  return { prenom: parts[0], nom: parts.slice(1).join(" ") };
}

/** Catégories SACEM déduites du rôle projet et du libellé de la part. */
export function creatorCategories(role: string, roleLabel: string | null): CreatorCategory[] {
  const label = (roleLabel ?? "").toLowerCase();
  const cats = new Set<CreatorCategory>();
  if (/arrang/.test(label)) cats.add("arrangeur");
  if (/adapt/.test(label)) cats.add("adaptateur");
  if (/parole|texte|topline|auteur|lyric/.test(label)) cats.add("auteur");
  if (/prod|beat|compo|instru|mix|m[ée]lodie/.test(label)) cats.add("compositeur");
  if (cats.size === 0) {
    if (role === "CO_AUTHOR") cats.add("auteur");
    else if (role === "BEATMAKER" || role === "CO_BEATMAKER") cats.add("compositeur");
    else {
      cats.add("auteur");
      cats.add("compositeur");
    }
  }
  // Ordre du bulletin : compositeur, auteur, arrangeur, adaptateur.
  return (["compositeur", "auteur", "arrangeur", "adaptateur"] as const).filter((c) => cats.has(c));
}

export async function startBulletin726SignatureRequest(params: {
  input: Bulletin726Input;
  requestedById: string;
}): Promise<{ requestId: string }> {
  const { input } = params;
  const version = await prisma.version.findUniqueOrThrow({
    where: { id: input.versionId },
    include: {
      project: {
        include: {
          contributors: { include: { user: { select: { id: true, email: true, name: true, ipiCode: true } } } },
          concerts: { orderBy: { date: "asc" }, take: 1, select: { date: true, venue: true, city: true } },
        },
      },
      splits: {
        orderBy: { createdAt: "asc" },
        include: { contributor: { include: { user: { select: { id: true, email: true, name: true, ipiCode: true } } } } },
      },
      declarations: { where: { type: "OEUVRE" } },
    },
  });
  if (version.status !== "APPROVED") throw new Error("Seule une version approuvée par tous peut être déclarée.");
  if (version.splits.length === 0) throw new Error("Aucune répartition enregistrée : adressez d'abord la fiche en signature.");
  if (version.splits.length > BULLETIN_726_MAX_CREATORS) {
    throw new Error(`Le bulletin 726 accepte au plus ${BULLETIN_726_MAX_CREATORS} créateurs.`);
  }
  // Une déclaration encore en attente ou signée en interne est réutilisée ;
  // si la précédente a déjà été transmise ou payée, le nouveau bulletin ouvre
  // une déclaration distincte (bulletin rectificatif) — l'historique reste.
  const existing = version.declarations.find((d) => d.status === "PENDING_SIGNATURE" || d.status === "SIGNED");

  await prisma.signatureRequest.updateMany({
    where: { versionId: version.id, kind: "DECLARATION", status: "PENDING" },
    data: { status: "CANCELLED" },
  });

  const createurs: Bulletin726Creator[] = version.splits.map((s) => {
    const { prenom, nom } = splitName(s.contributor.user.name, s.contributor.user.email);
    return {
      nom,
      prenom,
      ipi: s.contributor.user.ipiCode,
      categories: creatorCategories(s.contributor.role, s.roleLabel),
      partPhono: Number(s.percentage),
      membreDuGroupe: Boolean(input.groupe),
    };
  });
  const interpretes = version.project.contributors
    .filter((c) => c.role === "ARTIST")
    .map((c) => c.user.name ?? c.user.email.split("@")[0]);
  const concert = version.project.concerts[0];

  const pdfBytes = await fillBulletin726({
    titre: version.project.title,
    sousTitre: input.sousTitre,
    dureeSecondes: version.durationSeconds,
    genre: input.genre,
    premiereExploitation: input.premiereExploitation ?? concert?.date ?? null,
    lieu: input.lieu || (concert ? [concert.venue, concert.city].filter(Boolean).join(", ") : null),
    interpretes,
    groupe: input.groupe,
    suivrePhono: input.suivrePhono,
    createurs,
  });
  const hash = sha256(pdfBytes);
  const filename = `sacem-726-v${version.versionNumber}.pdf`;
  const documentKey = `${version.projectId}/${version.id}/signatures/${hash}-${filename}`;
  await storeOnce(documentKey, pdfBytes, hash);

  const declaration = existing
    ? await prisma.sacemDeclaration.update({
        where: { id: existing.id },
        data: { status: "PENDING_SIGNATURE" },
      })
    : await prisma.sacemDeclaration.create({
        data: { type: "OEUVRE", projectId: version.projectId, versionId: version.id, status: "PENDING_SIGNATURE" },
      });

  const provider = getSignatureProvider();
  const level = requestedSignatureLevel(provider);
  const title = `Bulletin de déclaration SACEM — ${version.project.title}`;
  const signerOrder = version.splits.map((s) => s.contributor.user.id);

  const request = await prisma.signatureRequest.create({
    data: {
      kind: "DECLARATION",
      provider: provider.kind,
      level,
      title,
      versionId: version.id,
      declarationId: declaration.id,
      documentKey,
      documentSha256: hash,
      requestedById: params.requestedById,
      metadata: {
        template: "sacem-726",
        signerOrder,
        complements: {
          genre: input.genre,
          sousTitre: input.sousTitre ?? null,
          groupe: input.groupe ?? null,
          lieu: input.lieu ?? null,
          premiereExploitation: input.premiereExploitation?.toISOString() ?? null,
          suivrePhono: input.suivrePhono,
        },
      },
      signers: {
        create: version.splits.map((s) => ({
          userId: s.contributor.user.id,
          email: s.contributor.user.email,
          name: s.contributor.user.name,
        })),
      },
    },
    include: { signers: true },
  });

  const result = await provider.createRequest({
    requestId: request.id,
    title,
    filename,
    pdfBytes,
    level,
    signers: request.signers.map((s) => ({ id: s.id, email: s.email, name: s.name })),
  });
  await prisma.signatureRequest.update({ where: { id: request.id }, data: { externalId: result.externalId } });
  await Promise.all(
    request.signers.map(async (s) => {
      await prisma.signatureSigner.update({
        where: { id: s.id },
        data: { signatureLink: result.signerLinks[s.id] ?? null },
      });
      await createNotification({
        userId: s.userId,
        type: "SPLIT_SIGNATURE_REQUESTED",
        payload: {
          kind: "DECLARATION",
          title,
          projectId: version.projectId,
          projectTitle: version.project.title,
          versionId: version.id,
          signerId: s.id,
        },
      });
      const link = result.signerLinks[s.id];
      if (s.userId !== params.requestedById && link) {
        await sendEmail({
          to: s.email,
          subject: `Bulletin SACEM « ${version.project.title} » : votre signature est attendue`,
          text: `Le bulletin de déclaration SACEM de « ${version.project.title} » est pré-rempli et vous attend pour signature.\n\nSigner : ${appUrl(link)}`,
        });
      }
    }),
  );

  return { requestId: request.id };
}
