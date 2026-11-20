/**
 * LES RÈGLES DE CHARLIE QUE LE PIPELINE PYTHON NE VÉRIFIAIT PAS (règles v1, partie D,
 * passées en vérification par le code le 18/11/2026) :
 *  - FAQ de 4 à 6 questions dès la création ;
 *  - jamais de page de démo ni de « demandez une démonstration » : l'appel à
 *    l'action va vers /contact (absent = avertissement) ;
 *  - aucune promesse sur TIM Management (« garantit », « fiabilise », « des
 *    outils comme TIM Management »…) ;
 *  - article de TRAFIC : TIM Management ni dans la TL;DR ni dans l'introduction,
 *    une mention au plus dans le corps, aucun prix de TIM Management ;
 *  - article de VENTE : les prix de TIM Management sont ceux de /offres (vérifiés
 *    comme un fait par checkFacts, la page /offres étant fournie comme fait de
 *    référence — jamais comme source de l'article).
 *
 * Pur (testé). Messages en français : ils sont repris tels quels dans la relance.
 */
import { articleTexts, norm, splitSentences, stripTags } from "./normalize";
import type { Article, Fait } from "./types";

export const FAQ_MIN = 4;
export const FAQ_MAX = 6;

const BRAND = /tim\s+management/;
const DEMO_LINK = /href\s*=\s*["'][^"']*demande-demo[^"']*["']/i;
const DEMO_ASK = /\bdemandez(?:-nous)?\s+une\s+d[ée]monstration\b/i;
const CONTACT_LINK = /href\s*=\s*["'](?:https?:\/\/(?:www\.)?tim-management\.co)?\/contact\/?["'#?]/i;
/** Promesses interdites, quand la phrase parle de TIM Management. */
const PROMISE = /\b(garanti(?:t|ssent|r)?|fiabilis\w*|s[ée]curis\w*|supprime\w* les erreurs|z[ée]ro erreur|en \d+ clics?|la solution id[ée]ale|la meilleure solution)\b|[-−]\s?\d+\s?%/;
/** Promesses génériques, partout. */
const GENERIC_PROMISE = /\bdes (?:outils|solutions|logiciels|applications) comme tim management\b/;
const EURO = /\d+(?:[  ]\d{3})*(?:[.,]\d+)?\s?(?:€|euros?\b|eur\b)/i;
const MONEY_WORDS = /\b(prix|tarifs?|abonnement|co[uû]te|ht\s*\/\s*mois|par mois)\b/;

const cut = (s: string) => (s.length > 160 ? `${s.slice(0, 160)}…` : s);

export type PolicyOptions = { sales: boolean };

/** Les règles de Charlie, selon que l'article est de trafic ou de vente. */
export function checkPolicy(article: Article, o: PolicyOptions): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const faq = Array.isArray(article.faq) ? article.faq.filter(Boolean) : [];
  if (faq.length < FAQ_MIN || faq.length > FAQ_MAX) errors.push(`FAQ : ${faq.length} question(s) (attendu ${FAQ_MIN} à ${FAQ_MAX})`);

  const fragments = articleTexts(article, false);
  const html = fragments.map(([, h]) => h).join("\n");
  if (DEMO_LINK.test(html)) errors.push("Lien vers une page de demande de démo interdit : l'appel à l'action va vers https://tim-management.co/contact");
  if (!CONTACT_LINK.test(html)) warnings.push("Aucun appel à l'action vers https://tim-management.co/contact");

  for (const [where, fragment] of fragments) {
    for (const sentence of splitSentences(fragment)) {
      const n = norm(sentence);
      if (DEMO_ASK.test(sentence)) errors.push(`[${where}] « Demandez une démonstration » interdit : lien vers /contact : « ${cut(sentence)} »`);
      if (GENERIC_PROMISE.test(n)) errors.push(`[${where}] Promesse générique interdite : « ${cut(sentence)} »`);
      else if (BRAND.test(n) && PROMISE.test(n)) errors.push(`[${where}] Promesse sur TIM Management interdite (conformité, résultat, chiffre) : « ${cut(sentence)} »`);
      if (!o.sales && BRAND.test(n) && (EURO.test(sentence) || MONEY_WORDS.test(n))) errors.push(`[${where}] Prix de TIM Management dans un article de trafic : « ${cut(sentence)} »`);
    }
  }

  if (!o.sales) {
    const intro = stripTags(article.introduction ?? "");
    if (BRAND.test(norm(intro))) errors.push("[introduction] TIM Management dans la TL;DR ou l'introduction d'un article de trafic");
    const body = (Array.isArray(article.contenu) ? article.contenu : []).map((b) => norm(stripTags(String(b?.texte ?? "")))).join(" ");
    const mentions = body.match(/tim\s+management/g)?.length ?? 0;
    if (mentions > 1) errors.push(`[corps] TIM Management cité ${mentions} fois dans le corps d'un article de trafic (1 au plus)`);
  }
  return { errors, warnings };
}

/** La page /offres en fait de RÉFÉRENCE (prix de TIM Management, articles de vente) : jamais une source de l'article. */
export const OFFERS_URL = "https://tim-management.co/offres";
export const offersFact = (offersText: string): Fait => ({ fait: `Tarifs de TIM Management (page /offres) : ${offersText}`, source: "TIM Management, page Tarifs", url: OFFERS_URL, annee: "" });
export const isOffersFact = (f: Partial<Fait>) => f.url === OFFERS_URL;
