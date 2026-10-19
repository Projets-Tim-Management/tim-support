import { baseV1Text } from "@/modules/ads/lib/design-brief/base-v1";
import { FORMATS, safeBox, type FormatKey } from "@/modules/ads/lib/meta-specs";

/**
 * Le prompt Claude Design d'une créa (plan Publicité, 19/10/2026).
 *
 * L'agent fournit l'INTENTION — la nature, les formats, la durée, pourquoi cet
 * angle face aux concurrents, le scénario, les rushes à joindre. Le serveur
 * assemble le reste à l'identique d'une pub à l'autre : les textes passés aux
 * garde-fous, les règles de la Base V1, le kit de marque, les zones sûres de
 * Meta et les noms de fichiers attendus (que l'import sait relire). Ce qui ne
 * dépend pas du modèle n'est jamais laissé au modèle. Pure.
 */

export type DesignKit = {
  palette: { primary: string; accent: string; darkBg: string; lightBg: string; textOnDark: string; textOnLight: string };
  titleFont: string;
  bodyFont: string;
  titleCase?: string | null;
  /** Les fichiers de logo à joindre (nom affiché). */
  logos: string[];
  endUrl?: string | null;
  voice?: string | null;
  forbidden: string[];
};

export type DesignIntent = {
  kind: "video" | "image" | "les-deux";
  formats: FormatKey[];
  durationSec?: number | null;
  /** Pourquoi cette pub, face à ce que font les concurrents. */
  rationale: string;
  /** La direction créative de l'agent : temps par temps pour une vidéo, la composition pour un visuel fixe. */
  scenario: string;
};

export type DesignCreative = {
  id: number | string;
  angle: string;
  hook?: string | null;
  cta?: string | null;
  texts: { kind: string; text: string }[];
};

export type DesignRush = { id: number | string; title: string; filename?: string | null; description?: string | null; mediaType?: string | null };

const KIND_LABEL: Record<string, string> = { principal: "Texte principal (sous la pub, chez Meta)", titre: "Titre (sous la pub)", description: "Description" };

/** Les noms de fichiers à exporter, relus par l'import : « C12-9x16.mp4 ». Pure. */
export function expectedFileNames(creative: DesignCreative["id"], intent: Pick<DesignIntent, "kind" | "formats">): string[] {
  const exts = intent.kind === "image" ? ["png"] : intent.kind === "video" ? ["mp4"] : ["mp4", "png"];
  return exts.flatMap((ext) => intent.formats.map((f) => `C${creative}-${f}.${ext}`));
}

export function buildDesignPrompt(c: DesignCreative, intent: DesignIntent, kit: DesignKit, rushes: DesignRush[]): string {
  const video = intent.kind !== "image";
  const what =
    intent.kind === "video"
      ? `une publicité VIDÉO${intent.durationSec ? ` de ${intent.durationSec} s` : ""}`
      : intent.kind === "image"
        ? "un VISUEL FIXE publicitaire"
        : `une publicité VIDÉO${intent.durationSec ? ` de ${intent.durationSec} s` : ""} ET sa déclinaison en VISUEL FIXE`;
  const onScreen = [c.hook ? `Accroche : « ${c.hook} »` : null, c.cta ? `Bouton d'action : « ${c.cta} »` : null].filter(Boolean) as string[];
  const formats = intent.formats.map((k) => {
    const f = FORMATS[k];
    const s = safeBox(f);
    return `- ${f.label} : ${f.width}×${f.height} px — tout ce qui compte (textes, logo, bouton) dans la zone sûre de ${s.width}×${s.height} px à ${s.x} px du bord gauche et ${s.y} px du haut.`;
  });

  return [
    `Crée ${what} pour TIM Management, le logiciel de gestion de chantier des entreprises du BTP (pointage, planning, heures, congés, documents). Elle sera diffusée sur Facebook et Instagram.`,
    "",
    `ANGLE : ${c.angle}`,
    `POURQUOI CETTE PUB : ${intent.rationale}`,
    "",
    "DIRECTION CRÉATIVE :",
    intent.scenario,
    "",
    ...(onScreen.length ? ["TEXTES À L'ÉCRAN (à reprendre tels quels) :", ...onScreen.map((t) => `- ${t}`), ""] : []),
    ...(c.texts.length
      ? ["TEXTES DE L'ANNONCE (affichés par Meta autour de la pub — pour le ton, ne pas les écrire dans l'image) :", ...c.texts.map((t) => `- ${KIND_LABEL[t.kind] ?? t.kind} : « ${t.text} »`), ""]
      : []),
    "KIT DE MARQUE :",
    `- Couleurs : principale ${kit.palette.primary}, accent ${kit.palette.accent} (en touche seulement), fond sombre ${kit.palette.darkBg}, fond clair ${kit.palette.lightBg}, texte sur sombre ${kit.palette.textOnDark}, texte sur clair ${kit.palette.textOnLight}. Vert de validation : #22B573, seulement pour « validé ».`,
    `- Polices : ${kit.titleFont} pour les titres${kit.titleCase === "majuscules" ? " (en majuscules)" : ""}, ${kit.bodyFont} pour les textes.`,
    kit.logos.length ? `- Logo : fichiers joints (${kit.logos.join(", ")}).` : "- Logo : fichier joint.",
    kit.endUrl ? `- Adresse à afficher à la fin : ${kit.endUrl}` : null,
    kit.voice ? `- Ton de la marque : ${kit.voice}` : null,
    kit.forbidden.length ? `- Mots interdits : ${kit.forbidden.join(", ")}.` : null,
    "",
    baseV1Text(video),
    "",
    ...(rushes.length
      ? [
          "FICHIERS JOINTS (enregistrements de l'application, données fictives) :",
          ...rushes.map((r) => `- ${r.filename || r.title} — ${r.title}${r.description ? ` : ${r.description}` : ""}`),
          "Montre l'interface telle qu'elle est dans ces enregistrements : ne réinvente pas les écrans de l'application.",
          "",
        ]
      : []),
    "FORMATS À LIVRER :",
    ...formats,
    `Nomme les fichiers exportés exactement : ${expectedFileNames(c.id, intent).join(", ")}.`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}
