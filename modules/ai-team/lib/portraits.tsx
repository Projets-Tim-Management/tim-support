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

export const PORTRAITS = ["chef-sea", "stratege", "redacteur", "directeur-artistique", "controleur", "meta-ads", "google-ads", "chatgpt-ads", "mesure"] as const;
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
