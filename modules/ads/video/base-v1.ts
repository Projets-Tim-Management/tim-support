import { BG_COLORS, PHONE_ENTRIES, type Element, type Fond } from "@/modules/ads/video/elements";
import { clip, str } from "@/modules/ads/video/parse";
// Import circulaire avec score.ts : ces constantes ne sont lues qu'à l'appel des fonctions, jamais au chargement.
import { CAMERA_MOVES, FPS, MAX_TOTAL, type Score } from "@/modules/ads/video/score";
import { TRANSITION_GUIDE } from "@/modules/ads/video/transitions";

/**
 * La Base V1 des vidéos publicitaires (plan Publicité, 15/10/2026) : la
 * structure et les règles arrêtées avec Charlie, rendu après rendu, sur les
 * créas 8 (pointage) et 10 (planning). Chaque nouveau montage d'une IA (agent
 * de campagne, premier montage, retouche qui réécrit la partition) PART de
 * cette base : il en garde la structure et les règles, et n'améliore que ce
 * qui est marqué libre. Le code le vérifie (`baseV1Problems`) ; un montage qui
 * s'en écarte est refusé avec la raison, rien n'est rendu.
 *
 * Pourquoi tant de règles : chacune répond à un retour de Charlie sur un rendu
 * (« on n'a pas le temps de lire », « trop de rouge », « trop de blanc »,
 * « pas de rond ni de carré », « on ne sait pas de quoi tu parles »…). Les
 * assouplir, c'est revenir sur une décision : on fait une Base V2, pas une
 * exception.
 */

const BASE_VERSION = "v1" as const;

export const BEAT_ROLES = ["accroche", "retournement", "geste", "consequence", "preuve", "fin"] as const;
export type BeatRole = (typeof BEAT_ROLES)[number];

/** Les fonds sombres (accroche, geste) et les fonds pâles (retournement, conséquence, preuve). Jamais l'accent en aplat : trop de rouge. */
const DARK = ["sombre", "sombre-doux", "principale"] as const;
const PALE = ["accent-pale", "principale-pale", "clair"] as const;

type Beat = {
  role: BeatRole;
  /** Ce que ce temps doit faire comprendre. */
  but: string;
  seconds: [number, number];
  /** Ce qu'une IA garde, toujours. */
  garde: string[];
  /** Ce qu'une IA peut changer (et doit adapter à la campagne). */
  libre: string[];
  optional?: boolean;
};

const BEATS: Beat[] = [
  {
    role: "accroche",
    but: "Le problème du chantier, en deux coups : un moment (« Vendredi. », « Lundi. ») puis la tension (« Soir. », « Tout change. »), et une phrase tapée qui nomme la douleur.",
    seconds: [3.5, 4.5],
    garde: [
      "plan composé sur un fond SOMBRE (sombre, sombre-doux ou principale) avec halo",
      "2 titres courts qui arrivent en « impact », l'un sous l'autre, bien espacés ; le second porte le mot fort en rouge",
      "dessous, UNE phrase en animation « frappe » (police des textes, curseur) qui finit au moins 1 s avant la fin du plan",
      "la caméra s'approche de la phrase tapée (suivi, ×1,2 à ×1,3) ; elle peut se pencher, seule (inclinaison de l'élément), jamais les titres au-dessus",
    ],
    libre: ["les mots (toujours la douleur de l'angle : le vendredi des carnets, le lundi du planning, la paie…)", "lequel des fonds sombres", "l'inclinaison de la phrase (0 à ±35°)"],
  },
  {
    role: "retournement",
    but: "L'ancienne façon barrée, la nouvelle à sa place : on doit comprendre CE QUE FAIT le logiciel (« Le planning prévient l'équipe. »), pas un slogan vague.",
    seconds: [2.8, 3.6],
    garde: [
      "plan composé sur un fond PÂLE (accent-pale, principale-pale ou clair) avec halo",
      "UN titre en « barré-remplacé » : l'ancienne façon (3 à 5 mots) se lit ~1 s, chaque mot est barré, puis le remplacement arrive mot par mot",
      "le remplacement nomme la fonctionnalité de l'angle, avec UN mot fort (en rouge) — ex. « planning », « pointage »",
      "rien d'autre à l'écran que ce titre",
    ],
    libre: ["les deux phrases", "le mot fort", "le mouvement de caméra (panoramique, montée, descente)"],
  },
  {
    role: "geste",
    but: "Le logiciel en vrai : le rush de LA fonctionnalité de l'angle dans un téléphone, et la caméra qui fonce sur chaque détail qui compte.",
    seconds: [4.0, 5.5],
    garde: [
      "fond « telephone » sur un fond SOMBRE avec halo ; le rush montre la fonctionnalité de l'angle (ses fonctionnalités déclarées le disent) — un angle pointage, un rush de pointage",
      "2 à 4 étiquettes blanches (données de démo : noms, postes, équipes) qui sortent du téléphone l'une après l'autre (≥ 0,4 s d'écart)",
      "caméra en « suivi » : un point par étiquette, à son apparition (×1,5 à ×1,8), puis retour au téléphone entier ; le fond se floute pendant le zoom",
      "pas de mot géant en contour derrière le téléphone (jugé peu lisible)",
    ],
    libre: ["le passage du rush", "l'entrée du téléphone (monte, bascule) et son inclinaison", "le texte des étiquettes (toujours dans le vocabulaire de la fonctionnalité)", "un doigt qui tape le bouton du rush"],
  },
  {
    role: "consequence",
    but: "Le résultat du geste, visible : validé, envoyé, prévenu — en vert de validation.",
    seconds: [2.3, 3.2],
    garde: [
      "plan composé sur un fond PÂLE avec halo",
      "SOIT la « Confirmation en grand » (variante de l'atelier) au centre, SOIT 2 à 3 notifications en cascade qui se valident l'une après l'autre",
      "la validation est VERTE (vert de validation), avec son onde ; jamais de confettis",
      "au plus une pastille de résultat (« Toute l'équipe prévenue », « Paie prête »)",
    ],
    libre: ["confirmation en grand ou notifications", "les textes (le résultat concret de LA fonctionnalité)", "les visages des notifications (Médias publicitaires, nature Visage)"],
  },
  {
    role: "preuve",
    but: "La preuve sourcée qui rassure, puis l'invitation.",
    seconds: [2.8, 3.6],
    optional: true,
    garde: [
      "plan composé sur un fond PÂLE avec halo",
      "un « compteur » d'un FAIT SOURCÉ du brief (rouleaux, foule de silhouettes, sans la ligne « Source »)",
      "puis un titre court d'invitation en « impact » sous le compteur (« Rejoignez-les. »)",
    ],
    libre: ["le fait (parmi ceux du brief)", "la phrase d'invitation"],
  },
  {
    role: "fin",
    but: "Le logo en grand, puis l'offre et le bouton — le moteur s'en charge.",
    seconds: [2.6, 3.0],
    garde: ["plan « fin » du moteur (logo qui s'approche, puis la caméra descend vers l'offre et le bouton)", "entrée en fondu"],
    libre: ["la phrase de l'offre (« Essai gratuit de 30 jours »)"],
  },
];

/** Les règles qui valent pour tout le montage. */
const GLOBAL_RULES = [
  "Durée totale de 15 à 20 s : chaque texte doit avoir le temps d'être lu (règle de lecture vérifiée par le code).",
  "Les fonds alternent : jamais deux plans de suite sur le même fond, au moins 4 fonds différents, jamais l'accent (rouge) en aplat ; chaque fond plein a son halo.",
  "Le rouge est une TOUCHE : le mot fort (un mot par titre), la barre, le curseur, le bouton. Le vert ne sert qu'à « validé ».",
  "Chaque plan composé a son mouvement de caméra ; chaque coupe a sa transition, jamais deux fois la même de suite, jamais l'éclair.",
  "Un léger arrondi partout, ni angle vif ni pilule ni rond (le moteur l'applique) ; une carte blanche sur fond clair a son trait et son ombre (idem).",
  "Tout parle de la campagne : l'angle dit la fonctionnalité (pointage, planning, paie…) ; le rush, les étiquettes, les notifications et les mots viennent de CETTE fonctionnalité. Données d'interface fictives mais crédibles (prénoms, postes, chantiers).",
  "Aucun chiffre absent des faits sourcés et de l'offre, aucun témoignage, aucune mention interdite (le code le vérifie partout).",
];

const fondKey = (f: Fond): string => (f.type === "couleur" || f.type === "telephone" ? `${f.type === "telephone" ? "tel:" : ""}${f.couleur ?? "style"}` : f.type === "rush" ? `rush:${f.rush}` : f.type);
const colorOfFond = (f: Fond): string | null => (f.type === "couleur" || f.type === "telephone" ? (f.couleur ?? null) : null);
const titles = (els: Element[]) => els.filter((e) => e.type === "titre");
const text = (e: Element, k: string) => str(e.data[k]);
const words = (t: string) => t.split(/\s+/).filter(Boolean);

/**
 * Le temps de lecture d'un titre une fois apparu, selon son animation — avec les
 * MÊMES durées que le moteur : la vitesse réglée sur la variante (qui accélère
 * ou ralentit l'animation) et le rythme du style (qui allonge la lecture de
 * l'ancienne façon, dans un barré-remplacé). Pure.
 */
export function readingNeed(e: Element, opts: { speed?: number; pace?: number } = {}): number {
  const t = text(e, "texte");
  const anim = text(e, "animation") || "mot-a-mot";
  const speed = opts.speed && opts.speed > 0 ? opts.speed : 1;
  const pace = opts.pace ?? 1;
  // Calé sur les rendus validés par Charlie le 15/10/2026 : la phrase tapée reste 1 s finie ; le remplacement, le temps d'arriver puis d'être lu.
  if (anim === "frappe") return (2 + t.length * 1.6) / speed / FPS + 1.0;
  if (anim === "barre-remplace") return (Math.round(28 * pace) + words(t).length * 5 + 14 + words(text(e, "remplacement")).length * 4 + 10) / speed / FPS + 0.3;
  return 0.5 + 0.04 * t.length;
}

export type BaseContext = {
  /** Les fonctionnalités que l'angle de la créa évoque (voir default-score.featuresOf). */
  angleFeatures: string[];
  /** Les fonctionnalités déclarées de chaque rush. */
  rushFeatures: Map<number, string[]>;
  facts: Set<number>;
  /** Le rythme du style (voir pace.ts) et la vitesse réglée sur chaque variante d'élément : le temps de lecture en dépend. */
  pace?: number;
  speeds?: Map<number, number>;
};

/** Tout ce qui écarte une partition de la Base V1 ; vide si elle la suit. Pure. */
export function baseV1Problems(score: Score, ctx: BaseContext): string[] {
  const out: string[] = [];
  const shots = score.shots;
  const roles = shots.map((s) => s.role);
  const at = (i: number) => `Base V1, plan ${i + 1} (${roles[i] ?? "sans rôle"})`;
  if (roles.some((r) => !r)) out.push("Base V1 : chaque plan dit son rôle (accroche, retournement, geste, consequence, preuve, fin).");
  const expected = BEATS.filter((b) => !b.optional || roles.includes(b.role)).map((b) => b.role);
  if (roles.join(",") !== expected.join(",")) out.push(`Base V1 : les plans suivent l'ordre ${BEATS.map((b) => (b.optional ? `(${b.role})` : b.role)).join(" → ")} — reçu : ${roles.map((r) => r ?? "?").join(" → ")}.`);
  const total = shots.reduce((t, s) => t + (Number.isFinite(s.seconds) ? s.seconds : 0), 0);
  if (total < 15 || total > MAX_TOTAL) out.push(`Base V1 : durée totale de ${Math.round(total * 10) / 10} s, de 15 à ${MAX_TOTAL} s.`);

  // Les fonds : alternés, au moins 4 différents, jamais l'accent en aplat, un halo sur chaque fond plein.
  const fonds = shots.map((s) => (s.kind === "compo" ? s.fond : null));
  fonds.forEach((f, i) => {
    if (!f) return;
    const prev = fonds[i - 1];
    if (prev && fondKey(prev).replace("tel:", "") === fondKey(f).replace("tel:", "")) out.push(`${at(i)} : même fond que le plan précédent — les fonds alternent.`);
    if (colorOfFond(f) === "accent") out.push(`${at(i)} : jamais l'accent (rouge) en aplat — le rouge est une touche.`);
    if ((f.type === "couleur" || f.type === "telephone") && !f.halo) out.push(`${at(i)} : un fond plein a son halo (halo: true).`);
  });
  const distinct = new Set(fonds.filter((f): f is Fond => Boolean(f)).map((f) => fondKey(f).replace("tel:", "")));
  if (distinct.size < 4) out.push(`Base V1 : ${distinct.size} fonds différents, au moins 4.`);

  // Caméra et transitions.
  shots.forEach((s, i) => {
    if (s.kind === "compo" && (!s.camera || s.camera.mouvement === "aucun")) out.push(`${at(i)} : chaque plan composé a son mouvement de caméra.`);
    if (i === 0) return;
    const tr = s.transition;
    if (!tr) out.push(`${at(i)} : chaque coupe a sa transition (choisie, pas celle du style par défaut).`);
    else {
      if (tr.type === "flash") out.push(`${at(i)} : pas d'éclair (trop de rouge).`);
      if (shots[i - 1].transition?.type === tr.type) out.push(`${at(i)} : transition « ${tr.type} » deux fois de suite — varie.`);
    }
  });

  // Les éléments : aucun confetti ; un mot fort = un mot ; chaque titre lisible.
  shots.forEach((s, i) => {
    if (s.kind !== "compo") return;
    s.elements.forEach((e, k) => {
      if (e.type === "confettis") out.push(`${at(i)} : pas de confettis (la validation se fait en vert, avec son onde).`);
      if (e.type !== "titre") return;
      const strong = text(e, "mot_fort");
      if (strong && words(strong).length > 1) out.push(`${at(i)}, élément ${k + 1} : un seul mot fort (le rouge est une touche).`);
      const shown = (e.fin ?? s.seconds) - e.debut;
      const need = readingNeed(e, { pace: ctx.pace, speed: e.variante != null ? ctx.speeds?.get(e.variante) : undefined });
      if (shown + 1e-9 < need) out.push(`${at(i)}, élément ${k + 1} : « ${clip(text(e, "texte"), 30)} » reste ${round(shown)} s, il en faut ${round(need)} pour le lire — avance-le ou allonge le plan.`);
    });
  });

  // Chaque temps : sa durée, son fond, ses éléments.
  shots.forEach((s, i) => {
    const beat = BEATS.find((b) => b.role === s.role);
    if (!beat) return;
    const [lo, hi] = beat.seconds;
    if (s.seconds < lo - 1e-9 || s.seconds > hi + 1e-9) out.push(`${at(i)} : de ${lo} à ${hi} s.`);
    if (beat.role === "fin") {
      if (s.kind !== "fin") out.push(`${at(i)} : le plan « fin » du moteur.`);
      return;
    }
    if (s.kind !== "compo") {
      out.push(`${at(i)} : un plan composé.`);
      return;
    }
    const f = s.fond;
    const color = colorOfFond(f);
    const els = s.elements;
    const ts = titles(els);
    if (beat.role === "accroche") {
      if (f.type !== "couleur" || !DARK.includes(color as (typeof DARK)[number])) out.push(`${at(i)} : un fond sombre (${DARK.join(", ")}).`);
      const impacts = ts.filter((e) => e.entree === "impact" && text(e, "animation") !== "frappe");
      const typed = ts.filter((e) => text(e, "animation") === "frappe");
      if (impacts.length !== 2) out.push(`${at(i)} : deux titres courts en « impact ».`);
      if (typed.length !== 1) out.push(`${at(i)} : une phrase en « frappe » sous les titres.`);
    }
    if (beat.role === "retournement") {
      if (f.type !== "couleur" || !PALE.includes(color as (typeof PALE)[number])) out.push(`${at(i)} : un fond pâle (${PALE.join(", ")}).`);
      const swap = ts.filter((e) => text(e, "animation") === "barre-remplace");
      if (swap.length !== 1 || els.length !== 1) out.push(`${at(i)} : un seul élément, le titre en « barré-remplacé ».`);
      if (swap[0] && !text(swap[0], "mot_fort")) out.push(`${at(i)} : le remplacement porte un mot fort.`);
    }
    if (beat.role === "geste") {
      if (f.type !== "telephone") out.push(`${at(i)} : le rush dans un téléphone (fond « telephone »).`);
      else {
        if (!DARK.includes(color as (typeof DARK)[number])) out.push(`${at(i)} : le téléphone sur un fond sombre (${DARK.join(", ")}).`);
        const features = ctx.rushFeatures.get(Number(f.rush)) ?? [];
        if (ctx.angleFeatures.length && !features.some((x) => ctx.angleFeatures.includes(x)))
          out.push(`${at(i)} : le rush ${String(f.rush)} montre « ${features.join(", ") || "rien de déclaré"} », l'angle parle de « ${ctx.angleFeatures.join(", ")} » — prends un rush de CETTE fonctionnalité.`);
      }
      const tags = els.filter((e) => e.type === "etiquette");
      if (tags.length < 2 || tags.length > 4) out.push(`${at(i)} : 2 à 4 étiquettes qui sortent du téléphone.`);
      if (els.some((e) => e.derriere)) out.push(`${at(i)} : pas de mot géant derrière le téléphone.`);
      if (s.camera?.mouvement !== "suivi" || (s.camera.points?.length ?? 0) < tags.length) out.push(`${at(i)} : caméra en « suivi », un point par étiquette.`);
    }
    if (beat.role === "consequence") {
      if (f.type !== "couleur" || !PALE.includes(color as (typeof PALE)[number])) out.push(`${at(i)} : un fond pâle (${PALE.join(", ")}).`);
      const notes = els.filter((e) => e.type === "notification");
      // Une seule notification : seulement la confirmation en grand (une variante) ; sinon une cascade de 2 à 3.
      const single = notes.length === 1 && notes[0].variante != null;
      if (!single && (notes.length < 2 || notes.length > 3)) out.push(`${at(i)} : la confirmation en grand (variante), ou 2 à 3 notifications qui se valident.`);
      if (els.filter((e) => e.type === "etiquette").length > 1) out.push(`${at(i)} : au plus une pastille de résultat.`);
    }
    if (beat.role === "preuve") {
      if (f.type !== "couleur" || !PALE.includes(color as (typeof PALE)[number])) out.push(`${at(i)} : un fond pâle (${PALE.join(", ")}).`);
      const counter = els.find((e) => e.type === "compteur");
      if (!counter || !ctx.facts.has(Number(counter.data.fact))) out.push(`${at(i)} : un compteur d'un fait sourcé du brief.`);
      if (!ts.some((e) => e.entree === "impact")) out.push(`${at(i)} : une invitation courte en « impact » sous le compteur.`);
    }
  });
  return out;
}

const round = (n: number) => Math.round(n * 10) / 10;

let guide: Record<string, unknown> | null = null;

/** Ce que l'IA lit de la base : les temps, ce qu'elle garde, ce qu'elle peut changer, les règles, et deux montages de référence. Construit une fois. */
export function baseV1Guide(): Record<string, unknown> {
  return (guide ??= buildGuide());
}

function buildGuide(): Record<string, unknown> {
  return {
    version: BASE_VERSION,
    consigne:
      "Tout nouveau montage PART de la Base V1 : écris `base: \"v1\"` et donne à chaque plan son `role`. Tu gardes la structure et tout ce qui est « garde » ; tu améliores ce qui est « libre », en l'adaptant à l'angle et à sa fonctionnalité. Le code refuse un montage qui s'en écarte, avec la raison.",
    regles: GLOBAL_RULES,
    temps: BEATS.map((b) => ({ role: b.role, but: b.but, duree_s: b.seconds, facultatif: Boolean(b.optional), garde: b.garde, libre: b.libre })),
    vocabulaire: {
      plan: "Chaque plan : role (le temps de la base), kind, seconds, transition { type, seconds (0,15 à 0,8), x/y pour cercle } — comment il ENTRE depuis le précédent.",
      transitions: TRANSITION_GUIDE,
      camera: `Plan composé : camera { mouvement: ${CAMERA_MOVES.join(" | ")}, amplitude (0,3 à 2) }. « suivi » : points [{ x, y (fractions du cadre), debut (s), echelle (1 à 2,5), rotation (-15 à 15) }] — la caméra fonce sur chaque point à son heure, le fond se floute.`,
      fonds: `fond { type: couleur | telephone | rush | image | style, couleur: ${BG_COLORS.join(" | ")} (les « -pale » et « sombre-doux » sont des nuances calculées du kit), halo: true }. telephone : rush, from, to, couleur, telephone { x, y, hauteur (0,3 à 1,2), entree: ${PHONE_ENTRIES.join(" | ")}, inclinaison (-25 à 25), focus { x, y (fractions de l'écran filmé), echelle, debut, fin } }.`,
      elements: "En plus des champs de chaque élément : inclinaison { angle (-45 à 45), debut } — l'élément seul se penche ; derriere: true — passe derrière le téléphone (déconseillé en V1). Titres : animation bloc | mot-a-mot | frappe | barre-remplace (remplacement, mot_fort dans le remplacement).",
    },
    exemples: BASE_V1_EXAMPLES,
  };
}

const notification = (titre: string, texte: string, y: number, debut: number, visage: number) => ({ type: "notification", data: { app: "TIM", titre, texte, visage }, x: 0.5, y, largeur: 0.84, debut, entree: "glisse-haut" });
const tag = (texte: string, x: number, y: number, debut: number, entree: "glisse-gauche" | "glisse-droite") => ({ type: "etiquette", data: { texte }, x, y, debut, fin: 4.1, entree, sortie: "fondu" });

/**
 * Les deux montages validés par Charlie le 15/10/2026, réécrits dans la Base
 * V1 : à lire comme des exemples (rush, faits et variantes sont ceux du compte
 * de démo — à adapter, jamais à recopier tels quels).
 */
export const BASE_V1_EXAMPLES: { angle: string; fonctionnalite: string; partition: { base: "v1"; shots: Record<string, unknown>[] } }[] = [
  {
    angle: "Le planning suit le chantier : une modification au bureau, l'équipe la voit tout de suite sur son téléphone.",
    fonctionnalite: "planning",
    partition: {
      base: "v1",
      shots: [
        {
          role: "accroche",
          kind: "compo",
          seconds: 3.9,
          camera: { mouvement: "suivi", points: [{ x: 0.5, y: 0.7, debut: 3.0, echelle: 1.25 }] },
          fond: { type: "couleur", couleur: "sombre", halo: true },
          elements: [
            { type: "titre", data: { texte: "Lundi.", animation: "bloc" }, x: 0.5, y: 0.29, largeur: 0.9, debut: 0.15, entree: "impact" },
            { type: "titre", data: { texte: "Tout change.", mot_fort: "change", animation: "bloc" }, x: 0.5, y: 0.49, largeur: 0.9, debut: 0.8, entree: "impact" },
            { type: "titre", data: { texte: "Et l'équipe n'est pas au courant.", animation: "frappe" }, x: 0.5, y: 0.75, largeur: 0.72, debut: 1.0, inclinaison: { angle: -35, debut: 3.0 } },
          ],
        },
        {
          role: "retournement",
          kind: "compo",
          seconds: 3.2,
          camera: { mouvement: "gauche" },
          transition: { type: "glisse", seconds: 0.35 },
          fond: { type: "couleur", couleur: "principale-pale", halo: true },
          elements: [{ type: "titre", data: { texte: "Appeler chaque compagnon", mot_fort: "planning", animation: "barre-remplace", remplacement: "Le planning prévient l'équipe." }, x: 0.5, y: 0.47, largeur: 0.86, debut: 0.1 }],
        },
        {
          role: "geste",
          kind: "compo",
          seconds: 4.4,
          camera: { mouvement: "suivi", points: [{ x: 0.3, y: 0.38, debut: 1.35, echelle: 1.7 }, { x: 0.7, y: 0.52, debut: 2.15, echelle: 1.7 }, { x: 0.3, y: 0.66, debut: 2.95, echelle: 1.7 }, { x: 0.5, y: 0.5, debut: 3.9, echelle: 1 }] },
          transition: { type: "zoom", seconds: 0.45 },
          fond: { type: "telephone", couleur: "sombre-doux", halo: true, rush: 2, from: 0.3, to: 3.9, telephone: { x: 0.5, y: 0.56, hauteur: 0.7, entree: "bascule", inclinaison: 12 } },
          elements: [tag("Gros œuvre · Jules", 0.3, 0.38, 1.2, "glisse-gauche"), tag("Électricité · Loïc", 0.7, 0.52, 2.0, "glisse-droite"), tag("Finitions · Pierre", 0.3, 0.66, 2.8, "glisse-gauche")],
        },
        {
          role: "consequence",
          kind: "compo",
          seconds: 2.5,
          camera: { mouvement: "avance" },
          transition: { type: "cercle", seconds: 0.5, x: 0.5, y: 0.5 },
          fond: { type: "couleur", couleur: "accent-pale", halo: true },
          elements: [
            notification("Planning mis à jour", "Jules · Gros œuvre, chantier Les Terrasses", 0.3, 0.2, 0),
            notification("Planning mis à jour", "Loïc · Électricité, chantier Les Terrasses", 0.46, 0.5, 1),
            notification("Planning mis à jour", "Pierre · Finitions, chantier Les Terrasses", 0.62, 0.8, 2),
            { type: "etiquette", data: { texte: "Toute l'équipe prévenue" }, x: 0.5, y: 0.8, debut: 1.2, entree: "pop", mouvement: "flottement" },
          ],
        },
        {
          role: "preuve",
          kind: "compo",
          seconds: 3.2,
          camera: { mouvement: "recul" },
          transition: { type: "volet", seconds: 0.5 },
          fond: { type: "couleur", couleur: "clair", halo: true },
          elements: [
            { type: "compteur", data: { fact: 1, libelle: "" }, x: 0.5, y: 0.4, debut: 0.15 },
            { type: "titre", data: { texte: "Rejoignez-les.", mot_fort: "Rejoignez", animation: "bloc" }, x: 0.5, y: 0.78, largeur: 0.7, debut: 2.1, entree: "impact" },
          ],
        },
        { role: "fin", kind: "fin", seconds: 2.8, transition: { type: "fondu", seconds: 0.45 }, line: "Essai gratuit de 30 jours" },
      ],
    },
  },
  {
    angle: "Le vendredi vous est rendu : les compagnons pointent sur chantier, plus de carnets à recopier au bureau.",
    fonctionnalite: "pointage",
    partition: {
      base: "v1",
      shots: [
        {
          role: "accroche",
          kind: "compo",
          seconds: 3.9,
          camera: { mouvement: "suivi", points: [{ x: 0.5, y: 0.7, debut: 3.0, echelle: 1.25 }] },
          fond: { type: "couleur", couleur: "sombre", halo: true },
          elements: [
            { type: "titre", data: { texte: "Vendredi.", animation: "bloc" }, x: 0.5, y: 0.29, largeur: 0.9, debut: 0.15, entree: "impact" },
            { type: "titre", data: { texte: "Soir.", mot_fort: "Soir", animation: "bloc" }, x: 0.5, y: 0.49, largeur: 0.9, debut: 0.8, entree: "impact" },
            { type: "titre", data: { texte: "Les carnets attendent au bureau.", animation: "frappe" }, x: 0.5, y: 0.74, largeur: 0.72, debut: 1.0 },
          ],
        },
        {
          role: "retournement",
          kind: "compo",
          seconds: 3.2,
          camera: { mouvement: "droite" },
          transition: { type: "glisse", seconds: 0.35 },
          fond: { type: "couleur", couleur: "accent-pale", halo: true },
          elements: [{ type: "titre", data: { texte: "Recopier les heures", mot_fort: "pointe", animation: "barre-remplace", remplacement: "L'équipe pointe sur chantier." }, x: 0.5, y: 0.47, largeur: 0.86, debut: 0.1 }],
        },
        {
          role: "geste",
          kind: "compo",
          seconds: 4.3,
          camera: { mouvement: "suivi", points: [{ x: 0.3, y: 0.34, debut: 1.35, echelle: 1.6 }, { x: 0.7, y: 0.46, debut: 1.95, echelle: 1.6 }, { x: 0.3, y: 0.58, debut: 2.55, echelle: 1.6 }, { x: 0.5, y: 0.5, debut: 3.4, echelle: 1 }] },
          transition: { type: "zoom", seconds: 0.45 },
          fond: { type: "telephone", couleur: "sombre-doux", halo: true, rush: 1, from: 1.6, to: 4.6, telephone: { x: 0.5, y: 0.56, hauteur: 0.7, entree: "monte", inclinaison: -12 } },
          elements: [
            tag("Jules · présent", 0.3, 0.34, 1.2, "glisse-gauche"),
            tag("Antoine · présent", 0.7, 0.46, 1.8, "glisse-droite"),
            tag("Pierre · présent", 0.3, 0.58, 2.4, "glisse-gauche"),
            { type: "tap", data: {}, x: 0.5, y: 0.816, debut: 3.9 },
          ],
        },
        {
          role: "consequence",
          kind: "compo",
          seconds: 2.6,
          camera: { mouvement: "avance" },
          transition: { type: "cercle", seconds: 0.5, x: 0.5, y: 0.816 },
          fond: { type: "couleur", couleur: "principale-pale", halo: true },
          elements: [
            { type: "notification", variante: 20, data: { app: "TIM", titre: "Pointage validé", texte: "Toute l'équipe, en un geste" }, x: 0.5, y: 0.47, largeur: 0.86, debut: 0.2, entree: "impact" },
            { type: "etiquette", data: { texte: "Heures au bureau" }, x: 0.5, y: 0.76, debut: 1.2, entree: "pop", mouvement: "flottement" },
          ],
        },
        {
          role: "preuve",
          kind: "compo",
          seconds: 3.2,
          camera: { mouvement: "recul" },
          transition: { type: "volet", seconds: 0.5 },
          fond: { type: "couleur", couleur: "clair", halo: true },
          elements: [
            { type: "compteur", data: { fact: 1, libelle: "" }, x: 0.5, y: 0.4, debut: 0.15 },
            { type: "titre", data: { texte: "Rejoignez-les.", mot_fort: "Rejoignez", animation: "bloc" }, x: 0.5, y: 0.78, largeur: 0.7, debut: 2.1, entree: "impact" },
          ],
        },
        { role: "fin", kind: "fin", seconds: 2.8, transition: { type: "fondu", seconds: 0.45 }, line: "Essai gratuit de 30 jours" },
      ],
    },
  },
];

/** Le rôle d'un plan reçu, ou `undefined`. Pure. */
export const parseRole = (v: unknown): BeatRole | undefined => (BEAT_ROLES.includes(v as BeatRole) ? (v as BeatRole) : undefined);

