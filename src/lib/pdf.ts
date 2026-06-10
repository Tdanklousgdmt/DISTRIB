import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// ─────────────────────────────────────────────────────────────────────────────
// Bulletins SACEM (Sprint 4) — générés avec pdf-lib.
//
// Deux gabarits :
//  · OEUVRE : déclaration d'une œuvre (titre, ISRC, ayants droit + parts,
//    preuves cryptographiques du vault).
//  · LIVE  : programme de concert (date, lieu, setlist, jauge).
//
// Ces PDF sont remplis avec les données du vault — l'artiste les télécharge,
// les signe (Yousign quand provisionné) et la transmission est tracée en BDD.
// ─────────────────────────────────────────────────────────────────────────────

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 50;

interface Cursor {
  page: PDFPage;
  y: number;
}

function drawTitle(c: Cursor, font: PDFFont, text: string) {
  c.page.drawText(text, {
    x: MARGIN,
    y: c.y,
    size: 18,
    font,
    color: rgb(0.1, 0.1, 0.12),
  });
  c.y -= 30;
}

function drawSection(c: Cursor, font: PDFFont, text: string) {
  c.y -= 8;
  c.page.drawText(text.toUpperCase(), {
    x: MARGIN,
    y: c.y,
    size: 10,
    font,
    color: rgb(0.35, 0.35, 0.4),
  });
  c.y -= 6;
  c.page.drawLine({
    start: { x: MARGIN, y: c.y },
    end: { x: A4[0] - MARGIN, y: c.y },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.82),
  });
  c.y -= 16;
}

function drawField(c: Cursor, label: PDFFont, value: PDFFont, key: string, val: string) {
  c.page.drawText(`${key} :`, { x: MARGIN, y: c.y, size: 10, font: label });
  c.page.drawText(val || "—", { x: MARGIN + 150, y: c.y, size: 10, font: value });
  c.y -= 16;
}

function drawFooter(page: PDFPage, font: PDFFont, generatedAt: Date) {
  page.drawText(
    `Document généré par DISTRIB le ${generatedAt.toLocaleDateString("fr-FR")} — ` +
      "preuves d'intégrité vérifiables sur la blockchain Polygon.",
    { x: MARGIN, y: 40, size: 8, font, color: rgb(0.5, 0.5, 0.55) },
  );
}

export interface OeuvreDeclarationData {
  projectTitle: string;
  isrc: string | null;
  versionNumber: number;
  finalizedAt: Date | null;
  finalPolygonTxHash: string | null;
  rightHolders: Array<{
    name: string;
    role: string;
    percentage: string; // "33.33"
  }>;
  files: Array<{ filename: string; sha256: string }>;
  generatedAt: Date;
}

/** Bulletin de déclaration d'œuvre. */
export async function buildOeuvrePdf(data: OeuvreDeclarationData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(A4);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const c: Cursor = { page, y: A4[1] - 70 };

  drawTitle(c, bold, "Déclaration d'œuvre — SACEM");

  drawSection(c, bold, "Œuvre");
  drawField(c, bold, regular, "Titre", data.projectTitle);
  drawField(c, bold, regular, "ISRC", data.isrc ?? "Non attribué");
  drawField(c, bold, regular, "Version déclarée", `Version ${data.versionNumber}`);
  drawField(
    c,
    bold,
    regular,
    "Approuvée le",
    data.finalizedAt ? data.finalizedAt.toLocaleDateString("fr-FR") : "—",
  );

  drawSection(c, bold, "Ayants droit et répartition");
  for (const rh of data.rightHolders) {
    drawField(c, bold, regular, `${rh.name} (${rh.role})`, `${rh.percentage} %`);
  }

  drawSection(c, bold, "Preuves d'antériorité (vault DISTRIB)");
  for (const f of data.files.slice(0, 12)) {
    c.page.drawText(f.filename, { x: MARGIN, y: c.y, size: 9, font: regular });
    c.y -= 12;
    c.page.drawText(`SHA-256 ${f.sha256}`, {
      x: MARGIN + 12,
      y: c.y,
      size: 7.5,
      font: mono,
      color: rgb(0.35, 0.35, 0.4),
    });
    c.y -= 16;
  }
  if (data.finalPolygonTxHash) {
    drawField(c, bold, mono, "Tx Polygon", data.finalPolygonTxHash);
  }

  drawSection(c, bold, "Signature");
  drawField(c, bold, regular, "Fait le", data.generatedAt.toLocaleDateString("fr-FR"));
  drawField(c, bold, regular, "Signature de l'ayant droit", " ");

  drawFooter(page, regular, data.generatedAt);
  return doc.save();
}

export interface LiveDeclarationData {
  artistName: string;
  date: Date;
  venue: string;
  city: string | null;
  country: string | null;
  estimatedAudience: number | null;
  actualAudience: number | null;
  setlist: string[];
  generatedAt: Date;
}

/** Programme de concert (déclaration live). */
export async function buildLivePdf(data: LiveDeclarationData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(A4);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const c: Cursor = { page, y: A4[1] - 70 };

  drawTitle(c, bold, "Programme de concert — SACEM");

  drawSection(c, bold, "Représentation");
  drawField(c, bold, regular, "Artiste", data.artistName);
  drawField(c, bold, regular, "Date", data.date.toLocaleDateString("fr-FR"));
  drawField(c, bold, regular, "Lieu", data.venue);
  drawField(
    c,
    bold,
    regular,
    "Ville / Pays",
    [data.city, data.country].filter(Boolean).join(", "),
  );
  drawField(
    c,
    bold,
    regular,
    "Jauge",
    data.actualAudience != null
      ? `${data.actualAudience} (réel)`
      : data.estimatedAudience != null
        ? `${data.estimatedAudience} (estimé)`
        : "—",
  );

  drawSection(c, bold, "Œuvres interprétées");
  if (data.setlist.length === 0) {
    drawField(c, bold, regular, "Setlist", "Non renseignée");
  }
  data.setlist.slice(0, 30).forEach((title, i) => {
    c.page.drawText(`${i + 1}. ${title}`, { x: MARGIN, y: c.y, size: 10, font: regular });
    c.y -= 15;
  });

  drawSection(c, bold, "Signature");
  drawField(c, bold, regular, "Fait le", data.generatedAt.toLocaleDateString("fr-FR"));
  drawField(c, bold, regular, "Signature de l'artiste", " ");

  drawFooter(page, regular, data.generatedAt);
  return doc.save();
}
