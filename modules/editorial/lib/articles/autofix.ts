/**
 * CORRECTION AUTOMATIQUE DES ERREURS BLOQUANTES (tiroir, 19/11/2026).
 *
 * La direction ne cherche pas à la main les passages que le contrôle refuse :
 *  - la MARQUE : toute autre écriture de « TIM Management » (« Tim Management », « tim management »,
 *    « Tim » seul) est réécrite « TIM Management », dans le texte seulement (jamais dans une balise
 *    ou une adresse) ;
 *  - une PROMESSE GÉNÉRIQUE signalée : la phrase entière est retirée (le contrôle donne la phrase).
 * Rien n'est enregistré : la direction relit, puis clique « Enregistrer ». Pur (testé).
 */

type Raw = Record<string, unknown>;

const BRAND_ANY = /\b[Tt][Ii][Mm]\s+[Mm][Aa][Nn][Aa][Gg][Ee][Mm][Ee][Nn][Tt]\b/g;
const TIM_ALONE = /\bTim\b(?!\s+[Mm][Aa][Nn][Aa][Gg][Ee][Mm][Ee][Nn][Tt]\b)/g;

/** Réécrit la marque dans le texte d'un HTML, sans toucher aux balises. */
export function fixBrand(html: string): string {
  return html
    .split(/(<[^>]+>)/)
    .map((part) => (part.startsWith("<") ? part : part.replace(BRAND_ANY, "TIM Management").replace(TIM_ALONE, "TIM Management")))
    .join("");
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Retire d'un HTML la phrase citée par le contrôle (éventuellement coupée par « … »), où qu'y
 * tombent balises, espaces insécables et apostrophes typographiques. Rend null si elle n'y est pas.
 */
export function removeSentence(html: string, quoted: string): string | null {
  const truncated = /…\s*$/.test(quoted);
  const words = quoted.replace(/…\s*$/, "").trim().split(/\s+/).filter(Boolean);
  if (words.length < 3) return null;
  const gap = "(?:\\s|&nbsp;|&#160;|<[^>]+>)+";
  const token = (w: string) => escape(w).replace(/['’]/g, "(?:'|’|&rsquo;|&#8217;|&#039;)");
  // La phrase citée ; si la citation était coupée (« … »), ce qui reste jusqu'à sa ponctuation finale. Puis les espaces.
  const re = new RegExp(`${words.map(token).join(gap)}${truncated ? "[^.!?<]*[.!?]?" : ""}\\s*`, "i");
  if (!re.test(html)) return null;
  return html.replace(re, "").replace(/\s+<\/p>/g, "</p>").replace(/<p>\s*<\/p>/g, "");
}

// Les phrases à retirer : promesse générique, et « demandez une démonstration » (la citation finale).
const PROMISE = /^\[[^\]]+\] (?:Promesse générique interdite|« Demandez une démonstration » interdit[^«]*) : « ([^«»]+) »$/;

/** Applique les deux corrections aux champs de l'article. Rend ce qui a été fait et ce qui n'a pas pu l'être. */
export function autoFixArticle(acf: Raw, alerts: string[]): { acf: Raw; brandFixed: number; removed: number; notFound: string[] } {
  const out: Raw = structuredClone(acf);
  const blocks = Array.isArray(out.contenu) ? (out.contenu as Raw[]) : [];
  const faq = Array.isArray(out.faq) ? (out.faq as Raw[]) : [];
  // Les champs de texte, et comment les réécrire.
  const fields: Array<{ get: () => string; set: (v: string) => void }> = [
    { get: () => String(out.introduction ?? ""), set: (v) => (out.introduction = v) },
    ...blocks.filter((b) => typeof b?.texte === "string").map((b) => ({ get: () => String(b.texte), set: (v: string) => (b.texte = v) })),
    { get: () => String(out.conclusion ?? ""), set: (v) => (out.conclusion = v) },
    ...faq.flatMap((q) => [
      { get: () => String(q.titre ?? ""), set: (v: string) => (q.titre = v) },
      { get: () => String(q.text ?? ""), set: (v: string) => (q.text = v) },
    ]),
  ];
  let removed = 0;
  const notFound: string[] = [];
  for (const alert of alerts) {
    const m = alert.match(PROMISE);
    if (!m) continue;
    const hit = fields.find((f) => removeSentence(f.get(), m[1]) != null);
    if (hit) {
      hit.set(removeSentence(hit.get(), m[1]) as string);
      removed++;
    } else notFound.push(m[1]);
  }
  let brandFixed = 0;
  for (const f of fields) {
    const before = f.get();
    const after = fixBrand(before);
    if (after !== before) {
      brandFixed += (before.match(BRAND_ANY) ?? []).filter((x) => x !== "TIM Management").length + (before.match(TIM_ALONE) ?? []).length;
      f.set(after);
    }
  }
  return { acf: out, brandFixed, removed, notFound };
}
