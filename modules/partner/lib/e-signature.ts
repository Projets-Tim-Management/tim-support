import { createHash } from "node:crypto";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { PARIS_TZ, frDate } from "@/core/lib/dates";
import { parapheHalf, type Rect, type SignerRole } from "@/modules/partner/lib/sign-fields";
import { readLayout, writeLayout, type SignatureLayout } from "@/modules/partner/lib/signature-layout";
import { initialsOf } from "@/modules/partner/lib/signature-styles";

/**
 * Signature électronique SIMPLE (règlement eIDAS) du devis et du contrat, par
 * code à usage unique envoyé par e-mail.
 *
 * Ce module ne fait que la partie PURE : les textes, l'empreinte, et la
 * fabrication du PDF signé. Les routes (app/(frontend)/api/portal/signature/
 * sign/*) gèrent la session, le code et l'enregistrement du dossier de preuve
 * (collection `electronic-signatures`).
 *
 * Le PDF signé = le document présenté, INCHANGÉ, avec une mention discrète en
 * pied de chaque page, puis une page « Certificat de signature » qui reprend
 * tout le dossier de preuve. Qui l'ouvre sait, sans rien consulter d'autre,
 * qui a signé quoi, quand, comment, et peut vérifier l'empreinte du document.
 *
 * Contrat généré par TIM (il porte un plan de signature, voir
 * signature-layout) : le paraphe se pose dans la case « Paraphe » de chaque
 * page, et le bloc « Le Client » se remplit — nom et prénom du signataire,
 * fonction, date et signature. Toujours PAR-DESSUS le document présenté.
 */

export type SignableKind = "devis" | "contrat";

/** Les champs de la fiche : le document présenté, et où ranger la version signée. */
export const SIGNABLE: Record<SignableKind, { original: string; signed: string; noun: string; article: string }> = {
  devis: { original: "quoteDocument", signed: "quoteSignedDocument", noun: "devis", article: "le devis" },
  contrat: { original: "contractToSignDocument", signed: "contractDocument", noun: "contrat", article: "le contrat" },
};

export const isSignableKind = (v: unknown): v is SignableKind => v === "devis" || v === "contrat";

/** Code valable 10 minutes, 5 essais : assez pour ouvrir sa boîte, pas pour deviner. */
export const SIGN_CODE_TTL_MS = 10 * 60 * 1000;
export const SIGN_MAX_ATTEMPTS = 5;
/** Au plus 5 demandes de code par heure et par client. */
export const SIGN_MAX_REQUESTS_PER_HOUR = 5;

/**
 * Le texte du consentement, affiché ET conservé tel quel dans le dossier de
 * preuve : ce que le signataire a lu est exactement ce qu'on pourra produire.
 */
export const consentText = (kind: SignableKind, company?: string | null): string =>
  `J'ai lu ${SIGNABLE[kind].article}${company ? ` établi pour ${company}` : ""} et je l'accepte. ` +
  "Je reconnais que la saisie du code reçu par e-mail vaut signature électronique, " +
  "avec la même valeur qu'une signature manuscrite.";

export const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** « c•••@gmail.com » : assez pour se reconnaître, pas assez pour être lu par-dessus l'épaule. */
export const maskEmail = (email?: string | null): string => {
  if (!email || !email.includes("@")) return "votre adresse e-mail";
  const [user, domain] = email.split("@");
  return `${user.slice(0, 1)}${"•".repeat(Math.max(2, Math.min(user.length - 1, 5)))}@${domain}`;
};

/** Un nom d'entreprise réduit à un morceau de nom de fichier : « Société Été » → « societe-ete ». */
export const fileSlug = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "client";

// ─── La signature visible (voir signature-styles.ts) ─────────────────────────
export { SIGNATURE_STYLES, initialsOf, isSignatureStyle, type SignatureStyle } from "@/modules/partner/lib/signature-styles";

// ─── Le PDF signé ────────────────────────────────────────────────────────────

export type SignedPdfInput = {
  original: Uint8Array;
  /** `application/pdf`, `image/png` ou `image/jpeg`. */
  mime: string;
  kind: SignableKind;
  reference: string;
  company?: string | null;
  signer: { firstName: string; lastName: string; role?: string | null; email: string };
  consent: string;
  originalHash: string;
  codeSentAt: string;
  signedAt: string;
  ip?: string | null;
  userAgent?: string | null;
  documentName?: string | null;
  /** Police du rendu choisi (TTF) ; absente, la signature s'écrit en italique. */
  signatureFont?: Uint8Array | null;
  /** Les pages confirmées une à une par le signataire avant de demander son code. */
  pageConfirmations?: { page: number; at: string; signed?: boolean }[] | null;
};

/**
 * Les polices standard du PDF ne couvrent que le jeu WinAnsi : un caractère
 * hors jeu (guillemet typographique, flèche, emoji) ferait échouer la
 * génération entière. On le remplace plutôt que de perdre la signature.
 */
const safe = (text: string): string =>
  text
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ʼ/g, "'")
    .replace(/[  ]/g, " ")
    // Tout le jeu WinAnsi est gardé (accents, « », ’, œ, €, …) ; le reste devient « ? ».
    .replace(/[^\x20-\x7E -ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, "?");

/** Le même nettoyage pour tout texte écrit avec une police standard (pied du contrat…). */
export const winAnsi = safe;

const fmtParis = (iso: string): string =>
  new Date(iso).toLocaleString("fr-FR", {
    timeZone: PARIS_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

/** Coupe un texte en lignes qui tiennent dans `width`. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n").map(safe)) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

const INK = rgb(0.2, 0.2, 0.22);
const MUTED = rgb(0.45, 0.46, 0.5);
const BRAND = rgb(0.996, 0.33, 0.39);
const A4 = { w: 595.28, h: 841.89 };

/** Un texte ajusté dans un rectangle (taille réduite s'il déborde). */
function fit(page: PDFPage, t: string, box: Rect, font: PDFFont, max: number, align: "left" | "center" = "left") {
  const size = Math.max(5, Math.min(max, box.h * 0.8, (box.w - 6) / Math.max(1, font.widthOfTextAtSize(t, 1))));
  const w = font.widthOfTextAtSize(t, size);
  const x = align === "center" ? box.x + (box.w - w) / 2 : box.x + 3;
  page.drawText(t, { x, y: box.y + Math.max(2, (box.h - size) / 2), size, font, color: INK });
}

/**
 * La police de signature choisie, embarquée EN ENTIER. Pas de sous-ensemble
 * (`subset: true`) : pdf-lib produit alors pour Allura et Kalam une police que
 * le lecteur de Chrome affiche amputée de la plupart des lettres (« a ie ia »
 * pour « Charlie Piancatelli », constaté le 28/09/2026 sur SIG-000001). Le
 * coût : quelques centaines de Ko par PDF signé. En secours, l'italique (dont
 * le texte passe alors par `safe`).
 */
async function embedScript(
  doc: PDFDocument,
  font?: Uint8Array | null,
): Promise<{ script: PDFFont; scriptText: (t: string) => string }> {
  if (font) {
    doc.registerFontkit(fontkit);
    return { script: await doc.embedFont(font, { subset: false }), scriptText: (t) => t };
  }
  return { script: await doc.embedFont(StandardFonts.HelveticaOblique), scriptText: safe };
}

type LineOpts = { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; gap?: number };

/**
 * Le certificat, écrit de haut en bas à partir d'une nouvelle page A4. Une
 * valeur longue (consentement, navigateur, société) passe à la page suivante
 * plutôt que de déborder sous le bas de la page.
 */
function certificateWriter(doc: PDFDocument, regular: PDFFont, bold: PDFFont) {
  const left = 56;
  const width = A4.w - left * 2;
  const top = A4.h - 64;
  const bottom = 48;
  const newPage = () => {
    const page = doc.addPage([A4.w, A4.h]);
    page.drawRectangle({ x: 0, y: A4.h - 6, width: A4.w, height: 6, color: BRAND });
    return page;
  };
  const w = { page: newPage(), y: top, left, width };
  /** Nouvelle page s'il ne reste pas `h` points au-dessus de la marge du bas. */
  const room = (h: number) => {
    if (w.y - h >= bottom) return;
    w.page = newPage();
    w.y = top;
  };
  const line = (text: string, opts: LineOpts = {}) => {
    const size = opts.size ?? 10;
    for (const l of wrap(text, opts.font ?? regular, size, width)) {
      room(size);
      w.page.drawText(l, { x: left, y: w.y, size, font: opts.font ?? regular, color: opts.color ?? INK });
      w.y -= size + 4;
    }
    w.y -= opts.gap ?? 0;
  };
  const field = (label: string, value: string) => {
    // Le libellé ne reste pas seul en bas de page : il part avec la 1re ligne.
    room(12 + 10);
    w.page.drawText(safe(label), { x: left, y: w.y, size: 8, font: bold, color: MUTED });
    w.y -= 12;
    line(value, { size: 10, gap: 8 });
  };
  return { w, room, line, field };
}

/** Le cadre gris du bloc de signature, en haut du certificat. */
const drawSignatureBox = (page: PDFPage, x: number, y: number, width: number, height: number) =>
  page.drawRectangle({
    x,
    y: y - height + 12,
    width,
    height,
    borderColor: rgb(0.85, 0.86, 0.88),
    borderWidth: 1,
    color: rgb(0.985, 0.987, 0.99),
  });

export async function buildSignedPdf(input: SignedPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(safe(`${input.kind === "devis" ? "Devis" : "Contrat"} signé - ${input.company ?? ""}`));
  doc.setProducer("TIM Management - signature électronique");
  doc.setCreationDate(new Date(input.signedAt));

  // 1. Le document présenté, tel quel.
  let layout: SignatureLayout | null = null;
  if (input.mime === "application/pdf") {
    const src = await PDFDocument.load(input.original, { ignoreEncryption: true });
    // Un plan d'avant le décompte des pages : le document envoyé n'a que ses
    // pages de contrat — sans quoi TIM parapherait aussi les certificats.
    const read = readLayout(src);
    layout = read ? { ...read, pages: read.pages ?? src.getPageCount() } : null;
    const pages = await doc.copyPages(src, src.getPageIndices());
    pages.forEach((p) => doc.addPage(p));
  } else {
    const img = input.mime === "image/png" ? await doc.embedPng(input.original) : await doc.embedJpg(input.original);
    const page = doc.addPage([A4.w, A4.h]);
    const scale = Math.min((A4.w - 60) / img.width, (A4.h - 80) / img.height, 1);
    page.drawImage(img, {
      x: (A4.w - img.width * scale) / 2,
      y: (A4.h - img.height * scale) / 2,
      width: img.width * scale,
      height: img.height * scale,
    });
  }

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const who = `${input.signer.firstName} ${input.signer.lastName}`.trim();
  const { script, scriptText } = await embedScript(doc, input.signatureFont);
  const initials = initialsOf(input.signer.firstName, input.signer.lastName);

  // 2. La mention en pied de chaque page du document signé.
  const stamp = safe(`Signé électroniquement par ${who} le ${fmtParis(input.signedAt)} - réf. ${input.reference}`);
  for (const page of doc.getPages()) {
    const { width } = page.getSize();
    const size = 7;
    const w = regular.widthOfTextAtSize(stamp, size);
    page.drawText(stamp, { x: Math.max(12, (width - w) / 2), y: layout ? 3 : 10, size, font: regular, color: MUTED });
    if (!initials) continue;
    const p = scriptText(initials);
    // Contrat généré : dans la case « Paraphe » ; sinon en bas à droite, comme sur papier.
    if (layout) fit(page, p, parapheHalf(layout.paraphe, "client"), script, 16, "center");
    else page.drawText(p, { x: width - 28 - script.widthOfTextAtSize(p, 16), y: 20, size: 16, font: script, color: INK });
  }

  // Le bloc « Le Client » du contrat généré, rempli avec le signataire.
  if (layout) {
    const day = frDate(input.signedAt);
    const pages = doc.getPages();
    for (const slot of layout.slots.filter((x) => x.role === "client")) {
      const page = pages[slot.page];
      if (!page) continue;
      if (slot.field === "name") fit(page, safe(who), slot, bold, 9);
      else if (slot.field === "role") fit(page, safe(input.signer.role ?? ""), slot, regular, 9);
      else if (slot.field === "date") fit(page, safe(day), slot, regular, 9);
      else fit(page, scriptText(who), slot, script, 26, "center");
    }
  }

  // 3. Le certificat.
  const { w, room, line, field } = certificateWriter(doc, regular, bold);
  const { left, width } = w;
  line("Certificat de signature électronique", { font: bold, size: 18, gap: 4 });
  line(
    `${input.kind === "devis" ? "Devis" : "Contrat"}${input.company ? ` - ${input.company}` : ""} · réf. ${input.reference}`,
    { size: 10, color: MUTED, gap: 14 },
  );

  // Le bloc de signature : « Lu et approuvé », la signature, qui, quand.
  const boxH = 104;
  room(boxH);
  const { page, y } = w;
  drawSignatureBox(page, left, y, width, boxH);
  page.drawText(safe("Lu et approuvé - bon pour accord"), { x: left + 14, y: y - 8, size: 8, font: bold, color: MUTED });
  const sigText = scriptText(who);
  const sigSize = Math.min(34, (width * 0.6) / Math.max(1, script.widthOfTextAtSize(sigText, 1)));
  page.drawText(sigText, { x: left + 14, y: y - 52, size: sigSize, font: script, color: INK });
  page.drawText(safe(`${who}${input.signer.role ? `, ${input.signer.role}` : ""}`), {
    x: left + 14,
    y: y - 74,
    size: 9,
    font: bold,
    color: INK,
  });
  page.drawText(safe(`Signé électroniquement le ${fmtParis(input.signedAt)}`), {
    x: left + 14,
    y: y - 86,
    size: 8,
    font: regular,
    color: MUTED,
  });
  w.y -= boxH + 16;

  field("Signataire", `${who}${input.signer.role ? `, ${input.signer.role}` : ""}${input.company ? ` - ${input.company}` : ""}`);
  field("Adresse e-mail vérifiée", input.signer.email);
  field("Document signé", input.documentName ?? (input.kind === "devis" ? "Devis" : "Contrat"));
  field("Empreinte SHA-256 du document présenté", input.originalHash);
  const confirmed = input.pageConfirmations ?? [];
  if (confirmed.length) {
    const times = confirmed.map((c) => c.at).sort();
    const signedPages = confirmed.filter((c) => c.signed).map((c) => c.page);
    field(
      "Pages paraphées",
      `${confirmed.length} page${confirmed.length > 1 ? "s" : ""} confirmée${confirmed.length > 1 ? "s" : ""} une à une par le signataire, ` +
        `du ${fmtParis(times[0])} au ${fmtParis(times[times.length - 1])} (heure de Paris)` +
        (signedPages.length ? ` ; signature apposée page${signedPages.length > 1 ? "s" : ""} ${signedPages.join(" et ")}.` : "."),
    );
  }
  field(
    "Procédé",
    `Signature électronique simple (règlement UE n° 910/2014 dit eIDAS, art. 1366-1367 du Code civil). ` +
      `Code à usage unique envoyé par e-mail à ${input.signer.email} le ${fmtParis(input.codeSentAt)} ` +
      `(heure de Paris), saisi dans l'espace client sécurisé du signataire.`,
  );
  field("Consentement exprimé", input.consent);
  field("Signé le", `${fmtParis(input.signedAt)} (heure de Paris) · ${input.signedAt} (UTC)`);
  field("Adresse IP", input.ip || "non communiquée");
  field("Navigateur", input.userAgent || "non communiqué");

  w.y -= 6;
  line(
    "Les pages qui précèdent sont le document présenté au signataire, sans modification autre que la mention de " +
      (layout
        ? "signature, le paraphe de chaque page et le bloc de signature du Client. Le dossier de preuve"
        : "signature et le paraphe en pied de page. Le dossier de preuve") +
      " (empreintes, horodatage, adresse IP) est conservé par " +
      "TIM Management sous la référence ci-dessus.",
    { size: 8, color: MUTED },
  );

  // Le plan suit le document : TIM contresignera aux emplacements prévus.
  if (layout) writeLayout(doc, layout);
  return doc.save();
}

// ─── La contresignature TIM ──────────────────────────────────────────────────

export type CountersignedPdfInput = {
  /** Le PDF signé par le client (document + son certificat). */
  signedPdf: Uint8Array;
  reference: string;
  company?: string | null;
  signer: { firstName: string; lastName: string; role?: string | null; email: string };
  consent: string;
  /** Empreinte du PDF signé par le client, figée à la demande du code. */
  signedHash: string;
  codeSentAt: string;
  signedAt: string;
  ip?: string | null;
  userAgent?: string | null;
  signatureFont?: Uint8Array | null;
  /** Plan de secours (lu dans le PDF envoyé) si le PDF signé n'en porte pas. */
  fallbackLayout?: SignatureLayout | null;
};

/**
 * Le contrat signé par le client, contresigné par TIM : le bloc « Le
 * Prestataire » reçoit la date et la signature, la case « Paraphe » de chaque
 * page les initiales de TIM (à droite de celles du client), et une page
 * « Certificat de contresignature » s'ajoute après celui du client. Rien de ce
 * que le client a signé n'est modifié.
 */
export async function buildCountersignedPdf(input: CountersignedPdfInput): Promise<Uint8Array> {
  const src = await PDFDocument.load(input.signedPdf, { ignoreEncryption: true });
  const layout = readLayout(src) ?? input.fallbackLayout ?? null;
  const doc = await PDFDocument.create();
  doc.setTitle(safe(`Contrat signé par les deux parties - ${input.company ?? ""}`));
  doc.setProducer("TIM Management - signature électronique");
  doc.setCreationDate(new Date(input.signedAt));
  (await doc.copyPages(src, src.getPageIndices())).forEach((p) => doc.addPage(p));

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  // En entier, comme pour le client (voir embedScript).
  const { script, scriptText } = await embedScript(doc, input.signatureFont);
  const who = `${input.signer.firstName} ${input.signer.lastName}`.trim();
  const initials = initialsOf(input.signer.firstName, input.signer.lastName);

  const pages = doc.getPages();
  if (layout) {
    const role: SignerRole = "provider";
    const contractPages = layout.pages ?? pages.length;
    if (initials) {
      for (const page of pages.slice(0, contractPages)) fit(page, scriptText(initials), parapheHalf(layout.paraphe, role), script, 16, "center");
    }
    const day = frDate(input.signedAt);
    for (const slot of layout.slots.filter((x) => x.role === role)) {
      const page = pages[slot.page];
      if (!page) continue;
      if (slot.field === "date") fit(page, safe(day), slot, regular, 9);
      else if (slot.field === "signature") fit(page, scriptText(who), slot, script, 26, "center");
      else if (slot.field === "name") fit(page, safe(who), slot, bold, 9);
      else if (slot.field === "role") fit(page, safe(input.signer.role ?? ""), slot, regular, 9);
    }
  }

  // Le certificat de contresignature.
  const { w, room, line, field } = certificateWriter(doc, regular, bold);
  const { left, width } = w;
  line("Certificat de contresignature", { font: bold, size: 18, gap: 4 });
  line(`Contrat${input.company ? ` - ${input.company}` : ""} · réf. ${input.reference}`, { size: 10, color: MUTED, gap: 14 });

  const boxH = 100;
  room(boxH);
  const { page, y } = w;
  drawSignatureBox(page, left, y, width, boxH);
  page.drawText(safe("Pour le Prestataire"), { x: left + 14, y: y - 8, size: 8, font: bold, color: MUTED });
  const sigText = scriptText(who);
  const sigSize = Math.min(30, (width * 0.6) / Math.max(1, script.widthOfTextAtSize(sigText, 1)));
  page.drawText(sigText, { x: left + 14, y: y - 46, size: sigSize, font: script, color: INK });
  page.drawText(safe(`${who}${input.signer.role ? `, ${input.signer.role}` : ""}`), { x: left + 14, y: y - 66, size: 9, font: bold, color: INK });
  page.drawText(safe(`Contresigné électroniquement le ${fmtParis(input.signedAt)}`), {
    x: left + 14,
    y: y - 80,
    size: 8,
    font: regular,
    color: MUTED,
  });
  w.y -= boxH + 16;

  field("Signataire pour le Prestataire", `${who}${input.signer.role ? `, ${input.signer.role}` : ""}`);
  field("Adresse e-mail vérifiée", input.signer.email);
  field("Empreinte SHA-256 du contrat signé par le Client", input.signedHash);
  field(
    "Procédé",
    `Signature électronique simple (règlement UE n° 910/2014 dit eIDAS, art. 1366-1367 du Code civil). ` +
      `Code à usage unique envoyé par e-mail à ${input.signer.email} le ${fmtParis(input.codeSentAt)} (heure de Paris), ` +
      `saisi dans l'espace d'administration sécurisé de TIM Management.`,
  );
  field("Consentement exprimé", input.consent);
  field("Contresigné le", `${fmtParis(input.signedAt)} (heure de Paris) · ${input.signedAt} (UTC)`);
  field("Adresse IP", input.ip || "non communiquée");
  field("Navigateur", input.userAgent || "non communiqué");
  w.y -= 6;
  line(
    "Les pages qui précèdent sont le contrat signé par le Client, avec son certificat, sans autre modification que la " +
      "date, la signature et le paraphe du Prestataire. Le dossier de preuve est conservé par TIM Management.",
    { size: 8, color: MUTED },
  );

  return doc.save();
}

/** Le texte accepté par TIM en contresignant, conservé tel quel dans la preuve. */
export const countersignConsent = (company?: string | null): string =>
  `Pour le Prestataire, j'ai relu le contrat signé par le Client${company ? ` (${company})` : ""} et je le contresigne. ` +
  "Je reconnais que la saisie du code reçu par e-mail vaut signature électronique.";
