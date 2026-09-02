import { z } from "zod";

// Schémas de validation partagés (Server Actions + route handlers).
// Toute entrée externe passe par un de ces schémas avant d'atteindre Prisma.

export const createProjectSchema = z.object({
  title: z.string().trim().min(1, "Titre requis").max(200),
  isrc: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/, "Format ISRC invalide (ex: FRABC2400001)")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

// Durée saisie en "mm:ss" ou "h:mm:ss" → secondes. Facultatif (requis
// seulement pour la checklist de déclaration SACEM, pas pour déposer).
export const durationInputSchema = z
  .string()
  .trim()
  .optional()
  .or(z.literal("").transform(() => undefined))
  .refine(
    (raw) => raw === undefined || /^(\d+:)?\d{1,2}:\d{2}$/.test(raw),
    "Format de durée invalide (mm:ss)",
  )
  .transform((raw) => {
    if (!raw) return undefined;
    const parts = raw.split(":").map(Number);
    const [h, m, s] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
    return h * 3600 + m * 60 + s;
  });

export const createVersionSchema = z.object({
  projectId: z.string().min(1),
  description: z
    .string()
    .trim()
    .min(1, "Décrivez votre contribution — c'est la preuve de paternité")
    .max(5000),
  parentVersionId: z.string().min(1).optional(),
  durationSeconds: durationInputSchema,
});
export type CreateVersionInput = z.infer<typeof createVersionSchema>;

// Rôles de contributeur — cohérent avec l'enum Prisma ContributorRole.
export const contributorRoles = [
  "ARTIST",
  "CO_AUTHOR",
  "BEATMAKER",
  "CO_BEATMAKER",
] as const;

export const inviteContributorSchema = z.object({
  projectId: z.string().min(1),
  email: z.string().trim().toLowerCase().email("E-mail invalide"),
  role: z.enum(contributorRoles),
});
export type InviteContributorInput = z.infer<typeof inviteContributorSchema>;

export const decideApprovalSchema = z.object({
  approvalId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  comment: z.string().trim().max(2000).optional(),
});
export type DecideApprovalInput = z.infer<typeof decideApprovalSchema>;

// Splits : chaque part dans ]0;100], somme exacte = 100 (cohérent avec le
// trigger SQL `split_sum_must_be_100`). Centimes de % autorisés (2 décimales).
export const splitEntrySchema = z.object({
  contributorId: z.string().min(1),
  percentage: z.coerce
    .number()
    .gt(0, "Une part doit être > 0")
    .max(100)
    .multipleOf(0.01, "2 décimales maximum"),
  roleLabel: z.string().trim().max(100).optional(),
});

export const setSplitsSchema = z
  .object({
    versionId: z.string().min(1),
    entries: z.array(splitEntrySchema).min(1, "Au moins une part"),
  })
  .refine(
    (data) =>
      Math.abs(
        data.entries.reduce((sum, e) => sum + Math.round(e.percentage * 100), 0) -
          10000,
      ) === 0,
    { message: "La somme des parts doit faire exactement 100 %" },
  )
  .refine(
    (data) =>
      new Set(data.entries.map((e) => e.contributorId)).size === data.entries.length,
    { message: "Un contributeur ne peut apparaître qu'une fois" },
  );
export type SetSplitsInput = z.infer<typeof setSplitsSchema>;

// Concerts (Sprint 4). La setlist arrive en textarea : un titre par ligne.
export const createConcertSchema = z.object({
  date: z.coerce.date().refine((d) => !Number.isNaN(d.getTime()), "Date invalide"),
  venue: z.string().trim().min(1, "Lieu requis").max(200),
  city: z.string().trim().max(120).optional().or(z.literal("").transform(() => undefined)),
  country: z.string().trim().max(120).optional().or(z.literal("").transform(() => undefined)),
  estimatedAudience: z.coerce.number().int().positive().max(1_000_000).optional(),
  setlist: z
    .string()
    .transform((raw) =>
      raw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 50),
    )
    .pipe(z.array(z.string().max(200))),
  projectId: z.string().min(1).optional().or(z.literal("").transform(() => undefined)),
  programId: z.string().min(1).optional().or(z.literal("").transform(() => undefined)),
  saveAsProgram: z.string().trim().max(200).optional().or(z.literal("").transform(() => undefined)),
});
export type CreateConcertInput = z.infer<typeof createConcertSchema>;

// IPI (Interested Parties Information) — identifiant international
// auteur/interprète, 9 à 11 chiffres, requis par la checklist SACEM.
export const ipiCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{9,11}$/, "Code IPI invalide (9 à 11 chiffres)")
  .optional()
  .or(z.literal("").transform(() => undefined));

export const markDeclarationPaidSchema = z.object({
  declarationId: z.string().min(1),
  amountEuros: z.coerce.number().positive("Montant requis").max(10_000_000),
});

// Résolution d'une réclamation (Sprint 5) — cohérent avec ClaimResolutionAction.
export const resolveClaimSchema = z.object({
  claimId: z.string().min(1),
  action: z.enum(["AUTHORIZE", "NEGOTIATE_SPLIT", "REPORT"]),
  note: z.string().trim().max(5000).optional(),
});
export type ResolveClaimInput = z.infer<typeof resolveClaimSchema>;

// Types de fichiers acceptés au vault. Cohérent avec l'enum Prisma VaultFileType.
export const vaultFileTypes = [
  "WAV",
  "FLP",
  "ALS",
  "PTX",
  "STEM",
  "LYRICS",
  "OTHER",
] as const;

// Les 5 catégories de divulgation IA générative (format DDEX), déclarées à
// chaque dépôt — cohérent avec l'enum Prisma AiDisclosureCategory.
export const aiDisclosureCategories = [
  "VOIX",
  "INSTRUMENTATION",
  "COMPOSITION",
  "POST_PRODUCTION",
  "PAROLES",
] as const;

export const aiDisclosureLabels: Record<(typeof aiDisclosureCategories)[number], string> = {
  VOIX: "Voix générée par IA",
  INSTRUMENTATION: "Instrumentation générée par IA",
  COMPOSITION: "Composition assistée par IA",
  POST_PRODUCTION: "Post-production assistée par IA",
  PAROLES: "Paroles générées par IA",
};

export const uploadMetadataSchema = z.object({
  versionId: z.string().min(1),
  fileType: z.enum(vaultFileTypes),
  aiCategories: z.array(z.enum(aiDisclosureCategories)).max(5).default([]),
});
export type UploadMetadataInput = z.infer<typeof uploadMetadataSchema>;

/** Déduit un VaultFileType à partir de l'extension de fichier. */
export function fileTypeFromName(filename: string): (typeof vaultFileTypes)[number] {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "wav":
      return "WAV";
    case "flp":
      return "FLP";
    case "als":
      return "ALS";
    case "ptx":
      return "PTX";
    case "txt":
    case "md":
      return "LYRICS";
    default:
      return "OTHER";
  }
}
