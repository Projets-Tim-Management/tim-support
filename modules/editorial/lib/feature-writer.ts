/**
 * « Rédiger avec Claude » : ce que le parcours en 4 étapes envoie à Claude, et
 * ce qu'il en attend.
 *
 * Remplace l'aller-retour par Claude Desktop (copier le modèle, coller les
 * indications, recoller le JSON). Les RÈGLES de rédaction sont celles du modèle
 * d'import (featureTemplate) — mêmes flèches, même gras, même « Idéal pour » —
 * pour qu'une fiche écrite ici ressemble aux autres.
 *
 * Module pur (aucune dépendance serveur) : lu par la fenêtre ET par la route.
 */

/** Le modèle : un cran sous Opus, suffisant pour des étapes courtes (choix de Charlie, 26/10/2026). */
export const WRITER_MODEL = "claude-sonnet-5-5" as const;

/** Au plus 15 images vues par Claude, toutes vidéos confondues. */
export const MAX_FRAMES = 15;

/** Combien d'images tirer de CHAQUE vidéo : les 15 se partagent, au moins une chacune. */
export function framesPerStep(steps: number): number {
  if (steps <= 0) return 0;
  return Math.max(1, Math.floor(MAX_FRAMES / steps));
}

/** Ce que la fenêtre envoie à la route de rédaction. */
export type WriteRequest = {
  mode: "new" | "update";
  featureId?: number | string | null;
  /** Les indications de l'étape 1, en clair. */
  notes: string;
  platformIds: (number | string)[];
  categoryIds: (number | string)[];
  profiles: string[];
  /** Une étape = une vidéo (ou une image) et, au besoin, ce qu'elle montre. */
  steps: { caption: string; frames: string[] }[];
  /** Relance : la version précédente, et ce qu'il faut y changer. */
  previous?: WrittenFeature | null;
  instruction?: string;
};

/** Ce que Claude rend — le format de l'import, plus le rattachement des vidéos. */
export type WrittenFeature = {
  title: string;
  titleFeature: string;
  shortDescription: string;
  keywords: string[];
  intro: string;
  parties: {
    titre: string;
    description: string;
    mediaPosition: "droite" | "gauche";
    /** Numéro de la vidéo (à partir de 1) qui illustre cette partie, 0 si aucune. */
    video: number;
    /** Un média déjà dans la médiathèque, repris à la place d'une vidéo déposée (choix fait à la main, jamais par Claude). */
    existing?: ReusedMedia;
  }[];
};

/** Un média de la médiathèque, réduit à ce que la fenêtre affiche. */
export type ReusedMedia = { id: number | string; url?: string; filename?: string; mimeType?: string };

/** Schéma imposé à la réponse (sortie structurée) : chaque champ arrive à sa place. */
export const WRITTEN_FEATURE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "titleFeature", "shortDescription", "keywords", "intro", "parties"],
  properties: {
    title: { type: "string" },
    titleFeature: { type: "string" },
    shortDescription: { type: "string" },
    keywords: { type: "array", items: { type: "string" } },
    intro: { type: "string" },
    parties: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["titre", "description", "mediaPosition", "video"],
        properties: {
          titre: { type: "string" },
          description: { type: "string" },
          mediaPosition: { type: "string", enum: ["droite", "gauche"] },
          video: { type: "integer" },
        },
      },
    },
  },
} as const;

/**
 * Les consignes, STABLES d'un appel à l'autre (mises en cache) : rien de propre
 * à une fiche ici, ni date, ni nom.
 */
export const WRITER_SYSTEM = `Tu rédiges la documentation d'une fonctionnalité du logiciel TIM pour son centre d'aide. Les lecteurs sont des équipes du BTP (conducteurs de travaux, chefs de chantier et d'équipe, compagnons, bureau) : phrases courtes, concrètes, sans jargon.

Tu reçois des indications, et pour chaque étape quelques images tirées d'une capture vidéo de l'écran. Décris ce qu'on voit et ce qu'on fait, étape par étape. N'invente aucun bouton, menu ou chiffre que tu ne vois pas ou qu'on ne t'indique pas.

Format des textes « intro » et « description » (Markdown, \\n pour les retours à la ligne) :
- AUCUNE liste à puces ni numérotée : jamais de « - », « * » ou « 1. » en début de ligne.
- Chaque point commence par une flèche « → » et forme son propre paragraphe, séparé du suivant par une ligne vide : « Une phrase d'introduction.\\n\\n→ **Libellé** : explication.\\n\\n→ **Autre libellé** : explication. »
- Mets en **gras** le terme que le point définit, suivi de « : » puis de l'explication.
- Termine chaque description par une ligne en italique qui commence par « *Idéal pour » et dit à quoi ça sert concrètement.

Règles de contenu :
- Reste court : c'est un mode d'emploi, pas un article. Une à trois phrases par point, deux à quatre points par partie.
- Une partie par étape à suivre. « video » donne le numéro de la vidéo (à partir de 1) qui illustre la partie, 0 si aucune.
- Chaque vidéo illustre UNE SEULE partie : ne mets jamais le même numéro de vidéo sur deux parties. Rattache chaque vidéo à la partie qui correspond à sa légende (ce qu'on y fait) ; les autres parties ont 0.
- « mediaPosition » : « droite » par défaut.
- « titleFeature » vide s'il est identique à « title ».
- « keywords » : 3 à 6 mots qu'un utilisateur taperait pour trouver la fiche.
- « shortDescription » : une phrase.
- Pour une MISE À JOUR : pars de la fiche actuelle, ne change que ce que les indications ou les vidéos modifient, garde l'ordre des parties existantes et ajoute les nouvelles à la fin.

Inspire-toi du ton et de la forme des fiches d'exemple, sans en reprendre le contenu.`;

/** Le message de l'utilisateur, en texte : indications, contexte, exemples, fiche actuelle. */
export function writerBrief(args: {
  mode: "new" | "update";
  notes: string;
  platforms: string[];
  sections: string[];
  profiles: string[];
  captions: string[];
  examples: unknown[];
  current?: unknown;
  previous?: unknown;
  instruction?: string;
}): string {
  const lines = [
    args.mode === "new" ? "Nouvelle fiche à rédiger." : "Mise à jour d'une fiche existante.",
    "",
    "Indications :",
    args.notes.trim() || "(aucune — appuie-toi sur les images)",
    "",
    `Plateformes : ${args.platforms.join(", ") || "non précisé"}`,
    `Section : ${args.sections.join(", ") || "non précisée"}`,
    `Pour : ${args.profiles.join(", ") || "tous les profils"}`,
  ];
  if (args.captions.length) {
    lines.push("", "Vidéos (dans l'ordre) :");
    args.captions.forEach((c, i) => lines.push(`${i + 1}. ${c.trim() || "(sans légende)"}`));
  }
  if (args.examples.length) {
    lines.push("", "Fiches d'exemple (pour le ton et la forme) :", JSON.stringify(args.examples));
  }
  if (args.current) lines.push("", "Fiche actuelle, à mettre à jour :", JSON.stringify(args.current));
  if (args.previous && args.instruction?.trim()) {
    lines.push("", "Ta version précédente :", JSON.stringify(args.previous), "", `À changer : ${args.instruction.trim()}`);
  }
  return lines.join("\n");
}

/** Le JSON de l'import/fusion à partir de ce qu'a écrit Claude (sans le champ « video »). */
export function toImportJson(f: WrittenFeature): Record<string, unknown> {
  return {
    title: f.title,
    titleFeature: f.titleFeature,
    shortDescription: f.shortDescription,
    keywords: f.keywords,
    intro: f.intro,
    parties: f.parties.map(({ titre, description, mediaPosition }) => ({ titre, description, mediaPosition })),
  };
}

/** Une partie de fiche telle qu'elle vit en base. */
export type Part = Record<string, unknown> & { mediaDoc?: Record<string, unknown>[] };

/**
 * Pose la vidéo d'une partie : remplace le premier bloc « Image / GIF / vidéo »
 * s'il y en a un, sinon l'ajoute en tête des médias de la partie.
 */
export function attachMedia(parts: Part[], media: { part: number; mediaId: number | string }[]): Part[] {
  const out = parts.map((p) => ({ ...p, mediaDoc: Array.isArray(p.mediaDoc) ? [...p.mediaDoc] : [] }));
  for (const { part, mediaId } of media) {
    const p = out[part];
    if (!p) continue;
    const i = p.mediaDoc!.findIndex((b) => b.blockType === "img");
    if (i >= 0) p.mediaDoc![i] = { ...p.mediaDoc![i], image: mediaId };
    else p.mediaDoc!.unshift({ blockType: "img", image: mediaId });
  }
  return out;
}


/**
 * Une vidéo n'illustre qu'UNE partie : si elle est rattachée à plusieurs, seule
 * la première la garde, les suivantes passent à « aucune vidéo ». Un numéro qui
 * ne correspond à aucune vidéo déposée est retiré aussi.
 *
 * Filet de sécurité derrière la consigne donnée à Claude : la même capture
 * répétée sur chaque étape d'une fiche n'apprend rien au lecteur.
 */
export function oneVideoPerPart<P extends { video: number }>(parties: P[], videoCount: number): P[] {
  const used = new Set<number>();
  return parties.map((p) => {
    const n = Number.isInteger(p.video) && p.video > 0 && p.video <= videoCount && !used.has(p.video) ? p.video : 0;
    if (n) used.add(n);
    return n === p.video ? p : { ...p, video: n };
  });
}

/**
 * Rattache la vidéo `n` à la partie `part` — en la retirant de celle qui l'avait. `n = 0` : aucune vidéo.
 * Une vidéo déposée remplace le média repris de la médiathèque sur cette partie.
 */
export function assignVideo<P extends { video: number; existing?: ReusedMedia }>(parties: P[], part: number, n: number): P[] {
  return parties.map((p, i) => {
    if (i === part) return { ...p, video: n, existing: n > 0 ? undefined : p.existing };
    if (n > 0 && p.video === n) return { ...p, video: 0 };
    return p;
  });
}

/**
 * Reprend un média de la médiathèque sur la partie `part` (ou le retire, `null`).
 * Il prend la place de la vidéo déposée qui s'y trouvait : une partie, un visuel.
 */
export function reuseMedia<P extends { video: number; existing?: ReusedMedia }>(
  parties: P[],
  part: number,
  media: ReusedMedia | null,
): P[] {
  return parties.map((p, i) => (i === part ? { ...p, video: media ? 0 : p.video, existing: media ?? undefined } : p));
}

/**
 * Après une réécriture par Claude, les médias repris restent sur leur partie
 * (rapprochées par rang) : Claude ne les voit pas, il ne peut pas les déplacer.
 */
export function keepReused<P extends { video: number; existing?: ReusedMedia }>(next: P[], prev: P[]): P[] {
  return next.map((p, i) => (prev[i]?.existing ? { ...p, video: 0, existing: prev[i].existing } : p));
}

/** La fiche telle qu'on la renvoie à Claude : sans les médias repris, qu'il n'a pas à connaître. */
export function withoutReused(f: WrittenFeature): WrittenFeature {
  return { ...f, parties: f.parties.map((p) => {
    const rest = { ...p };
    delete rest.existing;
    return rest;
  }) };
}
