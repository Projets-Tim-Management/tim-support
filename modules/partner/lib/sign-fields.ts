/**
 * Les champs à remplir en signant, façon DocuSign : chaque étiquette
 * « Parapher » / « Signer » posée à l'endroit exact du document.
 *
 * Module PUR, sans pdf-lib : lu par le serveur (qui calcule le plan) comme par
 * le navigateur (qui affiche les étiquettes par-dessus les pages). Les
 * coordonnées sont celles du PDF : en points, origine en BAS à gauche.
 */

export type Rect = { x: number; y: number; w: number; h: number };
export type SignerRole = "client" | "provider";
export type FieldKind = "paraphe" | "signature" | "name" | "role" | "date";

/**
 * Le plan de signature rangé dans un contrat généré (voir signature-layout,
 * qui l'écrit et le relit dans le PDF). Défini ici pour rester lisible par le
 * navigateur, sans pdf-lib.
 */
export type SignatureField = Exclude<FieldKind, "paraphe">;
export type SignatureSlot = { role: SignerRole; field: SignatureField; page: number } & Rect;
/** `pages` : nombre de pages du contrat lui-même (sans les certificats ajoutés ensuite). */
export type SignatureLayout = { v: 1; paraphe: Rect; slots: SignatureSlot[]; pages?: number };

export type SignField = Rect & {
  id: string;
  /** Numéro de page, à partir de 1. */
  page: number;
  kind: FieldKind;
};

export type SignPlan = {
  count: number;
  /** Taille de chaque page, en points. */
  sizes: { w: number; h: number }[];
  /** Les champs du signataire — à cliquer (paraphe, signature) ou remplis d'office (nom, fonction, date). */
  fields: SignField[];
  /** Pages portant une signature (le serveur exige qu'elles soient signées). */
  signaturePages: number[];
};

/** Un champ à cliquer ; les autres se remplissent d'eux-mêmes. */
export const isActionField = (f: SignField) => f.kind === "paraphe" || f.kind === "signature";

/**
 * La case « Paraphe » se partage : le client à gauche, TIM à droite, chacun
 * gardant une marge vers le milieu — deux paraphes collés se lisent comme un
 * seul mot.
 */
const PARAPHE_GAP = 8;
/** Le haut de la case porte le libellé « Paraphe » : les initiales restent dessous. */
const PARAPHE_LABEL = 8;
export const parapheHalf = (box: Rect, role: SignerRole): Rect => ({
  x: role === "client" ? box.x + 2 : box.x + box.w / 2 + PARAPHE_GAP / 2,
  y: box.y + 1,
  w: box.w / 2 - PARAPHE_GAP / 2 - 2,
  h: box.h - PARAPHE_LABEL - 2,
});

/** Paraphe d'un document sans plan (devis déposé) : en bas à droite de la page. */
const fallbackParaphe = (size: { w: number; h: number }): Rect => ({ x: size.w - 84, y: 12, w: 60, h: 28 });

/** Le plan d'un signataire : ses paraphes, ses zones de signature, ses mentions. */
export function planFor(
  role: SignerRole,
  sizes: { w: number; h: number }[],
  layout: Omit<SignatureLayout, "v"> | null,
): SignPlan {
  const count = sizes.length;
  const fields: SignField[] = [];
  if (layout) {
    const contractPages = Math.min(layout.pages ?? count, count);
    for (let p = 1; p <= contractPages; p++) {
      fields.push({ id: `paraphe-${p}`, page: p, kind: "paraphe", ...parapheHalf(layout.paraphe, role) });
    }
    layout.slots
      .filter((s) => s.role === role)
      .forEach((s, i) => {
        fields.push({ id: `${s.field}-${s.page + 1}-${i}`, page: s.page + 1, kind: s.field, x: s.x, y: s.y, w: s.w, h: s.h });
      });
  } else {
    sizes.forEach((size, i) => fields.push({ id: `paraphe-${i + 1}`, page: i + 1, kind: "paraphe", ...fallbackParaphe(size) }));
  }
  const signaturePages = [...new Set(fields.filter((f) => f.kind === "signature").map((f) => f.page))].sort((a, b) => a - b);
  return { count, sizes, fields, signaturePages };
}

/**
 * Les confirmations par page attendues par le serveur, à partir des champs
 * cliqués : une page est confirmée quand TOUS ses champs à cliquer le sont
 * (horodatée au dernier clic), et « signée » si elle porte une signature.
 */
export function confirmationsFrom(plan: SignPlan, clicked: Record<string, string>) {
  const out: { page: number; at: string; signed?: boolean }[] = [];
  for (let p = 1; p <= plan.count; p++) {
    const own = plan.fields.filter((f) => f.page === p && isActionField(f));
    if (!own.length || own.some((f) => !clicked[f.id])) continue;
    const at = own.map((f) => clicked[f.id]).sort().at(-1)!;
    out.push({ page: p, at, ...(own.some((f) => f.kind === "signature") ? { signed: true } : {}) });
  }
  return out;
}
