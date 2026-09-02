import type { ContributorRole } from "@/generated/prisma/enums";

// Modèles de projet préremplis — configurations types les plus fréquentes
// pour un artiste indépendant. Purement indicatif : suggère les rôles à
// inviter, ne modifie ni ne verrouille rien côté données.
export interface ProjectTemplate {
  key: string;
  label: string;
  hint: string;
  suggestedRoles: ContributorRole[];
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    key: "feat",
    label: "Feat",
    hint: "Un artiste invité pose sur votre titre.",
    suggestedRoles: ["CO_AUTHOR"],
  },
  {
    key: "prod_tiers",
    label: "Prod pour un tiers",
    hint: "Vous produisez pour un artiste client.",
    suggestedRoles: ["ARTIST"],
  },
  {
    key: "remix",
    label: "Remix",
    hint: "Nouvelle production sur une œuvre existante.",
    suggestedRoles: ["CO_BEATMAKER"],
  },
  {
    key: "topline",
    label: "Topline",
    hint: "Mélodie et paroles posées sur une prod existante.",
    suggestedRoles: ["CO_AUTHOR"],
  },
  {
    key: "clearance",
    label: "Clearance de sample",
    hint: "Un sample identifiable nécessite l'accord de son ayant droit.",
    suggestedRoles: ["CO_AUTHOR"],
  },
];

export function findProjectTemplate(key: string | undefined | null): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES.find((t) => t.key === key);
}
