import { PDFArray, PDFDict, PDFName, PDFNumber, PDFString, PDFHexString, type PDFDocument, type PDFRef } from "pdf-lib";

import type { Rect, SignatureField, SignatureLayout, SignatureSlot, SignerRole } from "@/modules/partner/lib/sign-fields";

/**
 * Où signer dans un contrat que NOUS générons.
 *
 * À la génération, les zones à remplir (nom et prénom, fonction, date,
 * signature de chaque partie) sont posées dans la mise en page sous forme de
 * liens `tim-sig://<partie>/<champ>` : react-pdf écrit pour chacun un
 * rectangle exact. On relève ces rectangles, on retire les liens, et on range
 * le plan dans les métadonnées du PDF (mots-clés). À la signature, on relit ce
 * plan et on écrit au bon endroit — PAR-DESSUS le document envoyé, qui reste
 * celui dont l'empreinte a été conservée.
 *
 * Un document sans plan (devis déposé, contrat PDF externe) se signe comme
 * avant : paraphe en bas à droite, certificat en dernière page.
 */

// Les types du plan vivent dans sign-fields (module pur, lu par le navigateur).
export type { Rect, SignatureField, SignatureLayout, SignatureSlot, SignerRole };

const SCHEME = "tim-sig://";
const KEYWORD = "tim-signature-layout:";

/** L'adresse du lien qui marque une zone. */
export const slotHref = (role: SignerRole, field: SignatureField) => `${SCHEME}${role}/${field}`;

/**
 * La case « Paraphe » du pied de page, identique sur chaque page A4 : à
 * droite, sous le filet du pied (voir contract-pdf, stampFooter).
 */
export const parapheBox = (pageWidth: number): Rect => ({ x: pageWidth - 56 - 124, y: 12, w: 124, h: 24 });

const text = (v: unknown): string | null =>
  v instanceof PDFString || v instanceof PDFHexString ? v.decodeText() : null;

/** Relève les zones marquées, et retire leurs liens du document. */
export function extractSlots(doc: PDFDocument): SignatureSlot[] {
  const slots: SignatureSlot[] = [];
  doc.getPages().forEach((page, pageIndex) => {
    const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!annots) return;
    const keep: (PDFRef | PDFDict)[] = [];
    for (let i = 0; i < annots.size(); i++) {
      const raw = annots.get(i) as PDFRef | PDFDict;
      const dict = doc.context.lookupMaybe(raw, PDFDict);
      const action = dict?.lookupMaybe(PDFName.of("A"), PDFDict);
      const uri = text(action?.lookup(PDFName.of("URI")));
      const m = uri?.startsWith(SCHEME) ? uri.slice(SCHEME.length).match(/^(client|provider)\/(name|role|date|signature)$/) : null;
      const rect = dict?.lookupMaybe(PDFName.of("Rect"), PDFArray);
      if (!m || !rect) {
        keep.push(raw);
        continue;
      }
      const [x1, y1, x2, y2] = [0, 1, 2, 3].map((k) => (rect.lookup(k, PDFNumber) as PDFNumber).asNumber());
      slots.push({
        role: m[1] as SignerRole,
        field: m[2] as SignatureField,
        page: pageIndex,
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        w: Math.abs(x2 - x1),
        h: Math.abs(y2 - y1),
      });
    }
    if (keep.length) page.node.set(PDFName.of("Annots"), doc.context.obj(keep));
    else page.node.delete(PDFName.of("Annots"));
  });
  return slots;
}

/** Range le plan dans les mots-clés du PDF. */
export function writeLayout(doc: PDFDocument, layout: SignatureLayout): void {
  doc.setKeywords([`${KEYWORD}${Buffer.from(JSON.stringify(layout)).toString("base64")}`]);
}

/** Relit le plan d'un PDF généré ; null pour tout autre document. */
export function readLayout(doc: PDFDocument): SignatureLayout | null {
  const kw = doc.getKeywords() ?? "";
  const i = kw.indexOf(KEYWORD);
  if (i < 0) return null;
  try {
    const encoded = kw.slice(i + KEYWORD.length).split(/\s/)[0];
    const layout = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as SignatureLayout;
    return layout?.v === 1 && Array.isArray(layout.slots) && layout.paraphe ? layout : null;
  } catch {
    return null;
  }
}
