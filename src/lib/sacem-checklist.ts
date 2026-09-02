import "server-only";

import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────────────────────
// Checklist de déclaration SACEM (bloquante) — titre, durée, codes IPI de
// tous les contributeurs, répartition définie ET signée par tous, au moins
// un fichier audio. Utilisée à la fois pour l'affichage (Fiche SACEM) et pour
// bloquer réellement declareOeuvreAction côté serveur.
// ─────────────────────────────────────────────────────────────────────────────

export interface ChecklistItem {
  key: string;
  label: string;
  ok: boolean;
  blocking: boolean;
  detail?: string;
}

export interface SacemChecklist {
  items: ChecklistItem[];
  ready: boolean; // tous les items bloquants sont ok
}

const AUDIO_FILE_TYPES = new Set(["WAV", "FLP", "ALS", "PTX", "STEM"]);

export async function buildSacemChecklist(versionId: string): Promise<SacemChecklist | null> {
  const version = await prisma.version.findUnique({
    where: { id: versionId },
    include: {
      project: {
        include: { contributors: { include: { user: { select: { ipiCode: true, email: true } } } } },
      },
      files: { select: { fileType: true } },
      splits: true,
    },
  });
  if (!version) return null;

  const missingIpi = version.project.contributors.filter((c) => !c.user.ipiCode);
  const hasAudio = version.files.some((f) => AUDIO_FILE_TYPES.has(f.fileType));
  const hasSplits = version.splits.length > 0;
  const allSigned = hasSplits && version.splits.every((s) => s.signedAt !== null);

  const items: ChecklistItem[] = [
    {
      key: "title",
      label: "Titre exact de l'œuvre",
      ok: version.project.title.trim().length > 0,
      blocking: true,
    },
    {
      key: "duration",
      label: "Durée renseignée",
      ok: version.durationSeconds != null,
      blocking: true,
    },
    {
      key: "isrc",
      label: "Code ISRC attribué",
      ok: version.project.isrc != null,
      blocking: false,
      detail: "Recommandé mais pas obligatoire pour déclarer.",
    },
    {
      key: "ipi",
      label: "Code IPI de chaque contributeur",
      ok: missingIpi.length === 0,
      blocking: true,
      detail:
        missingIpi.length > 0
          ? `Manquant pour ${missingIpi.map((c) => c.user.email).join(", ")}`
          : undefined,
    },
    {
      key: "splits",
      label: "Répartition des droits définie (100 %)",
      ok: hasSplits,
      blocking: true,
    },
    {
      key: "splits-signed",
      label: "Répartition signée par tous les contributeurs",
      ok: allSigned,
      blocking: true,
    },
    {
      key: "audio",
      label: "Au moins un fichier audio déposé",
      ok: hasAudio,
      blocking: true,
    },
    {
      key: "approved",
      label: "Version approuvée à l'unanimité",
      ok: version.status === "APPROVED",
      blocking: true,
    },
  ];

  return { items, ready: items.every((i) => !i.blocking || i.ok) };
}
