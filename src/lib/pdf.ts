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
const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
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

// ─────────────────────────────────────────────────────────────────────────────
// Registre des transactions blockchain (attestation par projet) — Hash,
// Méthode, Bloc, Date, Wallets, Montant, Frais. Format paysage : 8 colonnes.
// Document destiné à un tiers (label, juriste) qui vérifie indépendamment sur
// PolygonScan — chaque ligne renvoie explicitement vers l'explorateur public.
// ─────────────────────────────────────────────────────────────────────────────

export interface LedgerPdfRow {
  label: string;
  method: string;
  hash: string;
  userLabel: string;
  status: "success" | "failed" | "pending" | "introuvable";
  blockNumber: number | null;
  date: Date | null;
  from: string | null;
  to: string | null;
  valuePol: string;
  feePol: string | null;
  explorerUrl: string | null;
}

export interface LedgerPdfData {
  projectTitle: string;
  contractAddress: string | null;
  network: "amoy" | "mainnet";
  rows: LedgerPdfRow[];
  generatedAt: Date;
}

const LEDGER_COLS = [
  { key: "hash", label: "Transaction Hash", width: 90 },
  { key: "method", label: "Method", width: 100 },
  { key: "user", label: "User", width: 95 },
  { key: "block", label: "Block", width: 50 },
  { key: "date", label: "Date", width: 85 },
  { key: "from", label: "From", width: 75 },
  { key: "to", label: "To", width: 75 },
  { key: "amount", label: "Amount", width: 50 },
  { key: "fee", label: "Txn Fee", width: 65 },
] as const;

function truncateToWidth(font: PDFFont, text: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t + "…", size) > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "…";
}

function truncateAddress(addr: string | null): string {
  if (!addr) return "—";
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function truncateHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

function newLedgerPage(doc: PDFDocument): PDFPage {
  return doc.addPage(A4_LANDSCAPE);
}

function drawLedgerColumnHeaders(c: Cursor, bold: PDFFont) {
  let x = MARGIN;
  for (const col of LEDGER_COLS) {
    c.page.drawText(col.label, { x, y: c.y, size: 8, font: bold, color: rgb(0.35, 0.35, 0.4) });
    x += col.width;
  }
  c.y -= 5;
  c.page.drawLine({
    start: { x: MARGIN, y: c.y },
    end: { x: A4_LANDSCAPE[0] - MARGIN, y: c.y },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.82),
  });
  c.y -= 14;
}

const statusLabels: Record<LedgerPdfRow["status"], string> = {
  success: "Succès",
  failed: "Échec",
  pending: "En attente",
  introuvable: "Introuvable",
};

/**
 * Registre des transactions blockchain d'un projet — attestation destinée à
 * un tiers (label, juriste) : chaque ligne d'ancrage ou d'approbation, avec
 * hash, méthode, bloc, date, wallets et frais, vérifiable indépendamment sur
 * PolygonScan (lien fourni pour chaque ligne).
 */
export async function buildLedgerPdf(data: LedgerPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const mono = await doc.embedFont(StandardFonts.Courier);

  let page = newLedgerPage(doc);
  const c: Cursor = { page, y: A4_LANDSCAPE[1] - 60 };

  const drawHeaderBlock = () => {
    c.page.drawText(`Registre des transactions blockchain — ${data.projectTitle}`, {
      x: MARGIN,
      y: c.y,
      size: 16,
      font: bold,
      color: rgb(0.1, 0.1, 0.12),
    });
    c.y -= 20;
    c.page.drawText(
      `Réseau Polygon ${data.network === "mainnet" ? "mainnet" : "Amoy (testnet)"} · Contrat DistribRegistry ${
        data.contractAddress ?? "non déployé"
      }`,
      { x: MARGIN, y: c.y, size: 9, font: regular, color: rgb(0.4, 0.4, 0.45) },
    );
    c.y -= 24;
  };

  drawHeaderBlock();
  drawLedgerColumnHeaders(c, bold);

  const rowHeight = 26;
  const explorerLinks: Array<{ n: number; label: string; url: string }> = [];

  data.rows.forEach((row, i) => {
    if (c.y < MARGIN + rowHeight) {
      page = newLedgerPage(doc);
      c.page = page;
      c.y = A4_LANDSCAPE[1] - 60;
      drawLedgerColumnHeaders(c, bold);
    }

    let x = MARGIN;
    const cells: Array<{ text: string; font: PDFFont; color?: ReturnType<typeof rgb> }> = [
      { text: truncateHash(row.hash), font: mono },
      { text: truncateToWidth(regular, row.method, 8.5, 92), font: regular },
      { text: truncateToWidth(regular, row.userLabel, 8.5, 88), font: regular },
      { text: row.blockNumber != null ? String(row.blockNumber) : "—", font: regular },
      {
        text: row.date
          ? row.date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })
          : "—",
        font: regular,
      },
      { text: truncateAddress(row.from), font: mono },
      { text: truncateAddress(row.to), font: mono },
      { text: `${row.valuePol} POL`, font: regular },
      { text: row.feePol ? `${row.feePol} POL` : "—", font: regular },
    ];

    for (let ci = 0; ci < LEDGER_COLS.length; ci++) {
      c.page.drawText(cells[ci].text, {
        x,
        y: c.y,
        size: 8.5,
        font: cells[ci].font,
        color: rgb(0.15, 0.15, 0.18),
      });
      x += LEDGER_COLS[ci].width;
    }
    c.y -= 11;
    c.page.drawText(
      `${row.label} · statut : ${statusLabels[row.status]}`,
      { x: MARGIN, y: c.y, size: 7, font: regular, color: rgb(0.5, 0.5, 0.55) },
    );
    c.y -= rowHeight - 11;

    if (row.explorerUrl) {
      explorerLinks.push({ n: i + 1, label: row.label, url: row.explorerUrl });
    }
  });

  // Page de vérification : liste des liens PolygonScan, un par transaction —
  // c'est ici qu'un tiers (label, avocat) va confirmer chaque preuve lui-même.
  if (explorerLinks.length > 0) {
    page = newLedgerPage(doc);
    c.page = page;
    c.y = A4_LANDSCAPE[1] - 60;
    c.page.drawText("Vérification indépendante", {
      x: MARGIN,
      y: c.y,
      size: 14,
      font: bold,
      color: rgb(0.1, 0.1, 0.12),
    });
    c.y -= 18;
    c.page.drawText(
      "Chaque transaction ci-dessous est publique et vérifiable par n'importe qui, sans dépendre de DISTRIB — ouvrez le lien dans un navigateur.",
      { x: MARGIN, y: c.y, size: 9, font: regular, color: rgb(0.4, 0.4, 0.45) },
    );
    c.y -= 26;

    for (const link of explorerLinks) {
      if (c.y < MARGIN + 30) {
        page = newLedgerPage(doc);
        c.page = page;
        c.y = A4_LANDSCAPE[1] - 60;
      }
      c.page.drawText(`${link.label}`, { x: MARGIN, y: c.y, size: 9, font: bold });
      c.y -= 13;
      c.page.drawText(link.url, {
        x: MARGIN,
        y: c.y,
        size: 8.5,
        font: mono,
        color: rgb(0.2, 0.3, 0.7),
      });
      c.y -= 20;
    }
  }

  for (const p of doc.getPages()) {
    drawFooter(p, regular, data.generatedAt);
  }
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

// ─────────────────────────────────────────────────────────────────────────────
// Attestations ADAMI (participation à l'enregistrement) et feuilles de
// présence SPEDIDAM (musiciens présents en live) — générées depuis les
// contributions validées du vault, sans dépôt automatique (pas d'API ouverte).
// ─────────────────────────────────────────────────────────────────────────────

export interface AdamiAttestationData {
  projectTitle: string;
  versionNumber: number;
  finalizedAt: Date | null;
  performers: Array<{ name: string; role: string }>;
  generatedAt: Date;
}

/** Attestation de participation ADAMI (interprètes d'un enregistrement). */
export async function buildAdamiPdf(data: AdamiAttestationData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(A4);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const c: Cursor = { page, y: A4[1] - 70 };

  drawTitle(c, bold, "Attestation de participation — ADAMI");

  drawSection(c, bold, "Enregistrement");
  drawField(c, bold, regular, "Titre", data.projectTitle);
  drawField(c, bold, regular, "Version déclarée", `Version ${data.versionNumber}`);
  drawField(
    c,
    bold,
    regular,
    "Enregistré le",
    data.finalizedAt ? data.finalizedAt.toLocaleDateString("fr-FR") : "—",
  );

  drawSection(c, bold, "Interprètes ayant participé");
  for (const p of data.performers) {
    drawField(c, bold, regular, p.name, p.role);
  }

  drawSection(c, bold, "Signature");
  drawField(c, bold, regular, "Fait le", data.generatedAt.toLocaleDateString("fr-FR"));
  drawField(c, bold, regular, "Signature de l'interprète", " ");

  drawFooter(page, regular, data.generatedAt);
  return doc.save();
}

export interface SpedidamPresenceData {
  venue: string;
  date: Date;
  city: string | null;
  performers: Array<{ name: string; role: string }>;
  generatedAt: Date;
}

/** Feuille de présence SPEDIDAM (musiciens présents lors d'une date live). */
export async function buildSpedidamPdf(data: SpedidamPresenceData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(A4);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const c: Cursor = { page, y: A4[1] - 70 };

  drawTitle(c, bold, "Feuille de présence — SPEDIDAM");

  drawSection(c, bold, "Représentation");
  drawField(c, bold, regular, "Lieu", data.venue);
  drawField(c, bold, regular, "Ville", data.city ?? "—");
  drawField(c, bold, regular, "Date", data.date.toLocaleDateString("fr-FR"));

  drawSection(c, bold, "Musiciens présents");
  if (data.performers.length === 0) {
    drawField(c, bold, regular, "Présence", "Non renseignée");
  }
  for (const p of data.performers) {
    drawField(c, bold, regular, p.name, p.role);
  }

  drawSection(c, bold, "Signature");
  drawField(c, bold, regular, "Fait le", data.generatedAt.toLocaleDateString("fr-FR"));
  drawField(c, bold, regular, "Signature du responsable de plateau", " ");

  drawFooter(page, regular, data.generatedAt);
  return doc.save();
}
