import type { ReactElement } from "react";

/**
 * Les visages de l'équipe d'agents IA — des portraits ILLUSTRÉS en aplats
 * (style « avatar vectoriel » : cheveux, yeux soulignés avec reflets, joues,
 * lèvres), un même gabarit pour tous. Chaque personne a son physique (coiffure,
 * teint, yeux) et garde la touche de son métier : un accessoire et la couleur
 * de son vêtement.
 *
 * Couleurs : le fond et le vêtement viennent des jetons de la charte (ils
 * suivent le thème) ; la peau, les cheveux et les yeux sont des couleurs
 * d'illustration, fixes par nature.
 *
 * Server-safe : de simples fonctions qui rendent un <svg>.
 */

export const PORTRAITS = ["chef-sea", "stratege", "redacteur", "directeur-artistique", "controleur", "meta-ads", "google-ads", "chatgpt-ads", "mesure", "chef-seo", "seo-analyste", "seo-concurrence", "seo-contenu", "seo-visibilite-ia", "seo-technique", "seo-autorite", "seo-reseaux"] as const;
export type PortraitKey = (typeof PORTRAITS)[number];

export const PORTRAIT_LABELS: Record<PortraitKey, string> = {
  "chef-sea": "Cheffe — carré brun ondulé, casque-micro",
  stratege: "Stratège — cheveux courts, lunettes",
  redacteur: "Rédactrice — longs cheveux roux, plume",
  "directeur-artistique": "Directeur artistique — barbe, béret",
  controleur: "Contrôleuse — cheveux bouclés, loupe",
  "meta-ads": "Cheffe Meta Ads — chignon blond, cible",
  "google-ads": "Chef Google Ads — cheveux noirs, clé des mots-clés",
  "chatgpt-ads": "Cheffe ChatGPT Ads — carré lisse, bulle de dialogue",
  mesure: "Mesure & data — cheveux bouclés courts, graphique",
  "chef-seo": "Chef SEO & GEO — cheveux en arrière, casque-micro, loupe",
  "seo-analyste": "Analyste de bout en bout — queue-de-cheval, entonnoir",
  "seo-concurrence": "Concurrence — cheveux courts en brosse, jumelles",
  "seo-contenu": "Contenu — carré frangé, pile de pages",
  "seo-visibilite-ia": "Visibilité IA — cheveux poivre et sel ondulés, étincelle",
  "seo-technique": "Technique — crâne rasé, barbe courte, clé à molette",
  "seo-autorite": "Autorité — longs cheveux ondulés, maillons de chaîne",
  "seo-reseaux": "Réseaux & vidéo — coupe courte à mèche, bouton lecture",
};

type Look = {
  /** Fond et vêtement : jetons de la charte. */
  main: string;
  bg: string;
  skin: string;
  skinShade: string;
  hair: string;
  hairDark: string;
  iris: string;
  lips: string;
  /** Lèvres dessinées (vrai) ou simple sourire (faux). */
  lipstick: boolean;
  freckles: boolean;
  /** Un trait d'eye-liner prolongé au coin de l'œil. */
  liner: boolean;
};

const LOOKS: Record<PortraitKey, Look> = {
  "chef-sea": { main: "var(--tim-primary)", bg: "var(--tim-primary-light)", skin: "#f0b494", skinShade: "#e08766", hair: "#4a3a36", hairDark: "#2a1f1c", iris: "#8b3b26", lips: "#d4453a", lipstick: true, freckles: true, liner: true },
  stratege: { main: "var(--tim-indigo)", bg: "var(--tim-indigo-bg)", skin: "#f3c7a6", skinShade: "#dc9a78", hair: "#6b4a32", hairDark: "#3e2a1c", iris: "#4f6b8a", lips: "#c7765f", lipstick: false, freckles: false, liner: false },
  redacteur: { main: "var(--tim-teal)", bg: "var(--tim-teal-bg)", skin: "#f6cfb3", skinShade: "#e3a07f", hair: "#b5532f", hairDark: "#7c3518", iris: "#3f7a52", lips: "#cf5b4f", lipstick: true, freckles: true, liner: true },
  "directeur-artistique": { main: "var(--tim-amber)", bg: "var(--tim-amber-bg)", skin: "#a8704c", skinShade: "#875337", hair: "#231a16", hairDark: "#140e0b", iris: "#3b2416", lips: "#8a4a35", lipstick: false, freckles: false, liner: false },
  controleur: { main: "var(--tim-green)", bg: "var(--tim-green-bg)", skin: "#c88d64", skinShade: "#a86d48", hair: "#2b1d17", hairDark: "#1a110d", iris: "#4a2c1a", lips: "#b8534a", lipstick: true, freckles: false, liner: true },
  "meta-ads": { main: "var(--tim-blue)", bg: "var(--tim-blue-bg)", skin: "#f5c9a8", skinShade: "#e09a76", hair: "#d9b26a", hairDark: "#a8823f", iris: "#5b7fa3", lips: "#d0605a", lipstick: true, freckles: false, liner: true },
  "google-ads": { main: "var(--tim-sky)", bg: "var(--tim-sky-bg)", skin: "#e8b48e", skinShade: "#c98a62", hair: "#1f1a18", hairDark: "#0f0c0b", iris: "#3b2a1f", lips: "#b9725c", lipstick: false, freckles: false, liner: false },
  "chatgpt-ads": { main: "var(--tim-purple)", bg: "var(--tim-purple-bg)", skin: "#dba27b", skinShade: "#bb7d57", hair: "#2a1e1a", hairDark: "#160f0d", iris: "#4b3020", lips: "#b5434a", lipstick: true, freckles: false, liner: true },
  mesure: { main: "var(--tim-slate)", bg: "var(--tim-slate-bg)", skin: "#9c6646", skinShade: "#7d4c31", hair: "#2a1c15", hairDark: "#18100c", iris: "#2f1d12", lips: "#8a4a35", lipstick: false, freckles: false, liner: false },
  "seo-contenu": { main: "var(--tim-teal)", bg: "var(--tim-teal-bg)", skin: "#e9b896", skinShade: "#cf9270", hair: "#7a4a2a", hairDark: "#4f2e18", iris: "#5b4630", lips: "#c4615a", lipstick: true, freckles: false, liner: true },
  "seo-concurrence": { main: "var(--tim-gray)", bg: "var(--tim-gray-bg)", skin: "#d9a07a", skinShade: "#b97d58", hair: "#2b211c", hairDark: "#17110e", iris: "#3a2a1e", lips: "#a8644f", lipstick: false, freckles: false, liner: false },
  "seo-analyste": { main: "var(--tim-red)", bg: "var(--tim-red-bg)", skin: "#f2c6a4", skinShade: "#dc9a78", hair: "#3b2a22", hairDark: "#231812", iris: "#4a6b8a", lips: "#c75a52", lipstick: true, freckles: true, liner: false },
  "seo-autorite": { main: "var(--tim-amber)", bg: "var(--tim-amber-bg)", skin: "#f1c3a1", skinShade: "#d9977a", hair: "#a0662e", hairDark: "#6e4219", iris: "#3f6b4f", lips: "#c95f57", lipstick: true, freckles: false, liner: true },
  "seo-reseaux": { main: "var(--tim-purple)", bg: "var(--tim-purple-bg)", skin: "#c58c66", skinShade: "#a56c48", hair: "#1e1714", hairDark: "#0f0b09", iris: "#3a2618", lips: "#b5525a", lipstick: true, freckles: false, liner: true },
  "seo-technique": { main: "var(--tim-green)", bg: "var(--tim-green-bg)", skin: "#b07a55", skinShade: "#8f5d3c", hair: "#2a201b", hairDark: "#17110e", iris: "#3b2a1e", lips: "#94523f", lipstick: false, freckles: false, liner: false },
  "seo-visibilite-ia": { main: "var(--tim-indigo)", bg: "var(--tim-indigo-bg)", skin: "#e3ad88", skinShade: "#c48a64", hair: "#8a8580", hairDark: "#5c5854", iris: "#3d5a73", lips: "#b06a58", lipstick: false, freckles: false, liner: false },
  "chef-seo": { main: "var(--tim-rose)", bg: "var(--tim-rose-bg)", skin: "#efbf9c", skinShade: "#d4936d", hair: "#5a3b26", hairDark: "#3a2416", iris: "#3f6b4f", lips: "#b8705a", lipstick: false, freckles: false, liner: false },
};

const INK = "#1d1715";
const WHITE = "#ffffff";
const METAL = "#2f2b2a";

/* ─── Coiffures : l'arrière (sous le visage) et le devant (par-dessus) ───── */

type Hair = { back?: (l: Look) => ReactElement; front: (l: Look) => ReactElement };

const HAIR: Partial<Record<PortraitKey, Hair>> & Record<"chef-sea" | "stratege" | "redacteur" | "directeur-artistique" | "controleur", Hair> = {
  // Carré brun ondulé, mèche balayée sur le côté.
  "chef-sea": {
    back: (l) => <path d="M27 60 C22 34 38 14 61 14 C85 14 99 34 93 60 C96 72 89 82 80 80 L42 80 C32 83 24 73 27 60 Z" fill={l.hairDark} />,
    front: (l) => (
      <g>
        <path d="M35 50 C34 29 47 19 62 19 C78 19 88 30 86 48 C83 40 77 35 69 33 C64 42 50 50 35 50 Z" fill={l.hair} />
        <path d="M86 48 C88 58 86 66 81 72 C83 62 80 54 76 48 Z" fill={l.hair} />
        <path d="M47 27 C54 22 64 21 72 25 M58 33 C52 40 45 44 39 46" fill="none" stroke={l.hairDark} strokeWidth="1.1" strokeLinecap="round" />
      </g>
    ),
  },
  // Cheveux courts, une petite houppe.
  stratege: {
    front: (l) => (
      <g>
        <path d="M35 47 C33 28 45 17 61 17 C77 17 88 28 85 47 C82 37 74 31 64 31 C58 26 50 26 45 30 C40 34 37 40 35 47 Z" fill={l.hair} />
        <path d="M50 22 C56 18 66 18 72 22" fill="none" stroke={l.hairDark} strokeWidth="1.1" strokeLinecap="round" />
      </g>
    ),
  },
  // Longs cheveux roux, raie au milieu, qui tombent sur les épaules.
  redacteur: {
    back: (l) => <path d="M29 52 C27 28 42 15 60 15 C78 15 93 28 91 52 L95 100 L25 100 Z" fill={l.hairDark} />,
    front: (l) => (
      <g>
        <path d="M35 50 C35 30 46 19 60 19 C74 19 85 30 85 50 C82 38 72 29 61 27 C61 33 58 40 52 44 C46 47 40 48 35 50 Z" fill={l.hair} />
        <path d="M85 50 C87 62 88 74 86 86 L80 86 C82 72 81 60 78 52 Z" fill={l.hair} />
        <path d="M35 50 C33 62 32 74 34 86 L40 86 C38 72 39 60 42 52 Z" fill={l.hair} />
        <path d="M61 22 C61 27 60 31 58 35" fill="none" stroke={l.hairDark} strokeWidth="1.1" strokeLinecap="round" />
      </g>
    ),
  },
  // Cheveux très courts, presque rasés (le béret les couvre).
  "directeur-artistique": {
    front: (l) => <path d="M36 46 C35 32 45 24 60 24 C75 24 85 32 84 46 C80 38 72 34 60 34 C48 34 40 38 36 46 Z" fill={l.hair} />,
  },
  // Cheveux bouclés en volume.
  controleur: {
    back: (l) => (
      <g fill={l.hairDark}>
        <circle cx="40" cy="30" r="14" />
        <circle cx="60" cy="21" r="16" />
        <circle cx="80" cy="30" r="14" />
        <circle cx="33" cy="49" r="12" />
        <circle cx="87" cy="49" r="12" />
        <circle cx="34" cy="66" r="10" />
        <circle cx="86" cy="66" r="10" />
      </g>
    ),
    front: (l) => (
      <g fill={l.hair}>
        <circle cx="45" cy="31" r="7" />
        <circle cx="54" cy="26" r="7.5" />
        <circle cx="64" cy="26" r="7.5" />
        <circle cx="73" cy="30" r="7" />
        <circle cx="39" cy="38" r="5.5" />
        <circle cx="80" cy="37" r="5.5" />
      </g>
    ),
  },
};

/* Coiffures des chefs de canal et de la mesure */
Object.assign(HAIR, {
  // Chignon blond haut, mèches dégagées.
  "meta-ads": {
    front: (l: Look) => (
      <g>
        <circle cx="60" cy="16" r="9.5" fill={l.hair} />
        <path d="M35 49 C34 30 46 20 60 20 C74 20 86 30 85 49 C81 38 72 31 60 30 C48 31 39 38 35 49 Z" fill={l.hair} />
        <path d="M50 22 C55 19 65 19 70 22" fill="none" stroke={l.hairDark} strokeWidth="1.1" strokeLinecap="round" />
      </g>
    ),
  },
  // Cheveux noirs courts, coiffés sur le côté.
  "google-ads": {
    front: (l: Look) => (
      <g>
        <path d="M35 46 C33 27 46 17 62 18 C77 19 87 29 85 45 C80 35 70 30 56 31 C48 32 40 37 35 46 Z" fill={l.hair} />
        <path d="M40 34 C48 26 60 23 72 25" fill="none" stroke={l.hairDark} strokeWidth="1.2" strokeLinecap="round" />
      </g>
    ),
  },
  // Carré lisse brun, raie sur le côté.
  "chatgpt-ads": {
    back: (l: Look) => <path d="M29 52 C27 28 42 16 60 16 C78 16 93 28 91 52 L92 82 L28 82 Z" fill={l.hairDark} />,
    front: (l: Look) => (
      <g>
        <path d="M35 50 C35 30 46 19 60 19 C74 19 85 30 85 50 C82 38 74 30 52 28 C47 36 42 43 35 50 Z" fill={l.hair} />
        <path d="M85 50 C87 60 87 70 85 80 L80 80 C82 70 81 60 78 52 Z" fill={l.hair} />
        <path d="M35 50 C33 60 33 70 35 80 L40 80 C38 70 39 60 42 52 Z" fill={l.hair} />
      </g>
    ),
  },
  // Cheveux châtains coiffés en arrière, un peu de volume sur le dessus.
  "chef-seo": {
    front: (l: Look) => (
      <g>
        <path d="M35 47 C33 27 46 16 62 16 C78 16 88 27 85 46 C82 36 76 30 66 28 C58 27 48 29 42 34 C38 38 36 42 35 47 Z" fill={l.hair} />
        <path d="M46 25 C54 20 66 19 75 23 M48 30 C56 25 66 24 74 27" fill="none" stroke={l.hairDark} strokeWidth="1.1" strokeLinecap="round" />
      </g>
    ),
  },
  // Longs cheveux ondulés, raie sur le côté.
  "seo-autorite": {
    back: (l: Look) => <path d="M28 52 C24 28 42 15 60 15 C80 15 96 28 92 52 C95 64 92 76 88 84 L32 84 C28 76 25 64 28 52 Z" fill={l.hairDark} />,
    front: (l: Look) => (
      <g>
        <path d="M34 50 C32 30 44 18 58 18 C74 17 88 28 86 50 C82 38 74 30 64 28 C56 34 44 38 34 50 Z" fill={l.hair} />
        <path d="M86 50 C90 60 88 72 84 82 L79 82 C83 72 83 60 80 52 Z M34 50 C30 60 32 72 36 82 L41 82 C37 72 37 60 40 52 Z" fill={l.hair} />
      </g>
    ),
  },
  // Crâne rasé (une ombre de cheveux) et une barbe courte.
  // Coupe courte à la garçonne, une longue mèche sur le côté.
  "seo-reseaux": {
    front: (l: Look) => (
      <g>
        <path d="M35 48 C33 28 46 17 61 17 C77 17 88 28 85 46 C83 38 79 33 73 30 C66 36 54 40 42 40 C39 42 37 45 35 48 Z" fill={l.hair} />
        <path d="M73 30 C78 36 82 42 85 46" fill="none" stroke={l.hairDark} strokeWidth="1.2" strokeLinecap="round" />
      </g>
    ),
  },
  "seo-technique": {
    front: (l: Look) => (
      <g>
        <path d="M37 42 C37 28 47 20 60 20 C73 20 83 28 83 42 C79 33 71 29 60 29 C49 29 41 33 37 42 Z" fill={l.hair} opacity="0.55" />
        <path d="M40 62 C41 76 50 84 60 84 C70 84 79 76 80 62 C76 70 69 74 60 74 C51 74 44 70 40 62 Z" fill={l.hair} />
      </g>
    ),
  },
  // Cheveux poivre et sel, courts et ondulés sur le dessus.
  "seo-visibilite-ia": {
    front: (l: Look) => (
      <g>
        <path d="M35 46 C33 29 45 18 60 18 C75 18 87 29 85 46 C83 39 79 34 73 32 C69 35 64 33 60 30 C56 33 51 35 46 32 C41 35 37 40 35 46 Z" fill={l.hair} />
        <path d="M44 26 C48 23 52 24 55 27 M58 23 C62 21 66 22 69 25 M70 27 C74 26 77 28 79 31" fill="none" stroke={l.hairDark} strokeWidth="1.2" strokeLinecap="round" />
      </g>
    ),
  },
  // Carré court avec une frange droite.
  "seo-contenu": {
    back: (l: Look) => <path d="M30 50 C28 28 43 16 60 16 C77 16 92 28 90 50 L90 74 L30 74 Z" fill={l.hairDark} />,
    front: (l: Look) => (
      <g>
        <path d="M35 46 C34 28 46 19 60 19 C74 19 86 28 85 46 L85 44 C79 41 70 40 60 40 C50 40 41 41 35 44 Z" fill={l.hair} />
        <path d="M85 46 C87 56 87 66 85 74 L80 74 C82 66 81 56 79 48 Z M35 46 C33 56 33 66 35 74 L40 74 C38 66 39 56 41 48 Z" fill={l.hair} />
      </g>
    ),
  },
  // Cheveux courts en brosse.
  "seo-concurrence": {
    front: (l: Look) => <path d="M36 44 C35 30 45 21 60 21 C75 21 85 30 84 44 C80 36 72 31 60 31 C48 31 40 36 36 44 Z M44 24 v-3 M50 22 v-3.5 M56 21 v-4 M62 21 v-4 M68 22 v-3.5 M74 24 v-3" fill={l.hair} stroke={l.hair} strokeWidth="2.4" strokeLinecap="round" />,
  },
  // Queue-de-cheval haute, frange dégagée.
  "seo-analyste": {
    back: (l: Look) => <path d="M78 22 C96 24 100 44 94 66 C92 74 86 78 82 74 C88 60 88 40 76 30 Z" fill={l.hairDark} />,
    front: (l: Look) => (
      <g>
        <path d="M35 48 C34 29 46 18 61 18 C76 18 87 29 85 48 C81 37 73 31 62 30 C51 30 41 36 35 48 Z" fill={l.hair} />
        <path d="M48 23 C55 19 66 19 73 23" fill="none" stroke={l.hairDark} strokeWidth="1.1" strokeLinecap="round" />
      </g>
    ),
  },
  // Cheveux bouclés courts.
  mesure: {
    front: (l: Look) => (
      <g fill={l.hair}>
        <circle cx="44" cy="31" r="6" />
        <circle cx="52" cy="26" r="6.5" />
        <circle cx="61" cy="24" r="6.5" />
        <circle cx="70" cy="26" r="6.5" />
        <circle cx="77" cy="31" r="6" />
        <circle cx="39" cy="38" r="4.5" />
        <circle cx="81" cy="38" r="4.5" />
      </g>
    ),
  },
} satisfies Partial<Record<PortraitKey, Hair>>);

/* ─── Les touches de métier ──────────────────────────────────────────────── */

const ACCESSORY: Record<PortraitKey, (l: Look) => ReactElement> = {
  // Meta Ads : une cible — viser la bonne audience.
  "meta-ads": (l) => (
    <g>
      <circle cx="80" cy="104" r="8" fill={WHITE} />
      <circle cx="80" cy="104" r="5" fill="none" stroke={l.main} strokeWidth="1.8" />
      <circle cx="80" cy="104" r="1.8" fill={l.main} />
    </g>
  ),
  // Google Ads : une clé — les mots-clés.
  "google-ads": () => (
    <g>
      <circle cx="75" cy="103" r="4.5" fill="none" stroke={WHITE} strokeWidth="2.6" />
      <path d="M79.5 103 H89 M85 103 v3.5 M88 103 v2.5" fill="none" stroke={WHITE} strokeWidth="2.6" strokeLinecap="round" />
    </g>
  ),
  // ChatGPT Ads : une bulle de dialogue — être là où l'on pose des questions.
  "chatgpt-ads": (l) => (
    <g>
      <path d="M71 97 h18 a3 3 0 0 1 3 3 v8 a3 3 0 0 1 -3 3 h-10 l-5 4 v-4 h-3 a3 3 0 0 1 -3 -3 v-8 a3 3 0 0 1 3 -3 z" fill={WHITE} />
      <circle cx="76" cy="104" r="1.3" fill={l.main} />
      <circle cx="80" cy="104" r="1.3" fill={l.main} />
      <circle cx="84" cy="104" r="1.3" fill={l.main} />
    </g>
  ),
  // Mesure & data : un graphique en secteurs — ce qui revient à chaque canal.
  mesure: (l) => (
    <g>
      <circle cx="80" cy="104" r="8" fill={WHITE} />
      <path d="M80 104 V96 A8 8 0 0 1 87.6 106.5 Z" fill={l.main} />
    </g>
  ),
  // La cheffe : un casque-micro (elle coordonne, elle parle à la direction) et une étoile.
  "chef-sea": (l) => (
    <g>
      <path d="M29 56 Q28 11 60 11 Q92 11 91 56" fill="none" stroke={METAL} strokeWidth="3.5" strokeLinecap="round" />
      <rect x="24" y="49" width="10" height="16" rx="4.5" fill={l.main} />
      <rect x="86" y="49" width="10" height="16" rx="4.5" fill={l.main} />
      <path d="M29 64 Q31 76 47 77" fill="none" stroke={METAL} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="49" cy="77" r="3" fill={METAL} />
      <path d="M80 99 l2.4 4.9 5.4 .8 -3.9 3.8 .9 5.4 -4.8-2.5 -4.8 2.5 .9-5.4 -3.9-3.8 5.4-.8z" fill={WHITE} />
    </g>
  ),
  // L'autorité : deux maillons de chaîne — les liens que d'autres sites font vers TIM.
  "seo-autorite": () => (
    <g fill="none" stroke={WHITE} strokeWidth="2.6">
      <rect x="70" y="100" width="12" height="7" rx="3.5" transform="rotate(-35 76 103.5)" />
      <rect x="78" y="105" width="12" height="7" rx="3.5" transform="rotate(-35 84 108.5)" />
    </g>
  ),
  // La technique : une clé à molette — réparer ce qui bloque.
  // Les réseaux et la vidéo : un bouton lecture.
  "seo-reseaux": (l) => (
    <g>
      <rect x="70" y="98" width="20" height="14" rx="4" fill={WHITE} />
      <path d="M77.5 101.5 L84.5 105 L77.5 108.5 Z" fill={l.main} />
    </g>
  ),
  "seo-technique": () => (
    <g>
      <path d="M74 112 L85 101" stroke={WHITE} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M83 96 a5.5 5.5 0 1 0 6 6 l-3.2 -0.4 -2.4 -2.4 z" fill={WHITE} />
    </g>
  ),
  // La visibilité dans les IA : une étincelle — ce que les IA font apparaître.
  "seo-visibilite-ia": () => (
    <g>
      <path d="M80 96 C81 102 83 104 89 105 C83 106 81 108 80 114 C79 108 77 106 71 105 C77 104 79 102 80 96 Z" fill={WHITE} />
      <path d="M90 96 C90.4 98 91 98.6 93 99 C91 99.4 90.4 100 90 102 C89.6 100 89 99.4 87 99 C89 98.6 89.6 98 90 96 Z" fill={WHITE} />
    </g>
  ),
  // Le contenu : une pile de pages.
  "seo-contenu": () => (
    <g>
      <rect x="73" y="99" width="15" height="13" rx="1.5" fill={WHITE} />
      <rect x="71" y="97" width="15" height="13" rx="1.5" fill={WHITE} stroke={METAL} strokeWidth="1" />
      <path d="M74 101 h9 M74 104 h9 M74 107 h6" stroke={METAL} strokeWidth="1.2" strokeLinecap="round" />
    </g>
  ),
  // La concurrence : des jumelles — guetter ce que font les autres.
  "seo-concurrence": () => (
    <g>
      <circle cx="75" cy="105" r="5.5" fill={WHITE} />
      <circle cx="86" cy="105" r="5.5" fill={WHITE} />
      <rect x="78" y="100" width="5" height="4" rx="1" fill={WHITE} />
      <circle cx="75" cy="105" r="2.4" fill={METAL} />
      <circle cx="86" cy="105" r="2.4" fill={METAL} />
    </g>
  ),
  // L'analyste de bout en bout : un entonnoir — des visites jusqu'au client.
  "seo-analyste": () => (
    <g>
      <path d="M71 97 H89 L82 105 V112 L78 114 V105 Z" fill={WHITE} />
    </g>
  ),
  // Le chef SEO & GEO : un casque-micro (il parle à la direction) et une loupe — chercher, être trouvé.
  "chef-seo": (l) => (
    <g>
      <path d="M29 56 Q28 11 60 11 Q92 11 91 56" fill="none" stroke={METAL} strokeWidth="3.5" strokeLinecap="round" />
      <rect x="24" y="49" width="10" height="16" rx="4.5" fill={l.main} />
      <rect x="86" y="49" width="10" height="16" rx="4.5" fill={l.main} />
      <path d="M29 64 Q31 76 47 77" fill="none" stroke={METAL} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="49" cy="77" r="3" fill={METAL} />
      <circle cx="78" cy="103" r="5.5" fill="none" stroke={WHITE} strokeWidth="2.6" />
      <path d="M82 107 L87 112" stroke={WHITE} strokeWidth="3" strokeLinecap="round" />
    </g>
  ),
  // Le stratège : des lunettes, et une courbe qui monte sur le pull.
  stratege: () => (
    <g>
      <rect x="40" y="48" width="19" height="14" rx="5.5" fill="none" stroke={METAL} strokeWidth="2" />
      <rect x="61" y="48" width="19" height="14" rx="5.5" fill="none" stroke={METAL} strokeWidth="2" />
      <path d="M59 53.5 h2 M40 52.5 l-4.5 -2 M80 52.5 l4.5 -2" stroke={METAL} strokeWidth="2" strokeLinecap="round" />
      <path d="M72 110 l5 -5 l4 3 l7 -8" fill="none" stroke={WHITE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ),
  // La rédactrice : une plume glissée derrière l'oreille, des lignes de texte.
  redacteur: () => (
    <g>
      <path d="M90 30 L98 56 L94.5 57.2 L86.5 31.2 Z" fill={METAL} />
      <path d="M98 56 L98.6 62 L94.5 57.2 Z" fill={METAL} />
      <path d="M72 102 h16 M72 108 h11" stroke={WHITE} strokeWidth="3" strokeLinecap="round" />
    </g>
  ),
  // Le directeur artistique : un béret, une palette.
  "directeur-artistique": (l) => (
    <g>
      <path d="M30 34 Q34 12 62 13 Q90 14 91 30 Q74 22 30 34 Z" fill={METAL} />
      <circle cx="63" cy="11" r="3" fill={METAL} />
      <ellipse cx="80" cy="105" rx="10" ry="7" fill={WHITE} />
      <circle cx="76" cy="104" r="2" fill={l.main} />
      <circle cx="81" cy="102" r="2" fill={INK} />
      <circle cx="85" cy="106" r="2" fill={l.main} />
    </g>
  ),
  // La contrôleuse : une loupe à la main, une coche.
  controleur: () => (
    <g>
      <circle cx="95" cy="80" r="8.5" fill="rgba(255,255,255,.35)" stroke={METAL} strokeWidth="2.8" />
      <path d="M101 86 L108 93" stroke={METAL} strokeWidth="4" strokeLinecap="round" />
      <path d="M72 104 l5 5 l10 -11" fill="none" stroke={WHITE} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ),
};

/** Un œil : blanc en amande, iris, pupille, deux reflets, cil supérieur. */
function Eye({ cx, look, flip }: { cx: number; look: Look; flip?: boolean }) {
  const s = flip ? -1 : 1;
  return (
    <g transform={`translate(${cx} 55) scale(${s} 1)`}>
      <path d="M-7.5 0 Q-1 -7.5 7.5 -0.5 Q1 5.5 -7.5 0 Z" fill={WHITE} />
      <circle cx="0" cy="-0.8" r="4.3" fill={look.iris} />
      <circle cx="0" cy="-0.8" r="2.7" fill={INK} />
      <circle cx="1.3" cy="-2.3" r="1.3" fill={WHITE} />
      <circle cx="-1.3" cy="0.5" r="0.6" fill={WHITE} />
      {/* Cil supérieur ; l'eye-liner s'étire vers l'EXTÉRIEUR (x positif ici, côté tempe). */}
      <path d={look.liner ? "M-8 0.4 Q-1 -8.4 8 -0.8 L10.2 -2.6" : "M-7.8 0.3 Q-1 -8 7.8 -0.3"} fill="none" stroke={INK} strokeWidth={look.liner ? 2.1 : 1.6} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

export function Portrait({ portrait, size = 48, title }: { portrait: string | null | undefined; size?: number; title?: string }) {
  const key = (PORTRAITS as readonly string[]).includes(portrait ?? "") ? (portrait as PortraitKey) : "stratege";
  const l = LOOKS[key];
  const hair = HAIR[key]!;
  return (
    <svg className="ait-portrait" width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={title ?? PORTRAIT_LABELS[key]}>
      <defs>
        <clipPath id={`ait-clip-${key}`}>
          <circle cx="60" cy="60" r="60" />
        </clipPath>
      </defs>
      <g clipPath={`url(#ait-clip-${key})`}>
        <circle cx="60" cy="60" r="60" fill={l.bg} />
        {hair.back?.(l)}
        {/* Cou et vêtement */}
        <rect x="52" y="72" width="16" height="20" fill={l.skinShade} />
        <path d="M14 122 C18 97 38 89 60 89 C82 89 102 97 106 122 Z" fill={l.main} />
        <path d="M51 89 L60 99 L69 89 Z" fill={l.skin} />
        {/* Oreilles et visage */}
        <ellipse cx="36" cy="58" rx="4.5" ry="7" fill={l.skin} />
        <ellipse cx="84" cy="58" rx="4.5" ry="7" fill={l.skin} />
        <path d="M36 50 C36 30 46 22 60 22 C74 22 84 30 84 50 C84 68 74 82 60 82 C46 82 36 68 36 50 Z" fill={l.skin} />
        {/* Barbe du directeur artistique, sous les traits */}
        {key === "directeur-artistique" && <path d="M38 62 C40 77 49 84 60 84 C71 84 80 77 82 62 C78 71 72 74 60 74 C48 74 42 71 38 62 Z" fill={l.hair} />}
        {/* Sourcils */}
        <path d="M42 45.5 Q48.5 40.8 56 43.6 L55.6 45 Q48.5 43.2 42.6 46.8 Z" fill={l.hairDark} />
        <path d="M78 45.5 Q71.5 40.8 64 43.6 L64.4 45 Q71.5 43.2 77.4 46.8 Z" fill={l.hairDark} />
        <Eye cx={49.5} look={l} flip />
        <Eye cx={70.5} look={l} />
        {/* Joues et taches de rousseur */}
        <ellipse cx="44.5" cy="65" rx="4.5" ry="2.8" fill={l.skinShade} opacity="0.35" />
        <ellipse cx="75.5" cy="65" rx="4.5" ry="2.8" fill={l.skinShade} opacity="0.35" />
        {l.freckles && (
          <g fill={l.skinShade} opacity="0.8">
            {[
              [42.5, 62.5],
              [45.5, 64],
              [48.5, 62.5],
              [44, 66],
              [71.5, 62.5],
              [74.5, 64],
              [77.5, 62.5],
              [76, 66],
            ].map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="0.7" />
            ))}
          </g>
        )}
        {/* Nez */}
        <path d="M60.5 55 C59.5 60 58 62.5 57.5 64 C59 65.6 61.5 65.6 63 64" fill="none" stroke={l.skinShade} strokeWidth="1.3" strokeLinecap="round" />
        {/* Bouche */}
        {l.lipstick ? (
          <g>
            <path d="M53.5 70.5 Q57 68.6 60 69.8 Q63 68.6 66.5 70.5 Q60 76 53.5 70.5 Z" fill={l.lips} />
            <path d="M53.5 70.5 Q60 72.4 66.5 70.5" fill="none" stroke={INK} strokeOpacity="0.35" strokeWidth="0.7" />
          </g>
        ) : (
          <path d="M54.5 70 Q60 74.5 65.5 70" fill="none" stroke={key === "directeur-artistique" ? "#c98a6e" : l.lips} strokeWidth="2" strokeLinecap="round" />
        )}
        {hair.front(l)}
        {ACCESSORY[key](l)}
      </g>
    </svg>
  );
}
