/**
 * LA CHARTE DES VISUELS D'ARTICLE « 5a — Éditorial doux » (validée le 19/11/2026,
 * projet Claude Design « Charte graphique blog Tim Management »). Seuls le titre, la
 * couleur et le motif changent ; tout le reste est figé.
 *
 * L'IMAGE EST CRÉÉE PAR LA DIRECTION DANS CLAUDE DESIGN (décision du 19/11/2026) : le
 * support lui donne le PROMPT de la charte, le bloc « À REMPLIR » déjà rempli avec les
 * données de l'article (H1, catégorie, mot-clé, mots en italique, motif forcé éventuel),
 * puis reçoit l'image qu'elle dépose. Ce module porte ces règles, pures et testées :
 * catégorie, motif proposé, mots en italique, nom de fichier, texte alternatif et légende
 * suggérés, JSON-LD, et le prompt.
 *
 * Interdit partout (image, nom, métadonnées, alt, légende, JSON-LD) : toute mention d'IA
 * ou d'outil de génération.
 */

export const CATEGORIES = ["Pointage", "Planning", "Feuilles d'heures", "Paie & RH", "Suivi de chantier", "Comparatifs"] as const;
export type Category = (typeof CATEGORIES)[number];

/** Panneau / clair / moyen / accent. */
export const PALETTE: Record<Category, { panel: string; light: string; mid: string; accent: string; name: string }> = {
  Pointage: { panel: "#F7897D", light: "#FCD0CA", mid: "#EF6E62", accent: "#C23A30", name: "corail" },
  Planning: { panel: "#7FAEEA", light: "#CFE1F8", mid: "#4F8BD8", accent: "#2F62AE", name: "bleu" },
  "Feuilles d'heures": { panel: "#6FCF9F", light: "#C9EEDA", mid: "#33B57A", accent: "#1E7F55", name: "vert" },
  "Paie & RH": { panel: "#F7C66E", light: "#FCE6BB", mid: "#EBAA36", accent: "#9A6508", name: "jaune" },
  "Suivi de chantier": { panel: "#A398E3", light: "#DDD8F6", mid: "#7C6FD6", accent: "#5446B3", name: "violet" },
  Comparatifs: { panel: "#6CC7D6", light: "#CCEDF2", mid: "#2BA9BE", accent: "#1C7684", name: "turquoise" },
};

export const MOTIFS = ["horloge", "calendrier", "feuille", "pieces", "barres", "versus", "meteo", "route", "bouclier", "personnes", "telephone", "gantt", "casque", "photo", "repas"] as const;
export type Motif = (typeof MOTIFS)[number];

/** Ce que montre chaque motif (texte alternatif). */
export const MOTIF_LABEL: Record<Motif, string> = {
  horloge: "une horloge stylisée",
  calendrier: "un calendrier stylisé",
  feuille: "une feuille de papier cochée",
  pieces: "une pile de pièces et une pièce en euros",
  barres: "un graphique en barres",
  versus: "deux cercles face à face marqués « vs »",
  meteo: "un nuage de pluie",
  route: "une route en pointillés",
  bouclier: "un bouclier coché",
  personnes: "deux silhouettes d'équipe",
  telephone: "un téléphone mobile et son signal",
  gantt: "des barres de planning",
  casque: "un casque de chantier",
  photo: "un appareil photo",
  repas: "une assiette et des couverts",
};

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** La catégorie d'un article : sa thématique (numéro), affinée par le titre. Pure (testée). */
export function categoryOf(themeNumber: number | null | undefined, title: string): Category {
  const t = fold(title);
  if (/\b(comparatif|alternative|meilleur|top \d|vs\b|versus)/.test(t)) return "Comparatifs";
  switch (themeNumber) {
    case 1:
      return /feuilles? d.heures?/.test(t) ? "Feuilles d'heures" : "Pointage";
    case 2:
    case 6:
      return "Paie & RH";
    case 3:
      return "Planning";
    case 4:
    case 5:
      return "Suivi de chantier";
    case 7:
      return "Comparatifs";
    default:
      if (/feuilles? d.heures?/.test(t)) return "Feuilles d'heures";
      if (/planning|gantt/.test(t)) return "Planning";
      if (/salaire|paie|smic|prime|conge|rh\b/.test(t)) return "Paie & RH";
      if (/chantier|rentabilite|materiel|stock/.test(t)) return "Suivi de chantier";
      return "Pointage";
  }
}

// Le premier mot précis du sujet qui apparaît dans le H1 l'emporte (charte, « Choix du motif »).
const MOTIF_RULES: [Motif, RegExp][] = [
  ["meteo", /intemperie|meteo|pluie|neige|canicule|froid/],
  ["repas", /panier|repas|dejeuner|restauration/],
  ["photo", /photo/],
  ["casque", /securite|epi\b|accident|danger|prevention/],
  ["route", /deplacement|trajet|kilometr|transport|grand deplacement/],
  ["telephone", /zone blanche|mobile|geolocalisation|application|appli\b|smartphone|gps/],
  ["personnes", /interim|sous-trait|equipe|salarie|ouvrier|apprenti|recrut|embauch|metier/],
  ["gantt", /gantt|multi-chantier|multi chantier/],
  ["versus", /comparatif|\bvs\b|versus|\btop\b|meilleur|excel|choisir|alternative/],
  ["pieces", /salaire|smic|prime|indemnit|cout|rentabilit|marge|paie|remuneration|majoration|grille/],
  ["barres", /kpi|indicateur|avancement|tableau de bord|suivi de chantier/],
  ["calendrier", /jours? feries?|conges?|absence|delai|calendrier|rtt|anciennete|duree/],
  ["feuille", /modele|document|compte rendu|temps de travail|feuilles? d.heures?|registre|pv\b|proces-verbal|levee de reserve|reception/],
  ["horloge", /heures? sup|horaire|pause|nuit|astreinte|repos|heure/],
  ["bouclier", /rgpd|legal|obligation|regle|controle|loi|conformite|droit/],
];

const CATEGORY_MOTIF: Record<Category, Motif> = { Pointage: "horloge", Planning: "gantt", "Feuilles d'heures": "feuille", "Paie & RH": "pieces", "Suivi de chantier": "barres", Comparatifs: "versus" };

/** Le motif : le plus tôt dans le H1 parmi les mots précis ; sinon celui de la catégorie. Pure (testée). */
export function motifOf(title: string, category: Category): Motif {
  const t = fold(title);
  let best: { motif: Motif; at: number } | null = null;
  for (const [motif, re] of MOTIF_RULES) {
    const m = re.exec(t);
    if (m && (!best || m.index < best.at)) best = { motif, at: m.index };
  }
  return best?.motif ?? CATEGORY_MOTIF[category];
}

/** Taille du titre selon sa longueur (charte). Pure. */
export const titleSize = (title: string) => (title.length <= 48 ? 112 : title.length <= 72 ? 96 : 84);

/** Espace insécable avant « : ; ? ! » (typographie française). Pure. */
export const frenchSpacing = (s: string) => s.replace(/\s*([:;?!])/g, " $1").replace(/  +/g, " ");

/**
 * Les mots en serif italique : le mot-clé s'il figure tel quel dans le H1 (3 mots au plus),
 * sinon la plus longue suite de 1 à 3 mots du H1 faite de mots du mot-clé, sinon le premier
 * mot porteur. Rend [avant, segment, après]. Pure (testée).
 */
export function splitKeyword(title: string, keyword: string): [string, string, string] {
  const words = [...title.matchAll(/[^\s]+/g)].map((m) => ({ w: m[0], at: m.index ?? 0 }));
  // Mots comparés sans élision ni pluriel : « d'heures » = « heures », « feuilles » = « feuille ».
  const root = (w: string) => fold(w).replace(/^[dlj]['’]/, "").replace(/[^a-z0-9-]/g, "").replace(/(?<=..)[sx]$/, "");
  const kw = new Set(fold(keyword).replace(/\b[dlj]['’]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 3).map(root));
  const clean = root;
  // Le mot-clé tel quel, s'il fait 3 mots au plus.
  const idx = fold(title).indexOf(fold(keyword.trim()));
  if (keyword.trim() && idx >= 0 && keyword.trim().split(/\s+/).length <= 3) return [title.slice(0, idx), title.slice(idx, idx + keyword.trim().length), title.slice(idx + keyword.trim().length)];
  let best: [number, number] | null = null;
  for (let i = 0; i < words.length; i++) {
    if (!kw.has(clean(words[i].w))) continue;
    let j = i;
    while (j + 1 < words.length && j - i < 2 && (kw.has(clean(words[j + 1].w)) || (/^(de|du|des|d'|la|le|les)$/i.test(words[j + 1].w) && j + 2 < words.length && kw.has(clean(words[j + 2].w)) && j + 1 - i < 2))) j++;
    if (!best || j - i > best[1] - best[0]) best = [i, j];
  }
  if (!best) {
    const k = words.findIndex((x) => clean(x.w).length >= 6);
    if (k < 0) return [title, "", ""];
    best = [k, k];
  }
  const start = words[best[0]].at;
  const lastWord = words[best[1]].w.replace(/[:;?!,.]+$/, "");
  const end = words[best[1]].at + lastWord.length;
  return [title.slice(0, start), title.slice(start, end), title.slice(end)];
}

const STOP = new Set("a au aux avec ce ces dans de des du en et la le les leur l d pour par sur un une vos votre quel quelle quels quelles comment ou qui que est sont".split(" "));

/** Nom de fichier : slug du mot-clé, sans mots vides, 60 caractères au plus. Pure (testée). */
export function fileSlug(keyword: string, title: string): string {
  const base = (keyword.trim() || title).replace(/['’]/g, " ");
  const words = fold(base)
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w));
  let out = "";
  for (const w of words) {
    const next = out ? `${out}-${w}` : w;
    if (next.length > 60) break;
    out = next;
  }
  return out || "article-tim-management";
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Le mot-clé dans une phrase : première lettre en minuscule, sigles intacts (« BTP »). */
const inSentence = (k: string) => (/^[A-ZÀ-Ý][a-zà-ÿ]/.test(k) ? k.charAt(0).toLowerCase() + k.slice(1) : k);

/** Texte alternatif : ce que montre l'image + le mot-clé, 125 caractères au plus, sans « image de ». Pure (testée). */
export function altText(motif: Motif, category: Category, keyword: string): string {
  const k = inSentence(keyword.trim());
  const full = `${cap(MOTIF_LABEL[motif])} sur fond ${PALETTE[category].name}, pour un article sur ${k}`;
  if (full.length <= 125) return full;
  const short = `${cap(MOTIF_LABEL[motif])}, article sur ${k}`;
  return short.length <= 125 ? short : short.slice(0, 124).replace(/\s+\S*$/, "");
}

/** Légende courte (une phrase). Pure. */
export function captionOf(keyword: string, title: string): string {
  const k = keyword.trim() || title;
  return `${cap(k)} : les repères essentiels expliqués par TIM Management.`;
}

/**
 * Bloc JSON-LD ImageObject à intégrer dans le BlogPosting de l'article. Pure (testée).
 * `contentUrl` = l'adresse RÉELLE de l'image dans la médiathèque WordPress : le site ne sert
 * pas /wp-content/ sur tim-management.co (403 ; tim-front, lib/schema.ts, garde les médias
 * sur cms.tim-management.co).
 */
export function imageJsonLd(o: { contentUrl: string; caption: string; alt: string }) {
  const org = { "@type": "Organization", name: "TIM Management", url: "https://tim-management.co" };
  return {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    contentUrl: o.contentUrl,
    width: 1920,
    height: 1080,
    encodingFormat: "image/webp",
    caption: o.caption,
    description: o.alt,
    creator: org,
    copyrightHolder: org,
    representativeOfPage: true,
  };
}

/**
 * LE PROMPT DE L'IMAGE POUR CLAUDE DESIGN — le texte de la direction (charte « 5a — Éditorial
 * doux », 19/11/2026), mot pour mot ; seul le bloc « À REMPLIR » est rempli avec les données de
 * l'article. Motif forcé : celui choisi sur la fiche, sinon « auto » (Claude Design applique
 * la règle de la charte). Pure (testée).
 */
/**
 * Les points clés d'un article, pour le prompt de l'image : la TL;DR (`tldr-box` de
 * l'introduction), sinon les titres des sections. 5 au plus, en texte. Pure.
 */
export function keyPointsOf(introduction: unknown, sectionTitles: unknown[] = []): string[] {
  const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&rsquo;/g, "’").replace(/\s+/g, " ").trim();
  const box = String(introduction ?? "").match(/<div\b[^>]*class\s*=\s*["'][^"']*\btldr-box\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  const fromBox = box ? [...box[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => strip(m[1])).filter(Boolean) : [];
  const list = fromBox.length ? fromBox : sectionTitles.map((t) => strip(String(t ?? ""))).filter(Boolean);
  return list.slice(0, 5);
}

export function buildImagePrompt(o: { title: string; category: Category; keyword: string; keyPoints?: string[] }): string {
  const points = (o.keyPoints ?? []).length ? (o.keyPoints ?? []).map((k) => `- ${k}`).join("\n") : "- (aucun : appuie-toi sur le H1)";
  return `Crée le visuel d'article de blog Tim Management selon la charte validée « 5a — Éditorial doux » (référence : https://claude.ai/artifact/66eYjVsQ1zud8SBxoADjqs). Seuls le titre, la couleur et le motif changent ; tout le reste est figé. L'image est publiée uniquement sur le site vitrine tim-management.co.

=== À REMPLIR ===
H1 de l'article : ${o.title}
Catégorie : ${o.category}
Mot-clé principal SEO : ${o.keyword || "déduis-le du H1"}
Points clés de l'article (pour choisir le motif et les mots en italique) :
${points}

=== CHARTE FIGÉE ===
Format : 1920×1080 px. Fond #F6F3EE.
Panneau couleur : de x=1240 à 1920, pleine hauteur.
Titre : DM Sans Bold, #111111, x=120, largeur 1020 px, centré verticalement, interligne 1.02, approche −0.03em. Taille selon la longueur du H1 : ≤48 caractères = 112 px, ≤72 = 96 px, >72 = 84 px. Espace insécable avant « : ; ? ! ».
Mot-clé : 1 à 3 mots du H1 porteurs du sujet (le mot-clé principal s'il y figure), en Instrument Serif italique 400, taille 1.1em, couleur « accent » de la catégorie.
Logo : symbole Tim noir seul (sans texte), 76 px, à 96 px du bord droit et 84 px du bas, sur le panneau.
Aucune étiquette de catégorie, aucun nom « Tim Management », aucun autre texte.
Motif : 590×590 px à x=1285, y=200. Formes plates simples, contour noir 5 px #111111, remplissages blanc / « clair » / « moyen » uniquement.

Palette (panneau / clair / moyen / accent) :
- Pointage : #F7897D / #FCD0CA / #EF6E62 / #C23A30
- Planning : #7FAEEA / #CFE1F8 / #4F8BD8 / #2F62AE
- Feuilles d'heures : #6FCF9F / #C9EEDA / #33B57A / #1E7F55
- Paie & RH : #F7C66E / #FCE6BB / #EBAA36 / #9A6508
- Suivi de chantier : #A398E3 / #DDD8F6 / #7C6FD6 / #5446B3
- Comparatifs : #6CC7D6 / #CCEDF2 / #2BA9BE / #1C7684

Choix du motif : le premier mot précis du sujet qui apparaît dans le H1 l'emporte. Exemples : intempéries/météo → meteo ; panier/repas → repas ; photo → photo ; sécurité/EPI/accident → casque ; déplacement/trajet/kilométrique → route ; zone blanche/mobile/géolocalisation → telephone ; intérim/sous-traitant/équipe/salarié → personnes ; Gantt/multi-chantiers → gantt ; comparatif/vs/top/meilleur/Excel/choisir → versus ; salaire/SMIC/prime/indemnité/coût/rentabilité → pieces ; KPI/indicateur/avancement → barres ; jours fériés/congés/absence/délai → calendrier ; modèle/document/compte rendu/temps de travail → feuille ; heures sup/horaire/pause/nuit → horloge ; RGPD/légal/obligation/règle/contrôle → bouclier. Les mots de catégorie seuls (pointage, planning, feuille d'heures, suivi de chantier, paie) ne servent qu'en dernier recours. Si aucun motif existant ne colle vraiment, propose un nouveau motif dans le même style plutôt qu'un motif hors sujet, et dis-le-moi.

=== LIVRABLES SEO / GEO ===
1. Un seul fichier : WebP 1920×1080, qualité ~82, moins de 200 Ko. Nom = slug du mot-clé principal (minuscules, sans accents, mots séparés par des tirets, 60 caractères max, sans mots vides inutiles). Ex. : chomage-intemperies-btp-indemnisation-2026.webp
2. Métadonnées : toutes supprimées (EXIF, XMP, GPS, logiciel), sauf le copyright « Tim Management ».
3. Texte alt (125 caractères max) : décrit ce que montre l'image et reprend le mot-clé principal naturellement. Pas de « image de », pas de copie mot pour mot du H1.
4. Légende courte (1 phrase) utilisable sous l'image.
5. Pas de bloc JSON-LD : Yoast le génère à partir de l'image principale (et le site ne sert pas les images sur tim-management.co/…, elles restent sur cms.tim-management.co).
6. Aucune mention d'IA ou d'outil de génération nulle part : ni dans l'image, ni dans le nom de fichier, ni dans les métadonnées, ni dans l'alt ou la légende.
7. Rappel : le H1 doit rester en texte HTML sur la page, car le texte dans l'image n'est pas lu par Google ni par les IA.

Avant d'exporter, vérifie que le titre tient sur 4 lignes maximum sans déborder sur le panneau. Envoie-moi le fichier WebP, puis le nom de fichier, l'alt et la légende prêts à coller.`;
}
