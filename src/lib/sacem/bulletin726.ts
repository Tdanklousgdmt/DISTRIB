import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { PDFDocument, PDFName, StandardFonts, rgb } from "pdf-lib";

import map from "./bulletin-726.map.json";

// ─────────────────────────────────────────────────────────────────────────────
// Bulletin de déclaration SACEM — formulaire officiel 726 (02/2026), PDF
// remplissable. DISTRIB le PRÉ-REMPLIT depuis les données du projet (titre,
// durée, interprètes, créateurs, parts, codes IPI) : la fiche reste « proposée,
// jamais imposée » — l'artiste complète ce qui manque (genre, pseudonyme,
// COAD…) puis chaque ayant droit signe dans SA case via le plugin esign.
// Le mappage champ ↔ nom technique est dans bulletin-726.map.json (généré
// depuis la géométrie du formulaire, pas à la main).
// ─────────────────────────────────────────────────────────────────────────────

export type CreatorCategory = "compositeur" | "auteur" | "arrangeur" | "adaptateur";

export interface Bulletin726Creator {
  nom: string;
  prenom: string;
  pseudonyme?: string | null;
  ipi?: string | null;
  categories: CreatorCategory[];
  /** Part en Phono (%), inscrite sur la ligne de la première catégorie cochée. */
  partPhono: number;
  membreDuGroupe: boolean;
}

export interface Bulletin726Data {
  titre: string;
  sousTitre?: string | null;
  dureeSecondes?: number | null;
  genre?: string | null;
  premiereExploitation?: Date | null;
  lieu?: string | null;
  interpretes: string[];
  groupe?: string | null;
  suivrePhono: boolean;
  createurs: Bulletin726Creator[];
}

export const BULLETIN_726_MAX_CREATORS = map.createurs.length;

async function loadTemplate(): Promise<Uint8Array> {
  return new Uint8Array(await readFile(join(process.cwd(), "src/lib/sacem/bulletin-726.pdf")));
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Pré-remplit le formulaire 726 (champs AcroForm) avec les données DISTRIB. */
export async function fillBulletin726(data: Bulletin726Data): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await loadTemplate());
  const form = doc.getForm();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const text = (name: string, value: string | null | undefined) => {
    if (!value) return;
    try {
      form.getTextField(name).setText(value);
    } catch (e) {
      console.warn("[726] champ texte introuvable", name, e);
    }
  };
  const check = (name: string, on: boolean) => {
    try {
      const f = form.getCheckBox(name);
      if (on) f.check();
      else f.uncheck();
    } catch (e) {
      console.warn("[726] case introuvable", name, e);
    }
  };

  // A — Titre (deux lignes à peignes) et sous-titre.
  const titre = data.titre.toUpperCase();
  text(map.titre[0], titre.slice(0, 38));
  text(map.titre[1], titre.slice(38, 76));
  text(map.sousTitre, data.sousTitre ?? null);

  // B — Désignation.
  if (data.dureeSecondes != null) {
    const h = Math.floor(data.dureeSecondes / 3600);
    const m = Math.floor((data.dureeSecondes % 3600) / 60);
    const s = Math.round(data.dureeSecondes % 60);
    text(map.dureeH, String(h));
    text(map.dureeM, pad2(m));
    text(map.dureeS, pad2(s));
  }
  text(map.genre, data.genre ?? null);
  if (data.premiereExploitation) {
    const d = data.premiereExploitation;
    text(map.premiereExploitation[0], pad2(d.getDate()));
    text(map.premiereExploitation[1], pad2(d.getMonth() + 1));
    text(map.premiereExploitation[2], String(d.getFullYear()));
  }
  text(map.lieu, data.lieu ?? null);
  text(map.interpretes, data.interpretes.join(", ").slice(0, 40));

  // C / D — Groupe et modalité de partage.
  text(map.groupe, data.groupe ?? null);
  check(map.suivrePhono, data.suivrePhono);

  // E — Créateurs.
  data.createurs.slice(0, BULLETIN_726_MAX_CREATORS).forEach((c, i) => {
    const slot = map.createurs[i];
    text(slot.nom, c.nom.toUpperCase());
    text(slot.prenom, c.prenom);
    text(slot.pseudonyme, c.pseudonyme ?? null);
    text(slot.ipi, c.ipi ?? null);
    for (const cat of ["compositeur", "auteur", "arrangeur", "adaptateur"] as const) {
      check(slot.roles[cat], c.categories.includes(cat));
    }
    const first = c.categories[0];
    if (first) {
      const [intField, decField] = slot.parts[first];
      const whole = Math.floor(c.partPhono);
      const dec = Math.round((c.partPhono - whole) * 100);
      text(intField, String(whole));
      text(decField, pad2(dec));
    }
    // Boutons radio OUI/NON : les valeurs d'export varient d'un bloc à l'autre
    // (« Choix1 », « 0 », « 6 »…) et pdf-lib en confond certaines ; on pose
    // l'état directement sur les widgets, sans passer par select().
    try {
      const rg = form.getRadioGroup(slot.groupe.field);
      const wanted = PDFName.of(c.membreDuGroupe ? slot.groupe.oui : slot.groupe.non);
      const widgets = rg.acroField.getWidgets();
      const target = widgets.find((w) => w.getOnValue()?.asString() === wanted.asString());
      if (target) {
        rg.acroField.setValue(wanted);
        for (const w of widgets) w.setAppearanceState(w === target ? wanted : PDFName.of("Off"));
      } else {
        console.warn("[726] état radio introuvable", slot.groupe.field, wanted.asString());
      }
    } catch (e) {
      console.warn("[726] groupe radio", slot.groupe.field, e);
    }
  });

  form.updateFieldAppearances(font);
  return doc.save();
}

export interface Bulletin726Signature {
  /** Index du créateur (0-based) dans l'ordre du bulletin. */
  index: number;
  name: string;
  signedAt: Date;
  signatureImage: string | null; // PNG data-URL
}

/**
 * Après signature de tous : chaque marque (tracé ou nom en italique) est posée
 * dans la case « Signature » de son créateur, « Fait le » est daté, puis le
 * formulaire est aplati — plus aucun champ modifiable.
 */
export async function stampBulletin726Signatures(
  filled: Uint8Array,
  signatures: Bulletin726Signature[],
  faitLe: Date,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(filled);
  const form = doc.getForm();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const script = await doc.embedFont(StandardFonts.TimesRomanItalic);

  try {
    form.getTextField(map.faitLe[0]).setText(pad2(faitLe.getDate()));
    form.getTextField(map.faitLe[1]).setText(pad2(faitLe.getMonth() + 1));
    form.getTextField(map.faitLe[2]).setText(String(faitLe.getFullYear()));
  } catch (e) {
    console.warn("[726] Fait le", e);
  }
  form.updateFieldAppearances(helv);
  form.flatten();

  for (const sig of signatures) {
    const slot = map.createurs[sig.index];
    if (!slot) continue;
    const page = doc.getPage(slot.signature.page - 1);
    const { x, y, w, h } = slot.signature;
    // Fond blanc sur le libellé « Signature » du gabarit, puis la marque.
    page.drawRectangle({ x, y, width: w, height: h, color: rgb(1, 1, 1) });
    let drew = false;
    if (sig.signatureImage?.startsWith("data:image/png;base64,")) {
      try {
        const png = await doc.embedPng(Buffer.from(sig.signatureImage.slice(22), "base64"));
        const iw = Math.min(w - 16, 150);
        const ih = (png.height / png.width) * iw;
        page.drawImage(png, { x: x + 8, y: y + h - 6 - ih, width: iw, height: ih });
        drew = true;
      } catch {
        // tracé illisible → nom en italique
      }
    }
    if (!drew) {
      page.drawText(sig.name, { x: x + 10, y: y + h - 30, size: 15, font: script, color: rgb(0.1, 0.1, 0.2) });
    }
    page.drawText(
      `Signé électroniquement le ${sig.signedAt.toLocaleDateString("fr-FR")} — DISTRIB`,
      { x: x + 8, y: y + 5, size: 6.5, font: helv, color: rgb(0.4, 0.4, 0.45) },
    );
  }
  return doc.save();
}
