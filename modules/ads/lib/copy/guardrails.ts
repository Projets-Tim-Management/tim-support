import type { Tone } from "@/modules/ads/lib/dimensions";

/**
 * Les garde-fous des textes publicitaires (plan Publicité, D9 et §9 ter).
 *
 * Le prompt les demande aussi, mais c'est ICI qu'ils décident : un prompt se
 * contourne, un `if` non. Chaque règle est une fonction pure, qui dit pourquoi
 * elle rejette — la raison est affichée à côté du texte, dans l'atelier.
 */

export type TextKind = "principal" | "titre" | "description" | "accroche";

/** Limites de Meta (relevées le 29/09/2026) : `max` rejette, `target` est ce qui se lit sans « Voir plus ». */
export const TEXT_LIMITS: Record<TextKind, { max: number; target: number }> = {
  principal: { max: 500, target: 125 },
  titre: { max: 40, target: 27 },
  description: { max: 30, target: 30 },
  // L'accroche posée sur le visuel : courte, elle doit tenir en gros.
  accroche: { max: 60, target: 45 },
};

/** Minuscules, sans accents : « Numéro 1 » et « numero 1 » sont la même mention. */
export const normalize = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’`]/g, "'");

export const charCount = (s: string): number => [...s].length;

export function checkLength(kind: TextKind, text: string): string | null {
  const n = charCount(text.trim());
  if (n === 0) return "Texte vide.";
  const { max } = TEXT_LIMITS[kind];
  return n > max ? `${n} caractères, au-delà de la limite de ${max}.` : null;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function checkForbidden(text: string, terms: string[]): string | null {
  const t = normalize(text);
  for (const term of terms) {
    const n = normalize(term.trim());
    if (!n) continue;
    // Bornes de mot, pour que « top » n'attrape pas « stop ».
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${escape(n)}($|[^\\p{L}\\p{N}])`, "u").test(t)) return `Mention interdite : « ${term.trim()} ».`;
  }
  return null;
}

/** Les nombres d'un texte : « 2 h », « 30 % », « 1,5 » → 2, 30, 1.5. Les milliers « 1 000 » comptent pour un nombre. */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\d{1,3}(?:[  ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g)) {
    out.push(Number(m[0].replace(/[  ]/g, "").replace(",", ".")));
  }
  return out;
}

/**
 * Aucun chiffre non sourcé : tout nombre du texte doit venir d'un fait autorisé
 * du brief, ou de l'offre elle-même (« démo de 30 minutes »). Un chiffre qui
 * sonne juste mais sort du modèle est rejeté.
 */
export function checkNumbers(text: string, allowed: Set<number>): string | null {
  const bad = numbersIn(text).filter((n) => !allowed.has(n));
  return bad.length ? `Chiffre non sourcé : ${[...new Set(bad)].join(", ")} (absent des faits autorisés et de l'offre).` : null;
}

export const allowedNumbers = (sources: string[]): Set<number> => new Set(sources.flatMap(numbersIn));

const TESTIMONIAL = [
  /[«"“][^»"”]{3,}[»"”]\s*[-–—,]\s*\p{Lu}/u, // « … » — Marc
  /[-–—]\s*\p{Lu}\p{Ll}+,\s*(conducteur|chef|g[ée]rant|directeur|responsable|dirigeant|artisan|client)/iu,
  /\bnos clients (disent|t[ée]moignent|adorent|nous disent|en parlent|recommandent)\b/iu,
  /\bt[ée]moign/iu,
  /\bavis (clients?|v[ée]rifi[ée]s?)\b/iu,
  /[★⭐]/u,
  /\b\d+(?:[.,]\d)?\s*\/\s*5\b/u,
];

/** Aucun témoignage inventé : ni citation attribuée, ni « nos clients disent », ni note ou avis. */
export function checkTestimonial(text: string): string | null {
  return TESTIMONIAL.some((re) => re.test(text)) ? "Ressemble à un témoignage ou à un avis : aucun témoignage inventé." : null;
}

/**
 * Pas d'attribut personnel supposé du lecteur — interdit par la politique
 * publicitaire de Meta (santé, finances, situation, origine, religion,
 * orientation…), et motif de refus d'annonce. On vise l'affirmation ou la
 * question qui prête un état à la personne ; « Vous êtes conducteur de
 * travaux ? » (un métier) reste permis.
 */
const SENSITIVE =
  "(endett|surendett|malade|depress|stress|anxieu|enceinte|divorc|celibataire|chomeu|chomage|sans emploi|handicap|obese|surpoids|age|agee|pauvre|fauche|en difficulte|en faillite|musulman|chretien|juif|gay|lesbienne|homosexuel|immigre|etranger)";
const ATTRIBUTE = new RegExp(`\\b(vous etes|etes-vous|tu es|es-tu|t'es)\\s+(\\p{L}+\\s+)?${SENSITIVE}`, "u");
const ATTRIBUTE_HAVE = /\b(vous avez|avez-vous|tu as|as-tu)\s+(des\s+)?(dettes|problemes d'argent|une maladie)/u;

export function checkPersonalAttributes(text: string): string | null {
  const t = normalize(text);
  return ATTRIBUTE.test(t) || ATTRIBUTE_HAVE.test(t) ? "Prête un attribut personnel au lecteur (santé, finances, situation…) : interdit par Meta." : null;
}

/** Le ton annoncé est le ton écrit : un texte « vous » ne tutoie pas, et inversement. */
export function checkTone(text: string, tone: Tone): string | null {
  const t = normalize(text).replace(/rendez-vous/g, " ");
  const tu = /(^|[^\p{L}])(tu|te|toi|ton|ta|tes|t')($|[^\p{L}])/u.test(t) || /(^|[^\p{L}])t'\p{L}/u.test(t);
  const vous = /(^|[^\p{L}])(vous|votre|vos)($|[^\p{L}])/u.test(t);
  if (tone === "vous" && tu) return "Tutoie alors que la créa vouvoie.";
  if (tone === "tu" && vous) return "Vouvoie alors que la créa tutoie.";
  return null;
}

export type GuardContext = { tone: Tone; forbidden: string[]; allowed: Set<number> };

/** Tous les garde-fous, dans l'ordre : la première raison suffit. */
export function guard(kind: TextKind, text: string, ctx: GuardContext): { ok: true } | { ok: false; reason: string } {
  const reason =
    checkLength(kind, text) ??
    checkForbidden(text, ctx.forbidden) ??
    checkNumbers(text, ctx.allowed) ??
    checkTestimonial(text) ??
    checkPersonalAttributes(text) ??
    checkTone(text, ctx.tone);
  return reason ? { ok: false, reason } : { ok: true };
}
