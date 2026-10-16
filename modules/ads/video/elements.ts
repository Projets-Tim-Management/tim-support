import { checkForbidden, checkNumbers, checkTestimonial } from "@/modules/ads/lib/copy/guardrails";
import { coverRect, FULL, type Framing, type Rect } from "@/modules/ads/lib/framing";
import { looseNumber as num, oneOf, str } from "@/modules/ads/video/parse";

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

export const ENTRIES = ["pop", "impact", "fondu", "glisse-haut", "glisse-bas", "glisse-gauche", "glisse-droite", "aucune"] as const;
export const EXITS = ["fondu", "glisse-haut", "glisse-bas", "aucune"] as const;
export const MOVES = ["aucun", "derive", "pulsation", "flottement"] as const;
export const BACKGROUNDS = ["style", "couleur", "rush", "image", "telephone"] as const;
export const PHONE_ENTRIES = ["monte", "bascule", "aucune"] as const;
/**
 * Les couleurs d'un fond plein : celles du kit, et leurs nuances calculées
 * (décision du 15/10/2026 : « plus de changement de couleur de fond, d'autres
 * couleurs du même type, plus claires ») — toujours dans la charte.
 */
export const BG_COLORS = ["principale", "accent", "sombre", "clair", "accent-pale", "principale-pale", "sombre-doux"] as const;

export type Fond = {
  type: (typeof BACKGROUNDS)[number];
  couleur?: (typeof BG_COLORS)[number];
  rush?: number;
  from?: number;
  to?: number;
  zoom?: Rect | null;
  /** Un mouvement de caméra pendant le plan : de la vue de départ vers ce cadre (fractions du rush), entre `debut` et `fin` (secondes du plan). */
  camera?: { vers: Rect; debut?: number; fin?: number } | null;
  flou?: boolean;
  /** 0 à 0,7 : un voile sombre sur le rush ou l'image, pour que les éléments ressortent. */
  voile?: number;
  /** Une image des Médias publicitaires (photo, capture). */
  media?: number;
  /**
   * Fond « telephone » : le passage de rush joué DANS un téléphone, posé sur
   * une couleur du kit (ou le fond du style), qui entre en 3D et peut plonger
   * vers un point de l'écran (`focus`, en fractions de l'écran filmé).
   */
  telephone?: Phone;
  /** Sur un fond plein (couleur, style, téléphone) : des halos doux aux couleurs du kit, qui dérivent — un fond vivant plutôt qu'un aplat. */
  halo?: boolean;
};

export type Phone = {
  /** Le centre du téléphone et sa hauteur, en fractions du cadre. */
  x?: number;
  y?: number;
  hauteur?: number;
  entree?: (typeof PHONE_ENTRIES)[number];
  /** L'inclinaison de repos, en degrés (-25 à 25) : 0 de face. */
  inclinaison?: number;
  /** La plongée : on grossit (×1 à ×3) autour d'un point de l'écran filmé, entre `debut` et `fin`. */
  focus?: { x: number; y: number; echelle: number; debut?: number; fin?: number } | null;
};

export type Element = {
  type: ElementType;
  /** La variante de l'élément (Publicité › Éléments) ; sans elle, l'élément de base avec ses réglages par défaut. */
  variante?: number;
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
  /** Sur un fond « telephone » : l'élément passe DERRIÈRE le téléphone (un mot géant, une forme). */
  derriere?: boolean;
  /** L'élément pivote jusqu'à cet angle (degrés, -45 à 45), à partir de `debut` (secondes du plan) : un texte qui se penche, lui seul. */
  inclinaison?: { angle: number; debut?: number };
};

/** Ce que chaque élément montre et ses données — c'est ce que l'agent lit. */
export const ELEMENT_GUIDE: Record<ElementType, string> = {
  liste: "Carte de l'app : une liste qui se coche élément par élément, puis un bouton. data : titre, elements [{nom, detail}] (2 à 6), action. Opaque.",
  notification: "Notification de l'app. data : app, titre, texte. Opaque.",
  bouton: "Bouton de l'app tapé, qui s'enfonce, puis une confirmation. data : bouton, confirmation (facultative). Opaque.",
  planning: "Carte planning dont les cases se remplissent. data : titre, lignes (2 à 5), jours (5 à 7). Opaque.",
  fiche: "L'écran chantier de l'app : en-tête, onglets, plan avec l'épingle, adresse et « Itinéraire », dates avec la barre d'avancement, nombre d'ouvriers, référents internes. data : lieu, adresse, onglets (≤4, ex. Infos, Documents, Planning, Véhicules), debut, fin (ex. 30/06/21), avancement (0 à 100), ouvriers (nombre), referents [{nom, role}] (≤3), lignes (≤3, infos libres). Tout est donnée de démo. Opaque, grand : à poser seul ou presque.",
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
  pastilles: "Le symbole du logo TIM, sans le texte (les formes de ton logo), qui arrive forme par forme sur les temps : une signature discrète, dans un coin, près d'un titre ou sur un aplat. data : {}. Transparent.",
  confettis: "Une petite explosion de validation. data : {}. Transparent.",
};

/** La largeur par défaut de chaque type (fraction du cadre), et sa hauteur estimée (fraction de sa largeur) pour les vérifications. */
const SIZE: Record<ElementType, { w: number; ratio: (d: Record<string, unknown>) => number; opaque: boolean }> = {
  liste: { w: 0.8, ratio: (d) => 0.32 + 0.14 * (Array.isArray(d.elements) ? d.elements.length : 3), opaque: true },
  notification: { w: 0.86, ratio: () => 0.3, opaque: true },
  bouton: { w: 0.6, ratio: () => 0.28, opaque: true },
  planning: { w: 0.82, ratio: (d) => 0.24 + 0.12 * (Array.isArray(d.lignes) ? d.lignes.length : 3), opaque: true },
  fiche: {
    w: 0.86,
    ratio: (d) => 0.62 + (d.carte === false ? 0 : 0.36) + 0.11 * (Array.isArray(d.referents) ? d.referents.length : 0) + 0.08 * (Array.isArray(d.lignes) ? d.lignes.length : 0),
    opaque: true,
  },
  champ: { w: 0.7, ratio: () => 0.26, opaque: true },
  badge: { w: 0.36, ratio: () => 0.3, opaque: true },
  tap: { w: 0.12, ratio: () => 1, opaque: false },
  surbrillance: { w: 0.4, ratio: () => 0.5, opaque: false },
  fleche: { w: 0.3, ratio: () => 0.3, opaque: false },
  soulignement: { w: 0.5, ratio: () => 0.06, opaque: false },
  titre: { w: 0.86, ratio: () => 0.3, opaque: false },
  etiquette: { w: 0.42, ratio: () => 0.2, opaque: true },
  bulle: { w: 0.66, ratio: () => 0.3, opaque: true },
  compteur: { w: 0.8, ratio: () => 0.7, opaque: false },
  logo: { w: 0.42, ratio: () => 0.45, opaque: false },
  cta: { w: 0.5, ratio: () => 0.22, opaque: true },
  pastilles: { w: 0.2, ratio: () => 0.9, opaque: false },
  confettis: { w: 0.5, ratio: () => 1, opaque: false },
};

export const MAX_ELEMENTS = 8;
const MAX = { titre: 40, texte: 80, court: 28, nom: 28, detail: 24, ligne: 32, grand: 70, libelle: 50 } as const;

type Raw = Record<string, unknown>;
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

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
    ...(type === "rush" ? { rush: num(d.rush), from: num(d.from) ?? 0, to: num(d.to), zoom: z && typeof z === "object" ? { x: Number(z.x), y: Number(z.y), w: Number(z.w), h: Number(z.h) } : null, ...(parseCamera(d.camera) ? { camera: parseCamera(d.camera) } : {}) } : {}),
    ...(type === "image" ? { media: num(d.media) } : {}),
    ...(d.halo === true && type !== "rush" && type !== "image" ? { halo: true } : {}),
    ...(type === "telephone" ? { rush: num(d.rush), from: num(d.from) ?? 0, to: num(d.to), ...(BG_COLORS.includes(d.couleur as never) ? { couleur: d.couleur as Fond["couleur"] } : {}), telephone: parsePhone(d.telephone) } : {}),
    ...(type === "rush" || type === "image" ? { flou: d.flou === true, voile: Math.max(0, Math.min(0.7, num(d.voile) ?? 0)) } : {}),
  };
}

function parsePhone(raw: unknown): Phone {
  const d = raw && typeof raw === "object" ? (raw as Raw) : {};
  const f = d.focus && typeof d.focus === "object" ? (d.focus as Raw) : null;
  return {
    x: num(d.x) ?? 0.5,
    y: num(d.y) ?? 0.52,
    hauteur: num(d.hauteur) ?? 0.72,
    entree: oneOf(d.entree, PHONE_ENTRIES, "monte"),
    inclinaison: num(d.inclinaison) ?? 0,
    focus: f ? { x: Number(f.x), y: Number(f.y), echelle: Number(f.echelle), ...(num(f.debut) !== undefined ? { debut: num(f.debut) } : {}), ...(num(f.fin) !== undefined ? { fin: num(f.fin) } : {}) } : null,
  };
}

/** Les problèmes d'un téléphone (position, taille, plongée), sachant la durée du plan. Pure. */
export function phoneProblems(t: Phone | undefined, seconds: number): string[] {
  if (!t) return [];
  const out: string[] = [];
  const inside = (v: unknown) => typeof v === "number" && v >= 0 && v <= 1;
  if (!inside(t.x) || !inside(t.y)) out.push("téléphone : centre x et y entre 0 et 1.");
  if (!(typeof t.hauteur === "number" && t.hauteur >= 0.3 && t.hauteur <= 1.2)) out.push("téléphone : hauteur de 0,3 à 1,2 du cadre.");
  if (!(typeof t.inclinaison === "number" && Math.abs(t.inclinaison) <= 25)) out.push("téléphone : inclinaison de -25 à 25 degrés.");
  const f = t.focus;
  if (f) {
    if (!inside(f.x) || !inside(f.y)) out.push("téléphone : point de plongée x et y entre 0 et 1 (fractions de l'écran filmé).");
    if (!(f.echelle >= 1 && f.echelle <= 3)) out.push("téléphone : plongée de ×1 à ×3.");
    const a = f.debut ?? 0;
    const b = f.fin ?? seconds;
    if (!(a >= 0 && b > a && b <= seconds + 1e-9)) out.push(`téléphone : plongée de ${a} à ${b} s, dans la durée du plan (${seconds} s).`);
  }
  return out;
}

function parseCamera(raw: unknown): Fond["camera"] {
  const c = raw && typeof raw === "object" ? (raw as Raw) : null;
  const v = c?.vers && typeof c.vers === "object" ? (c.vers as Raw) : null;
  if (!c || !v) return null;
  return { vers: { x: Number(v.x), y: Number(v.y), w: Number(v.w), h: Number(v.h) }, ...(num(c.debut) !== undefined ? { debut: num(c.debut) } : {}), ...(num(c.fin) !== undefined ? { fin: num(c.fin) } : {}) };
}

/** Un élément reçu d'un modèle, remis en forme (champs inconnus ignorés). Pure. */
export function parseElement(raw: unknown): Element {
  const d = (raw && typeof raw === "object" ? raw : {}) as Raw;
  const type = (isElementType(d.type) ? d.type : String(d.type ?? "")) as ElementType;
  return {
    type,
    ...(num(d.variante) !== undefined ? { variante: num(d.variante) } : {}),
    data: d.data && typeof d.data === "object" ? (d.data as Raw) : {},
    x: num(d.x) ?? 0.5,
    y: num(d.y) ?? 0.5,
    ...(num(d.largeur) !== undefined ? { largeur: num(d.largeur) } : {}),
    ...(num(d.hauteur) !== undefined ? { hauteur: num(d.hauteur) } : {}),
    ...(num(d.x2) !== undefined ? { x2: num(d.x2), y2: num(d.y2) ?? num(d.y) ?? 0.5 } : {}),
    ...(d.derriere === true ? { derriere: true } : {}),
    ...(d.inclinaison && typeof d.inclinaison === "object" ? { inclinaison: { angle: Number((d.inclinaison as Raw).angle), ...(num((d.inclinaison as Raw).debut) !== undefined ? { debut: num((d.inclinaison as Raw).debut) } : {}) } } : {}),
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
      // L'écran « chantier » de l'app : tout y est donnée d'interface fictive (nom, adresse, dates, équipe, référents).
      const lignes = strs(d.lignes);
      const onglets = strs(d.onglets);
      const refs = (Array.isArray(d.referents) ? d.referents : []) as Raw[];
      len("Lieu", str(d.lieu), MAX.ligne);
      len("Adresse", str(d.adresse), 60, false);
      len("Début", str(d.debut), 12, false);
      len("Fin", str(d.fin), 12, false);
      if (lignes.length > 3) problems.push("Une fiche a 3 lignes libres au plus.");
      lignes.forEach((l, i) => len(`Ligne ${i + 1}`, l, MAX.ligne));
      if (onglets.length > 4) problems.push("4 onglets au plus.");
      onglets.forEach((o, i) => len(`Onglet ${i + 1}`, o, 14));
      if (refs.length > 3) problems.push("3 référents au plus.");
      refs.forEach((r, i) => {
        len(`Référent ${i + 1}`, str(r.nom), MAX.nom);
        len(`Rôle ${i + 1}`, str(r.role), MAX.detail, false);
        ui.push(str(r.nom), str(r.role));
      });
      const av = d.avancement;
      if (av !== undefined && !(typeof av === "number" && av >= 0 && av <= 100)) problems.push("Avancement : un pourcentage de 0 à 100.");
      const ou = d.ouvriers;
      if (ou !== undefined && !(typeof ou === "number" && ou >= 0 && ou <= 999)) problems.push("Ouvriers : un nombre de 0 à 999.");
      ui.push(str(d.lieu), str(d.adresse), str(d.debut), str(d.fin), ...onglets, ...lignes);
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
      // En barré-remplacé, le mot fort est celui du texte qui remplace.
      const strongIn = d.animation === "barre-remplace" ? str(d.remplacement) : str(d.texte);
      if (str(d.mot_fort) && !strongIn.toLowerCase().includes(str(d.mot_fort).toLowerCase())) problems.push(d.animation === "barre-remplace" ? "Le mot fort doit être dans le remplacement." : "Le mot fort doit être dans le texte.");
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
  /** Les variantes de l'atelier (Publicité › Éléments), par identifiant : leur élément de base et leur état. */
  variants?: Map<number, { type: string; status: string }>;
  /**
   * Un NOUVEAU montage (l'agent) : seules les variantes actives sont permises.
   * Refaire une vidéo existante accepte une variante retirée depuis : ses
   * derniers réglages servent, l'ancienne créa ne casse pas.
   */
  requireActive?: boolean;
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
    if (e.inclinaison && !(Math.abs(e.inclinaison.angle) <= 45)) out.push(`${where} : inclinaison de -45 à 45 degrés.`);
    if (e.variante !== undefined) {
      const v = ctx.variants?.get(e.variante);
      if (!v) out.push(`${where} : variante ${e.variante} introuvable.`);
      else if (v.type !== e.type) out.push(`${where} : la variante ${e.variante} est un élément « ${v.type} », pas « ${e.type} ».`);
      else if (ctx.requireActive && v.status !== "actif") out.push(`${where} : la variante ${e.variante} n'est pas active (${v.status}) : choisis une variante active.`);
    }
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

/** Le nom de chaque élément de base, pour l'atelier. */
export const ELEMENT_LABELS: Record<ElementType, string> = {
  liste: "Liste qui se coche",
  notification: "Notification",
  bouton: "Bouton tapé",
  planning: "Planning",
  fiche: "Fiche chantier",
  champ: "Champ qui se remplit",
  badge: "Badge",
  tap: "Doigt qui tape",
  surbrillance: "Surbrillance",
  fleche: "Flèche",
  soulignement: "Soulignement",
  titre: "Titre cinétique",
  etiquette: "Étiquette",
  bulle: "Bulle",
  compteur: "Compteur sourcé",
  logo: "Logo",
  cta: "Bouton d'action",
  pastilles: "Symbole du logo",
  confettis: "Confettis",
};

/**
 * Un exemple de chaque élément, avec des données de démonstration, pour son
 * aperçu dans l'atelier (le compteur prend le premier fait sourcé du brief).
 */
export const ELEMENT_SAMPLES: Record<ElementType, Omit<Element, "type" | "debut">> = {
  liste: { data: { titre: "Pointage du jour", elements: [{ nom: "Jules Girard", detail: "7 h 32" }, { nom: "Antoine Rizo", detail: "7 h 35" }, { nom: "Loïc Dubois", detail: "7 h 44" }], action: "Valider" }, x: 0.5, y: 0.5 },
  notification: { data: { app: "TIM", titre: "Heures reçues au bureau", texte: "Prêtes pour la paie, sans ressaisie." }, x: 0.5, y: 0.4 },
  bouton: { data: { bouton: "Pointer l'arrivée", confirmation: "Arrivée enregistrée" }, x: 0.5, y: 0.5 },
  planning: { data: { titre: "Semaine du chantier", lignes: ["Gros œuvre", "Électricité", "Finitions"], jours: 5 }, x: 0.5, y: 0.5 },
  fiche: {
    data: {
      lieu: "Chantier Les Terrasses",
      adresse: "12 avenue des Arts, Villeurbanne",
      onglets: ["Infos", "Documents", "Planning", "Véhicules"],
      debut: "02/09/24",
      fin: "30/06/26",
      avancement: 64,
      ouvriers: 5,
      referents: [{ nom: "Antoine Durel", role: "Chef de chantier" }, { nom: "Luc Viard", role: "Conducteur de travaux" }],
    },
    x: 0.5,
    y: 0.5,
  },
  champ: { data: { libelle: "Heure d'arrivée", valeur: "7 h 32" }, x: 0.5, y: 0.5 },
  badge: { data: { texte: "Validé" }, x: 0.5, y: 0.5 },
  tap: { data: {}, x: 0.5, y: 0.55 },
  surbrillance: { data: { forme: "rectangle" }, x: 0.5, y: 0.5, largeur: 0.7, hauteur: 0.12 },
  fleche: { data: {}, x: 0.25, y: 0.3, x2: 0.65, y2: 0.6 },
  soulignement: { data: {}, x: 0.5, y: 0.55, largeur: 0.6 },
  titre: { data: { texte: "Fini la ressaisie du vendredi", mot_fort: "ressaisie", animation: "mot-a-mot" }, x: 0.5, y: 0.45 },
  etiquette: { data: { texte: "Mis à jour pour tous" }, x: 0.5, y: 0.5 },
  bulle: { data: { texte: "Tout le monde est là !" }, x: 0.5, y: 0.5 },
  compteur: { data: { fact: 0, libelle: "" }, x: 0.5, y: 0.45 },
  logo: { data: {}, x: 0.5, y: 0.5 },
  cta: { data: {}, x: 0.5, y: 0.5 },
  pastilles: { data: {}, x: 0.5, y: 0.5, largeur: 0.2 },
  confettis: { data: {}, x: 0.5, y: 0.5 },
};
