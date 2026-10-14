/**
 * Le logo animable (plan Publicité, §9 sexies, L) : un SVG en calques nommés,
 * que le moteur vidéo anime élément par élément — les points du symbole un à
 * un, les lettres du nom, puis la signature.
 *
 * Calques attendus (noms libres de casse et d'accents) :
 *   - « symbole » : un sous-calque par élément (point-1, point-2…), dans l'ordre d'apparition ;
 *   - « nom » : une lettre par sous-calque (T, I, M) ;
 *   - « baseline » : la signature, facultative.
 * Tout le reste du dessin apparaît en fondu. Un SVG sans ces calques reste
 * utilisable : il apparaît en entier, en fondu.
 *
 * Ce fichier ne dépend d'aucun analyseur : il travaille sur un `Document` SVG,
 * celui de jsdom au rendu, celui du navigateur pour l'aperçu du kit.
 */

export type LogoParts = {
  viewBox: string;
  /** Dégradés, motifs, styles : ce que les éléments référencent. */
  defs: string;
  /** Les éléments du symbole, dans l'ordre d'apparition. */
  symbol: string[];
  /** Les lettres du nom, dans l'ordre. */
  name: string[];
  baseline: string | null;
  /** Tout le reste du dessin, qui apparaît d'un bloc. */
  rest: string;
};

export type LogoParse = { ok: true; logo: LogoParts; notes: string[] } | { ok: false; error: string };

const ROLES = {
  symbol: ["symbole", "symbol", "icone", "icon", "picto", "embleme"],
  name: ["nom", "name", "wordmark", "texte", "logotype"],
  baseline: ["baseline", "signature", "slogan", "tagline", "sous-titre"],
} as const;

/** Un nom de calque ramené à sa forme simple : « Symbole » → « symbole », « Point 1 » → « point-1 ». Pure. */
export const normId = (id: string): string =>
  id
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Ce qui ne doit jamais entrer dans un rendu : scripts, contenus étrangers, images, liens externes, gestionnaires d'évènements. */
function sanitize(root: Element): string[] {
  const notes: string[] = [];
  for (const tag of ["script", "foreignObject", "iframe"]) for (const el of Array.from(root.getElementsByTagName(tag))) el.remove();
  const images = Array.from(root.getElementsByTagName("image"));
  if (images.length) {
    notes.push(`${images.length} image(s) matricielle(s) retirée(s) : le logo doit être entièrement vectoriel.`);
    for (const el of images) el.remove();
  }
  const all = [root, ...Array.from(root.getElementsByTagName("*"))];
  for (const el of all) {
    for (const a of Array.from(el.attributes)) {
      const name = a.name.toLowerCase();
      const external = (name === "href" || name === "xlink:href") && !a.value.trim().startsWith("#");
      if (name.startsWith("on") || external) el.removeAttribute(a.name);
    }
  }
  return notes;
}

/** Les attributs de présentation d'un groupe, qui doivent suivre ses éléments une fois sortis de lui. */
const CARRIED = ["transform", "fill", "stroke", "stroke-width", "opacity", "style", "fill-rule", "clip-path"];

function wrapper(el: Element): [string, string] {
  const attrs = CARRIED.map((n) => (el.hasAttribute(n) ? ` ${n}="${String(el.getAttribute(n)).replace(/"/g, "&quot;")}"` : "")).join("");
  return attrs ? [`<g${attrs}>`, "</g>"] : ["", ""];
}

/** Le balisage d'un élément, entouré des groupes qui le contiennent (transformations, couleurs héritées). */
function withAncestors(el: Element, inner: string, svg: Element): string {
  let out = inner;
  for (let p = el.parentElement; p && p !== svg; p = p.parentElement) {
    const [open, close] = wrapper(p);
    out = open + out + close;
  }
  return out;
}

const roleOf = (el: Element): keyof typeof ROLES | null => {
  const id = normId(el.getAttribute("id") ?? el.getAttribute("serif:id") ?? el.getAttribute("inkscape:label") ?? "");
  if (!id) return null;
  for (const [role, names] of Object.entries(ROLES) as [keyof typeof ROLES, readonly string[]][]) if (names.includes(id)) return role;
  return null;
};

/** Les éléments d'un calque : ses enfants, en descendant tant qu'il n'y a qu'un groupe (Affinity en ajoute). */
function partsOf(group: Element, svg: Element): string[] {
  let g = group;
  for (;;) {
    const kids = Array.from(g.children).filter((c) => !["title", "desc", "metadata"].includes(c.tagName.toLowerCase()));
    if (kids.length === 1 && kids[0].tagName.toLowerCase() === "g" && kids[0].children.length > 1) {
      g = kids[0];
      continue;
    }
    // Chaque élément garde les groupes qui l'entourent (y compris le calque lui-même) : ses transformations et ses couleurs.
    return kids.map((k) => {
      const [open, close] = wrapper(g);
      return withAncestors(g, open + k.outerHTML + close, svg);
    });
  }
}

/** Découpe un SVG déjà analysé en parties animables. Ne lève pas. */
export function parseLogoDocument(doc: Document): LogoParse {
  const svg = doc.documentElement;
  if (!svg || svg.tagName.toLowerCase() !== "svg") return { ok: false, error: "Ce fichier n'est pas un SVG." };
  if (svg.getElementsByTagName("parsererror").length) return { ok: false, error: "SVG illisible (fichier abîmé ?)." };
  const notes = sanitize(svg);

  let viewBox = svg.getAttribute("viewBox") ?? "";
  if (!viewBox) {
    const w = parseFloat(svg.getAttribute("width") ?? "");
    const h = parseFloat(svg.getAttribute("height") ?? "");
    if (!(w > 0 && h > 0)) return { ok: false, error: "Le SVG n'a ni viewBox ni dimensions : réexportez-le avec « Définir la viewBox »." };
    viewBox = `0 0 ${w} ${h}`;
  }

  const found: Partial<Record<keyof typeof ROLES, Element>> = {};
  for (const el of Array.from(svg.getElementsByTagName("*"))) {
    const role = roleOf(el);
    // Le premier calque d'un rôle l'emporte ; un calque à l'intérieur d'un autre déjà trouvé est ignoré.
    if (role && !found[role] && !Object.values(found).some((f) => f?.contains(el))) found[role] = el;
  }

  const defs = Array.from(svg.children)
    .filter((c) => ["defs", "style"].includes(c.tagName.toLowerCase()))
    .map((c) => c.outerHTML)
    .join("");
  const symbol = found.symbol ? partsOf(found.symbol, svg) : [];
  const name = found.name ? partsOf(found.name, svg) : [];
  const baseline = found.baseline ? withAncestors(found.baseline, found.baseline.outerHTML, svg) : null;

  // Le reste : le dessin sans les calques animés ni les définitions.
  const clone = svg.cloneNode(true) as Element;
  const ids = Object.values(found).map((f) => f!.getAttribute("id"));
  for (const el of Array.from(clone.getElementsByTagName("*"))) {
    const id = el.getAttribute("id");
    if (id && ids.includes(id)) el.remove();
  }
  for (const c of Array.from(clone.children)) if (["defs", "style", "title", "desc", "metadata"].includes(c.tagName.toLowerCase())) c.remove();
  const rest = clone.innerHTML.trim();

  if (!symbol.length && !name.length) notes.push("Aucun calque « symbole » ni « nom » : le logo apparaîtra en entier, en fondu, sans animation par élément.");
  if (found.symbol && symbol.length < 2) notes.push("Le calque « symbole » n'a qu'un élément : séparez chaque point dans son propre calque pour les faire arriver un à un.");
  if (found.name && name.length < 2) notes.push("Le calque « nom » n'a qu'un élément : convertissez le texte en courbes puis séparez les lettres.");
  return { ok: true, logo: { viewBox, defs, symbol, name, baseline, rest }, notes };
}

/** Ce que l'aperçu et l'agent disent du logo, en une ligne. Pure. */
export function logoSummary(p: LogoParse): string {
  if (!p.ok) return p.error;
  const { symbol, name, baseline } = p.logo;
  const bits = [symbol.length ? `symbole en ${symbol.length} élément(s)` : null, name.length ? `nom en ${name.length} lettre(s)` : null, baseline ? "signature" : null].filter(Boolean);
  return bits.length ? `Animable : ${bits.join(", ")}.` : "Logo vectoriel, sans calques nommés : apparition en fondu.";
}
