import { TEXT_LIMITS } from "@/modules/ads/lib/copy/guardrails";
import type { Tone } from "@/modules/ads/lib/dimensions";

/**
 * Le prompt de génération des textes, et le schéma de sa réponse.
 *
 * Le système (stable : règles, ton, interdits) est mis en cache ; le brief de
 * la campagne vient après. Les règles y sont énoncées, mais ce sont les
 * garde-fous du code qui décident (lib/copy/guardrails).
 */

export const PROMPT_VERSION = "3a-1";

export const VARIANTS = { principal: 5, titre: 5, description: 3 } as const;

export type BrandVoice = {
  defaultTone: Tone;
  voice?: string | null;
  goodExamples?: string | null;
  badExamples?: string | null;
  forbidden: string[];
};

export type BriefInput = {
  campaign: string;
  audience?: string | null;
  pain?: string | null;
  offer?: string | null;
  promise?: string | null;
  landingUrl?: string | null;
  /** Le libellé montré au modèle… */
  cta: string;
  /** …et la valeur enregistrée sur la créa. */
  ctaValue: string;
  tone: Tone;
  angles: string[];
  facts: { id: number | string; statement: string; source: string }[];
  forbidden: string[];
};

export function systemPrompt(v: BrandVoice): string {
  return [
    "Tu écris des publicités Meta (Facebook, Instagram) pour TIM Management, logiciel de gestion pour les entreprises du BTP : planning, pointage, véhicules, chantiers, documents RH.",
    "Tu écris en français, pour des professionnels du bâtiment. Concret, direct, sans jargon marketing.",
    "",
    "RÈGLES — un texte qui en enfreint une est rejeté automatiquement :",
    `1. Longueurs maximales : texte principal ${TEXT_LIMITS.principal.max} caractères (les ${TEXT_LIMITS.principal.target} premiers doivent porter le message), titre ${TEXT_LIMITS.titre.max} (viser ${TEXT_LIMITS.titre.target}), description ${TEXT_LIMITS.description.max}, accroche du visuel ${TEXT_LIMITS.accroche.max}.`,
    "2. Aucun chiffre qui ne figure pas mot pour mot dans les faits fournis ou dans l'offre. Pas de chiffre du tout plutôt qu'un chiffre inventé.",
    "3. Aucun témoignage, aucune citation attribuée, aucune note, aucun avis, aucun « nos clients disent ».",
    "4. Ne jamais prêter au lecteur un état personnel (santé, finances, situation familiale, origine, religion…). Parler de son métier et de ses chantiers est permis.",
    "5. Respecter exactement le ton demandé pour chaque angle : « vous » = vouvoiement strict, « tu » = tutoiement strict.",
    "6. Aucune superlative invérifiable (« le meilleur », « n°1 », « révolutionnaire »).",
    v.forbidden.length ? `7. Mentions interdites : ${v.forbidden.map((f) => `« ${f} »`).join(", ")}.` : "",
    "",
    `TON DE LA MARQUE — adresse par défaut : ${v.defaultTone === "vous" ? "vouvoiement" : "tutoiement"}.`,
    v.voice ? `Ton : ${v.voice}` : "",
    v.goodExamples ? `Phrases justes :\n${v.goodExamples}` : "",
    v.badExamples ? `Phrases à éviter :\n${v.badExamples}` : "",
    "",
    `Pour chaque angle : ${VARIANTS.principal} textes principaux différents, ${VARIANTS.titre} titres, ${VARIANTS.description} descriptions, une accroche courte pour le visuel, et les identifiants des faits utilisés.`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export function userPrompt(b: BriefInput, opts: { angles: number; toneTest: boolean }): string {
  const facts = b.facts.length ? b.facts.map((f) => `- [${f.id}] ${f.statement} (source : ${f.source})`).join("\n") : "- (aucun : n'écris aucun chiffre hors de l'offre)";
  const wanted = b.angles.length
    ? `Angles imposés, dans cet ordre : ${b.angles.slice(0, opts.angles).map((a) => `« ${a} »`).join(", ")}.`
    : `Propose ${opts.angles} angle(s) nettement différents.`;
  return [
    `CAMPAGNE : ${b.campaign}`,
    `Cible : ${b.audience ?? "—"}`,
    `Douleur : ${b.pain ?? "—"}`,
    `Offre : ${b.offer ?? "—"}`,
    `Promesse : ${b.promise ?? "—"}`,
    `Bouton d'action : ${b.cta}`,
    b.forbidden.length ? `Interdits propres à cette campagne : ${b.forbidden.map((f) => `« ${f} »`).join(", ")}.` : "",
    "",
    "FAITS AUTORISÉS (les seuls chiffres permis, avec ceux de l'offre) :",
    facts,
    "",
    wanted,
    `Ton de tous les angles : ${b.tone === "vous" ? "« vous » (vouvoiement)" : "« tu » (tutoiement)"}.`,
    opts.toneTest
      ? `TEST DE TON : ajoute UN angle de plus, qui reprend EXACTEMENT le premier angle (même idée, même accroche, mêmes arguments) en ${b.tone === "vous" ? "tutoiement (« tu »)" : "vouvoiement (« vous »)"}. Seul le ton change : c'est la dimension testée. Marque-le test = "ton".`
      : "N'ajoute aucun angle de test.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/** Le schéma de la réponse. Les nombres de variantes sont vérifiés en code (le format structuré ne les contraint pas). */
export const COPY_SCHEMA = {
  type: "object",
  properties: {
    angles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          angle: { type: "string", description: "L'idée en une ligne." },
          hook: { type: "string", description: "Accroche courte posée sur le visuel." },
          tone: { type: "string", enum: ["vous", "tu"] },
          test: { type: "string", enum: ["aucun", "ton"], description: "« ton » seulement pour l'angle de test de ton." },
          primaryTexts: { type: "array", items: { type: "string" } },
          headlines: { type: "array", items: { type: "string" } },
          descriptions: { type: "array", items: { type: "string" } },
          factIds: { type: "array", items: { type: "string" }, description: "Identifiants des faits utilisés, tels que fournis entre crochets." },
        },
        required: ["angle", "hook", "tone", "test", "primaryTexts", "headlines", "descriptions", "factIds"],
        additionalProperties: false,
      },
    },
  },
  required: ["angles"],
  additionalProperties: false,
} as const;

export type CopyAngle = {
  angle: string;
  hook: string;
  tone: Tone;
  test: "aucun" | "ton";
  primaryTexts: string[];
  headlines: string[];
  descriptions: string[];
  factIds: string[];
};

export type CopyResult = { angles: CopyAngle[] };
