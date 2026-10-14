import { checkForbidden, checkNumbers, checkTestimonial } from "@/modules/ads/lib/copy/guardrails";
import { coverRect, FULL, type Framing, type Rect } from "@/modules/ads/lib/framing";

/**
 * Les calques d'un plan (plan Publicité, §9 sexies, M2) : un FOND, et des
 * ÉLÉMENTS animés sans fond posés par-dessus — l'interface de TIM recréée, des
 * gestes, du texte, des chiffres sourcés, la marque, des formes. Dessinés une
 * fois pour toutes (remotion/elements.tsx) ; l'agent les choisit, les remplit,
 * les place et les minute. Rien n'est figé : un plan peut poser une
 * notification sur un vrai extrait du rush, entourer un bouton filmé, et faire
 * monter un compteur dans un coin.
 *
 * Ce fichier est le contrat : fonds, éléments, données, et ce que le code
 * vérifie avant tout rendu — textes aux garde-fous, éléments dans le cadre et
 * dans le temps du plan, et jamais un élément opaque sur la zone protégée d'un
 * rush, dans aucun des trois formats.
 */

export const ELEMENT_TYPES = [
  // L'interface de l'app, recréée.
  "liste",
  "notification",
  "bouton",
  "planning",
  "fiche",
  "champ",
  "badge",
  // Les gestes.
  "tap",
  "surbrillance",
  "fleche",
  "soulignement",
  // Le texte.
  "titre",
  "etiquette",
  "bulle",
  // Les chiffres (toujours sourcés).
  "compteur",
  // La marque.
  "logo",
  "cta",
  // Les formes.
  "pastilles",
  "confettis",
] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

export const ENTRIES = ["pop", "fondu", "glisse-haut", "glisse-bas", "glisse-gauche", "glisse-droite", "aucune"] as const;
export const EXITS = ["fondu", "glisse-haut", "glisse-bas", "aucune"] as const;
export const MOVES = ["aucun", "derive", "pulsation", "flottement"] as const;
export const BACKGROUNDS = ["style", "couleur", "rush", "image"] as const;
export const BG_COLORS = ["principale", "accent", "sombre", "clair"] as const;

export type Fond = {
  type: (typeof BACKGROUNDS)[number];
  couleur?: (typeof BG_COLORS)[number];
  rush?: number;
  from?: number;
  to?: number;
  zoom?: Rect | null;
  flou?: boolean;
  /** 0 à 0,7 : un voile sombre sur le rush ou l'image, pour que les éléments ressortent. */
  voile?: number;
  /** Une image des Médias publicitaires (photo, capture). */
  media?: number;
};

export type Element = {
  type: ElementType;
  data: Record<string, unknown>;
  /** Le centre de l'élément, en fractions du cadre (0 à 1). */
  x: number;
  y: number;
  /** La largeur, en fraction de la largeur du cadre ; par défaut celle du type. */
  largeur?: number;
  /** Pour une surbrillance : la hauteur, en fraction de la hauteur du cadre. */
  hauteur?: number;
  /** Pour une flèche : le point d'arrivée. */
  x2?: number;
  y2?: number;
  /** En secondes depuis le début du plan. */
  debut: number;
  fin?: number;
  entree?: (typeof ENTRIES)[number];
  sortie?: (typeof EXITS)[number];
  mouvement?: (typeof MOVES)[number];
};

/** Ce que chaque élément montre et ses données — c'est ce que l'agent lit. */
export const ELEMENT_GUIDE: Record<ElementType, string> = {
  liste: "Carte de l'app : une liste qui se coche élément par élément, puis un bouton. data : titre, elements [{nom, detail}] (2 à 6), action. Opaque.",
  notification: "Notification de l'app. data : app, titre, texte. Opaque.",
  bouton: "Bouton de l'app tapé, qui s'enfonce, puis une confirmation. data : bouton, confirmation (facultative). Opaque.",
  planning: "Carte planning dont les cases se remplissent. data : titre, lignes (2 à 5), jours (5 à 7). Opaque.",
  fiche: "Fiche chantier. data : lieu, lignes (1 à 3). Opaque.",
  champ: "Champ de saisie qui se remplit comme au clavier. data : libelle, valeur. Opaque.",
  badge: "Pastille d'état qui apparaît (« Validé », « Envoyé »). data : texte. Opaque.",
  tap: "Un doigt qui tape à l'endroit (x, y), avec l'onde. data : {}. Transparent : à poser SUR un bouton filmé ou recréé.",
  surbrillance: "Un cadre qui entoure une zone (x, y, largeur, hauteur) et assombrit le reste. data : forme (cercle ou rectangle). Transparent.",
  fleche: "Une flèche qui se dessine de (x, y) à (x2, y2). data : {}. Transparent.",
  soulignement: "Un trait d'accent qui se dessine sous une zone. data : {}. Transparent.",
  titre: "Grand texte animé. data : texte, mot_fort (facultatif, en couleur), animation (mot-a-mot, frappe, bloc, barre-remplace), remplacement (pour barre-remplace). Transparent.",
  etiquette: "Petite étiquette avec une pastille. data : texte. Opaque.",
  bulle: "Bulle de texte (message, remarque). data : texte. Opaque.",
  compteur: "Chiffre SOURCÉ qui défile jusqu'à sa valeur, avec sa source. data : fact (identifiant d'un fait du brief), libelle. Transparent.",
  logo: "Le logo (construit s'il est animable). data : {}. Transparent.",
  cta: "Le bouton d'appel à l'action de la campagne. data : {}. Opaque.",
  pastilles: "Les pastilles de la marque, en motif. data : {}. Transparent.",
  confettis: "Une petite explosion de validation. data : {}. Transparent.",
};

/** La largeur par défaut de chaque type (fraction du cadre), et sa hauteur estimée (fraction de sa largeur) pour les vérifications. */
const SIZE: Record<ElementType, { w: number; ratio: (d: Record<string, unknown>) => number; opaque: boolean }> = {
  liste: { w: 0.8, ratio: (d) => 0.32 + 0.14 * (Array.isArray(d.elements) ? d.elements.length : 3), opaque: true },
  notification: { w: 0.86, ratio: () => 0.3, opaque: true },
  bouton: { w: 0.6, ratio: () => 0.28, opaque: true },
  planning: { w: 0.82, ratio: (d) => 0.24 + 0.12 * (Array.isArray(d.lignes) ? d.lignes.length : 3), opaque: true },
  fiche: { w: 0.78, ratio: (d) => 0.26 + 0.1 * (Array.isArray(d.lignes) ? d.lignes.length : 2), opaque: true },
  champ: { w: 0.7, ratio: () => 0.26, opaque: true },
  badge: { w: 0.36, ratio: () => 0.3, opaque: true },
  tap: { w: 0.12, ratio: () => 1, opaque: false },
  surbrillance: { w: 0.4, ratio: () => 0.5, opaque: false },
  fleche: { w: 0.3, ratio: () => 0.3, opaque: false },
  soulignement: { w: 0.5, ratio: () => 0.06, opaque: false },
  titre: { w: 0.86, ratio: () => 0.3, opaque: false },
  etiquette: { w: 0.42, ratio: () => 0.2, opaque: true },
  bulle: { w: 0.66, ratio: () => 0.3, opaque: true },
  compteur: { w: 0.8, ratio: () => 0.45, opaque: false },
  logo: { w: 0.42, ratio: () => 0.45, opaque: false },
  cta: { w: 0.5, ratio: () => 0.22, opaque: true },
  pastilles: { w: 0.14, ratio: () => 1, opaque: false },
  confettis: { w: 0.5, ratio: () => 1, opaque: false },
};

export const MAX_ELEMENTS = 8;
const MAX = { titre: 40, texte: 80, court: 28, nom: 28, detail: 24, ligne: 32, grand: 70, libelle: 50 } as const;

type Raw = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);

export const isElementType = (v: unknown): v is ElementType => (ELEMENT_TYPES as readonly unknown[]).includes(v);
export const widthOf = (e: Pick<Element, "type" | "largeur">): number => e.largeur ?? SIZE[e.type].w;
/** La hauteur estimée d'un élément, en fraction de la hauteur du cadre, pour un cadre de proportion `aspect` (largeur / hauteur). Pure. */
export const heightOf = (e: Pick<Element, "type" | "largeur" | "hauteur" | "data">, aspect: number): number =>
  e.hauteur ?? widthOf(e) * SIZE[e.type].ratio(e.data) * aspect;

/** Un fond reçu d'un modèle, remis en forme. Pure. */
export function parseFond(raw: unknown): Fond {
  const d = (raw && typeof raw === "object" ? raw : {}) as Raw;
  const type = oneOf(d.type, BACKGROUNDS, "style");
  const z = d.zoom as Raw | null | undefined;
  return {
    type,
    ...(type === "couleur" ? { couleur: oneOf(d.couleur, BG_COLORS, "principale") } : {}),
    ...(type === "rush" ? { rush: num(d.rush), from: num(d.from) ?? 0, to: num(d.to), zoom: z && typeof z === "object" ? { x: Number(z.x), y: Number(z.y), w: Number(z.w), h: Number(z.h) } : null } : {}),
    ...(type === "image" ? { media: num(d.media) } : {}),
    ...(type === "rush" || type === "image" ? { flou: d.flou === true, voile: Math.max(0, Math.min(0.7, num(d.voile) ?? 0)) } : {}),
  };
}

/** Un élément reçu d'un modèle, remis en forme (champs inconnus ignorés). Pure. */
export function parseElement(raw: unknown): Element {
  const d = (raw && typeof raw === "object" ? raw : {}) as Raw;
  const type = (isElementType(d.type) ? d.type : String(d.type ?? "")) as ElementType;
  return {
    type,
    data: d.data && typeof d.data === "object" ? (d.data as Raw) : {},
    x: num(d.x) ?? 0.5,
    y: num(d.y) ?? 0.5,
    ...(num(d.largeur) !== undefined ? { largeur: num(d.largeur) } : {}),
    ...(num(d.hauteur) !== undefined ? { hauteur: num(d.hauteur) } : {}),
    ...(num(d.x2) !== undefined ? { x2: num(d.x2), y2: num(d.y2) ?? num(d.y) ?? 0.5 } : {}),
    debut: num(d.debut) ?? 0,
    ...(num(d.fin) !== undefined ? { fin: num(d.fin) } : {}),
    entree: oneOf(d.entree, ENTRIES, "pop"),
    sortie: oneOf(d.sortie, EXITS, "aucune"),
    mouvement: oneOf(d.mouvement, MOVES, "aucun"),
  };
}

/** Les textes d'un élément : ceux « de pub » (tous les garde-fous) et les données d'interface fictives (interdits seulement). Pure. */
function textsOf(e: Element): { pub: string[]; ui: string[]; problems: string[] } {
  const d = e.data;
  const problems: string[] = [];
  const len = (label: string, v: string, max: number, required = true) => {
    if (required && !v) problems.push(`${label} vide.`);
    else if (v.length > max) problems.push(`${label} : ${v.length} caractères, ${max} au plus.`);
  };
  const pub: string[] = [];
  const ui: string[] = [];
  switch (e.type) {
    case "liste": {
      const items = (Array.isArray(d.elements) ? d.elements : []) as Raw[];
      len("Titre", str(d.titre), MAX.titre);
      len("Action", str(d.action), MAX.court, false);
      if (items.length < 2 || items.length > 6) problems.push("Une liste a 2 à 6 éléments.");
      items.forEach((it, i) => {
        len(`Élément ${i + 1}`, str(it.nom), MAX.nom);
        len(`Détail ${i + 1}`, str(it.detail), MAX.detail, false);
        ui.push(str(it.nom), str(it.detail));
      });
      pub.push(str(d.titre), str(d.action));
      break;
    }
    case "notification":
      len("Titre", str(d.titre), MAX.titre);
      len("Texte", str(d.texte), MAX.texte);
      ui.push(str(d.app));
      pub.push(str(d.titre), str(d.texte));
      break;
    case "bouton":
      len("Bouton", str(d.bouton), MAX.court);
      len("Confirmation", str(d.confirmation), MAX.libelle, false);
      pub.push(str(d.bouton), str(d.confirmation));
      break;
    case "planning": {
      const lignes = strs(d.lignes);
      len("Titre", str(d.titre), MAX.titre);
      if (lignes.length < 2 || lignes.length > 5) problems.push("Un planning a 2 à 5 lignes.");
      lignes.forEach((l, i) => len(`Ligne ${i + 1}`, l, 18));
      pub.push(str(d.titre));
      ui.push(...lignes);
      break;
    }
    case "fiche": {
      const lignes = strs(d.lignes);
      len("Lieu", str(d.lieu), MAX.ligne);
      if (lignes.length < 1 || lignes.length > 3) problems.push("Une fiche a 1 à 3 lignes.");
      lignes.forEach((l, i) => len(`Ligne ${i + 1}`, l, MAX.ligne));
      ui.push(str(d.lieu), ...lignes);
      break;
    }
    case "champ":
      len("Libellé", str(d.libelle), MAX.court);
      len("Valeur", str(d.valeur), MAX.ligne);
      ui.push(str(d.libelle), str(d.valeur));
      break;
    case "badge":
    case "etiquette":
      len("Texte", str(d.texte), MAX.court);
      pub.push(str(d.texte));
      break;
    case "bulle":
      len("Texte", str(d.texte), MAX.texte);
      pub.push(str(d.texte));
      break;
    case "titre":
      len("Texte", str(d.texte), MAX.grand);
      len("Remplacement", str(d.remplacement), MAX.grand, d.animation === "barre-remplace");
      if (str(d.mot_fort) && !str(d.texte).toLowerCase().includes(str(d.mot_fort).toLowerCase())) problems.push("Le mot fort doit être dans le texte.");
      pub.push(str(d.texte), str(d.remplacement));
      break;
    case "compteur":
      len("Libellé", str(d.libelle), MAX.libelle, false);
      pub.push(str(d.libelle));
      break;
    default:
      break;
  }
  return { pub, ui, problems };
}

export type CompoContext = {
  seconds: number;
  facts: Set<number>;
  allowed: Set<number>;
  forbidden: string[];
  /** Le rush du fond, s'il y en a un : sa proportion (largeur / hauteur) et son cadrage. */
  rush: { srcAspect: number; framing: Framing | null } | null;
};

/** Les proportions des trois formats Meta (largeur / hauteur). */
const ASPECTS: Record<string, number> = { "9:16": 1080 / 1920, "4:5": 1080 / 1350, "1:1": 1 };

/** Où tombe la zone protégée d'un rush dans le cadre d'un format, en fractions du cadre ; `null` sans zone protégée. Pure. */
export function protectedInFrame(rush: { srcAspect: number; framing: Framing | null }, aspect: number, zoom: Rect | null): Rect | null {
  const framing = rush.framing ?? { crop: null, protect: null };
  const p = framing.protect;
  if (!p) return null;
  const map = (r: Rect) => ({ x: (p.x - r.x) / r.w, y: (p.y - r.y) / r.h, w: p.w / r.w, h: p.h / r.h });
  if (zoom) return map(zoom);
  const c = coverRect(rush.srcAspect, framing, aspect);
  if (c.fits) return map(c.rect);
  // La zone utile entière, sur le fond : elle est centrée dans le cadre.
  const crop = framing.crop ?? FULL;
  const ca = (crop.w * rush.srcAspect) / crop.h;
  const dw = ca > aspect ? 1 : ca / aspect;
  const dh = ca > aspect ? aspect / ca : 1;
  const ox = (1 - dw) / 2;
  const oy = (1 - dh) / 2;
  return { x: ox + ((p.x - crop.x) / crop.w) * dw, y: oy + ((p.y - crop.y) / crop.h) * dh, w: (p.w / crop.w) * dw, h: (p.h / crop.h) * dh };
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Tout ce qui empêche de rendre les éléments d'un plan ; vide s'ils sont bons. Pure. */
export function elementProblems(elements: Element[], fond: Fond, ctx: CompoContext): string[] {
  const out: string[] = [];
  if (elements.length > MAX_ELEMENTS) out.push(`${MAX_ELEMENTS} éléments au plus par plan.`);
  elements.forEach((e, i) => {
    const at = `Élément ${i + 1}`;
    if (!isElementType(e.type)) {
      out.push(`${at} : type « ${e.type} » inconnu.`);
      return;
    }
    const where = `${at} (${e.type})`;
    if (!(e.debut >= 0 && e.debut < ctx.seconds)) out.push(`${where} : début à ${e.debut} s, hors du plan (${ctx.seconds} s).`);
    if (e.fin !== undefined && !(e.fin > e.debut && e.fin <= ctx.seconds + 0.01)) out.push(`${where} : fin à ${e.fin} s, hors du plan.`);
    if (e.type === "compteur" && !ctx.facts.has(Number(e.data.fact))) out.push(`${where} : fait ${String(e.data.fact)} introuvable — un compteur montre toujours un fait sourcé.`);
    const w = widthOf(e);
    if (!(w > 0.03 && w <= 1)) out.push(`${where} : largeur ${w}, entre 0,03 et 1.`);
    // Dans le cadre, dans chaque format : le centre et les bords (avec une petite marge d'erreur).
    for (const [name, aspect] of Object.entries(ASPECTS)) {
      const h = heightOf(e, aspect);
      const box = { x: e.x - w / 2, y: e.y - h / 2, w, h };
      if (box.x < -0.02 || box.y < -0.02 || box.x + box.w > 1.02 || box.y + box.h > 1.02) {
        out.push(`${where} : sort du cadre en ${name} — rapproche-le du centre ou réduis sa largeur.`);
        break;
      }
      if (fond.type === "rush" && ctx.rush && SIZE[e.type].opaque) {
        const p = protectedInFrame(ctx.rush, aspect, fond.zoom ?? null);
        if (p && overlaps(box, p)) {
          out.push(`${where} : recouvre la zone à ne jamais couper du rush en ${name} — déplace-le.`);
          break;
        }
      }
    }
    if (e.type === "fleche" && (e.x2 === undefined || e.y2 === undefined)) out.push(`${where} : une flèche a un point d'arrivée (x2, y2).`);
    const t = textsOf(e);
    for (const p of t.problems) out.push(`${where} : ${p}`);
    for (const s of t.pub.filter(Boolean)) {
      const p = checkNumbers(s, ctx.allowed) ?? checkForbidden(s, ctx.forbidden) ?? checkTestimonial(s);
      if (p) out.push(`${where} : ${p}`);
    }
    for (const s of t.ui.filter(Boolean)) {
      const p = checkForbidden(s, ctx.forbidden);
      if (p) out.push(`${where} : ${p}`);
    }
  });
  return out;
}

/** Les types d'éléments et de fond d'une partition, pour relier plus tard les résultats aux choix de montage. Pure. */
export function vocabularyOf(shots: { kind: string; fond?: Fond; elements?: Element[] }[]): string[] {
  const used = new Set<string>();
  for (const s of shots) {
    used.add(`plan:${s.kind}`);
    if (s.fond) used.add(`fond:${s.fond.type}${s.fond.flou ? "-flou" : ""}`);
    for (const e of s.elements ?? []) used.add(`element:${e.type}`);
  }
  return [...used].sort();
}
