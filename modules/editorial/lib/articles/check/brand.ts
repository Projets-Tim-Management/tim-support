/**
 * Ton, marque et vocabulaire interdit : marque, note/avis, hors connexion, traces d'IA
 * (validation.py, l. 848-918, 974-1060).
 */
import { articleTexts, norm, splitSentences, stripTags } from "./normalize";
import { cpSlice, finditer, pyRe, search } from "./py";
import type { Article } from "./types";

// Correction décidée le 18/11/2026 : règle de marque INVERSÉE. La marque s'écrit « TIM Management ».
// Refusés : toute autre casse de « tim management » (« Tim Management », « tim management »…) et « Tim »
// employé seul (« Tim » non suivi de « Management »). Python refusait « TIM Management » / « TIM management »
// et exigeait « Tim Management » (règle du 12/10/2026, abandonnée).
const BRAND_ANY_CASE_RE = pyRe(String.raw`\b(?i:tim)\s+(?i:management)\b`);
const BRAND_OK_RE = pyRe(String.raw`^TIM\s+Management$`);
const TIM_ALONE_RE = pyRe(String.raw`\bTim\b(?!\s+(?i:management)\b)`);

/** Refuse toute forme de la marque autre que « TIM Management », et « Tim » seul. */
export function checkBrand(article: Article): string[] {
  const errors: string[] = [];
  for (const [where, html] of articleTexts(article)) {
    const text = stripTags(html);
    const found: Array<[number, string]> = [];
    for (const m of finditer(BRAND_ANY_CASE_RE, text)) if (!search(BRAND_OK_RE, m[0])) found.push([m.index, m[0]]);
    for (const m of finditer(TIM_ALONE_RE, text)) found.push([m.index, m[0]]);
    found.sort((a, b) => a[0] - b[0]);
    for (const [, form] of found) errors.push(`[${where}] Marque mal écrite : « ${form} » — écrire « TIM Management »`);
  }
  return errors;
}

// Règle du site (22/09/2026) : jamais de note globale ni de nombre d'avis dans un article.
const RATING_RE = pyRe(String.raw`\b\d(?:[,.]\d)?\s*/\s*5\b|\bnot[ée]e?\s+\d(?:[,.]\d)?\b|\bmoyenne des avis\b|\b\d+\s+avis\b|\b[ée]toiles\b`);

/** Refuse toute note ou nombre d'avis dans l'article. */
export function checkRating(article: Article): string[] {
  const errors: string[] = [];
  for (const [where, html] of articleTexts(article)) {
    for (const sentence of splitSentences(html)) {
      if (search(RATING_RE, norm(sentence))) errors.push(`[${where}] Note ou nombre d'avis interdit dans un article : « ${cpSlice(sentence, 0, 160)} »`);
    }
  }
  return errors;
}

// Faits de référence du site : Tim ne propose pas de pointage hors connexion (relevé 08/10/2026).
const OFFLINE_RE = pyRe(String.raw`\bhors[\s-]ligne\b|\bhors[\s-]connexion\b|\boff[\s-]?line\b|\bmode\s+deconnecte\b`);
const NO_NETWORK_RE = pyRe(String.raw`\bsans\s+(?:aucun\s+)?reseau\b`);
// « sans réseau » n'est refusé que s'il est présenté comme une fonction de l'outil
const FEATURE_RE = pyRe(String.raw`\b(?:fonctionn\w*|pointe[rz]?|pointage|saisi\w*|synchronis\w*|applica\w*|appli|mode|logiciel|outil|enregistr\w*|stock\w*)\b`);

/** Refuse toute promesse de fonctionnement hors connexion. */
export function checkOffline(article: Article): string[] {
  const errors: string[] = [];
  for (const [where, html] of articleTexts(article)) {
    for (const sentence of splitSentences(html)) {
      const s = norm(sentence);
      const hit = search(OFFLINE_RE, s) || (search(NO_NETWORK_RE, s) && search(FEATURE_RE, s));
      if (hit) errors.push(`[${where}] Fonctionnement hors connexion interdit (faits de référence) : « ${cpSlice(sentence, 0, 160)} »`);
    }
  }
  return errors;
}

// « données en temps réel » seul est légitime : seule la formule d'excuse d'un modèle est refusée.
const AI_TRACE_RE = pyRe(
  String.raw`en tant qu(?:e |')(?:modele|ia|intelligence artificielle|assistant)|je n'ai pas acces|` +
    String.raw`je n'ai pas acces aux donnees en temps reel|as an ai\b|language model|date de connaissance|knowledge cutoff|` +
    String.raw`je ne peux pas (?:naviguer|acceder)`,
);

export function checkAiTraces(article: Article): string[] {
  const errors: string[] = [];
  for (const [where, html] of articleTexts(article)) {
    const m = search(AI_TRACE_RE, norm(stripTags(html)));
    if (m) errors.push(`[${where}] Trace de génération IA : « ${m[0]} »`);
  }
  return errors;
}
