/**
 * LE FICHIER DE RÈGLES DES ARTICLES, VERSIONNÉ (étape 4, 18/11/2026).
 *
 * Une fois par mois, Sergey propose des recommandations, preuves à l'appui ;
 * Charlie valide ou refuse chacune. Une recommandation validée s'applique au
 * texte de façon EXACTE et vérifiable — jamais par une réécriture libre :
 *  - « modification » : le passage actuel (copié mot pour mot) est remplacé ;
 *  - « retrait » : le passage actuel est retiré ;
 *  - « ajout » : le texte nouveau est inséré à la fin de la section dont le
 *    titre est donné (par exemple « ### B3. Corps »).
 * Le passage ou la section introuvable = la recommandation ne s'applique pas
 * (le texte a changé depuis) : elle est signalée, rien n'est modifié.
 *
 * Le SOCLE (partie A) est vérifié par du code : une recommandation qui le touche,
 * validée, devient un développement (« À développer »), pas une simple
 * modification de texte.
 *
 * Pur (testé).
 */

export const RULE_KINDS = [
  { value: "ajout", label: "Ajout" },
  { value: "modification", label: "Modification" },
  { value: "retrait", label: "Retrait" },
  // Règles v3 (19/11/2026) : Sergey peut aussi faire évoluer la GRILLE de la note.
  { value: "critere", label: "Critère de la note" },
] as const;
export type RuleKind = (typeof RULE_KINDS)[number]["value"];

export const PROOF_LEVELS = [
  { value: "officiel", label: "Documentation officielle (Google, OpenAI, Perplexity, Microsoft…)" },
  { value: "mesure", label: "Mesure sur nos propres articles" },
  { value: "indice", label: "Étude ou blog SEO (indice seulement)" },
] as const;
export type ProofLevel = (typeof PROOF_LEVELS)[number]["value"];

export const PROPOSAL_STATUSES = [
  { value: "proposee", label: "Proposée — attend ta décision", color: "var(--tim-blue)", bg: "var(--tim-blue-bg)" },
  { value: "appliquee", label: "Validée et appliquée", color: "var(--tim-green)", bg: "var(--tim-green-bg)" },
  { value: "a-developper", label: "Validée — à développer (socle)", color: "var(--tim-purple)", bg: "var(--tim-purple-bg)" },
  { value: "refusee", label: "Refusée", color: "var(--tim-gray)", bg: "var(--tim-gray-bg)" },
  { value: "inapplicable", label: "Inapplicable (le texte a changé)", color: "var(--tim-amber)", bg: "var(--tim-amber-bg)" },
] as const;

/** Domaines dont une page compte comme « documentation officielle ». */
export const OFFICIAL_DOMAINS = [
  "developers.google.com",
  "support.google.com",
  "blog.google",
  "search.google.com",
  "openai.com",
  "help.openai.com",
  "platform.openai.com",
  "docs.perplexity.ai",
  "perplexity.ai",
  "microsoft.com",
  "learn.microsoft.com",
  "blogs.bing.com",
  "bing.com",
  "anthropic.com",
  "docs.anthropic.com",
  "schema.org",
  "w3.org",
];

export const isOfficialUrl = (url: string) => {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return OFFICIAL_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
};

/** La recommandation touche-t-elle le socle verrouillé (partie A) ? */
export const touchesSocle = (part: string) => /^\s*A\d*\b/i.test(part.trim());

const normSpace = (s: string) => s.replace(/\r\n?/g, "\n");

export type RuleChange = { kind: RuleKind; part: string; currentText?: string | null; proposedText?: string | null; anchor?: string | null };
export type ApplyOutcome = { ok: true; text: string } | { ok: false; reason: string };

/** Applique une recommandation au texte des règles. Pure (testée). */
export function applyRuleChange(text: string, c: RuleChange): ApplyOutcome {
  const t = normSpace(text);
  const current = normSpace(c.currentText ?? "").trim();
  const proposed = normSpace(c.proposedText ?? "").trim();
  if (c.kind === "modification" || c.kind === "retrait") {
    if (!current) return { ok: false, reason: "Le passage actuel à remplacer est vide." };
    const at = t.indexOf(current);
    if (at < 0) return { ok: false, reason: "Le passage actuel est introuvable dans la version en vigueur (le texte a changé depuis)." };
    if (t.indexOf(current, at + 1) >= 0) return { ok: false, reason: "Le passage actuel apparaît plusieurs fois : la recommandation doit en citer un plus long." };
    if (c.kind === "modification" && !proposed) return { ok: false, reason: "Le nouveau texte est vide." };
    const replaced = t.slice(0, at) + (c.kind === "modification" ? proposed : "") + t.slice(at + current.length);
    return { ok: true, text: replaced.replace(/\n{3,}/g, "\n\n") };
  }
  // Ajout : à la fin de la section dont le titre est donné.
  if (!proposed) return { ok: false, reason: "Le texte à ajouter est vide." };
  const anchor = (c.anchor ?? "").trim();
  if (!anchor) return { ok: false, reason: "La section où ajouter le texte n'est pas indiquée." };
  const lines = t.split("\n");
  const start = lines.findIndex((l) => l.trim() === anchor || l.trim().replace(/^#+\s*/, "") === anchor.replace(/^#+\s*/, ""));
  if (start < 0) return { ok: false, reason: `La section « ${anchor} » est introuvable dans la version en vigueur.` };
  const level = (lines[start].match(/^#+/)?.[0].length ?? 0) || 6;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  // Juste après la dernière ligne non vide de la section.
  let insertAt = end;
  while (insertAt > start + 1 && !lines[insertAt - 1].trim()) insertAt--;
  const out = [...lines.slice(0, insertAt), proposed, ...lines.slice(insertAt)];
  return { ok: true, text: out.join("\n") };
}

/**
 * UN CHANGEMENT DE LA GRILLE DE LA NOTE (règles v3, 19/11/2026), proposé par Sergey et validé
 * par la direction : durcir ou assouplir un critère (poids, seuils), le passer « compté » ou
 * « pour information », ou en proposer un NOUVEAU. Un nouveau critère entre « pour information »
 * (poids 0) et « à développer » : il ne compte qu'une fois sa mesure écrite dans le code.
 */
export type CriterionChange = {
  id: string;
  weight?: number;
  status?: "active" | "info";
  params?: Record<string, number>;
  /** Un nouveau critère (id libre « NEW-… ») : sa jauge, son libellé, ce qu'il mesure. */
  create?: { gauge: "seo" | "geo"; label: string; measure: string };
};
type GridCriterion = { id: string; gauge: "seo" | "geo"; label: string; measure: string; weight: number; level: "A" | "B" | "C" | "D"; status: "active" | "info"; applies: ("article" | "fiche")[]; params?: Record<string, number>; source?: string };

/** Applique un changement de grille ; refuse ce qui n'a pas de sens. Pure (testée). */
export function applyCriterionChange(criteria: GridCriterion[], c: CriterionChange): { ok: true; criteria: GridCriterion[]; summary: string } | { ok: false; reason: string } {
  if (c.create) {
    if (criteria.some((x) => x.id === c.id)) return { ok: false, reason: `Le critère ${c.id} existe déjà.` };
    if (!c.create.label || !c.create.measure) return { ok: false, reason: "Un nouveau critère doit dire ce qu'il mesure." };
    const added: GridCriterion = { id: c.id, gauge: c.create.gauge === "geo" ? "geo" : "seo", label: c.create.label, measure: `À développer : ${c.create.measure}`, weight: 0, level: "C", status: "info", applies: ["article", "fiche"] };
    return { ok: true, criteria: [...criteria, added], summary: `nouveau critère « ${added.label} » (pour information, à développer)` };
  }
  const i = criteria.findIndex((x) => x.id === c.id);
  if (i < 0) return { ok: false, reason: `Le critère ${c.id} n'existe pas dans la grille en vigueur.` };
  const cur = criteria[i];
  const next: GridCriterion = { ...cur, params: cur.params ? { ...cur.params } : undefined };
  const parts: string[] = [];
  if (c.weight != null) {
    if (!Number.isFinite(c.weight) || c.weight < 0 || c.weight > 40) return { ok: false, reason: "Un poids va de 0 à 40." };
    parts.push(`poids ${cur.weight} → ${c.weight}`);
    next.weight = c.weight;
  }
  if (c.status) {
    if (cur.measure.startsWith("À développer") && c.status === "active") return { ok: false, reason: "Ce critère n'est pas encore mesuré par le code : il reste pour information." };
    parts.push(`${cur.status === "active" ? "compté" : "pour information"} → ${c.status === "active" ? "compté" : "pour information"}`);
    next.status = c.status;
    if (c.status === "info") next.weight = 0;
  }
  if (c.params) {
    for (const [k, v] of Object.entries(c.params)) {
      if (!cur.params || !(k in cur.params)) return { ok: false, reason: `Le seuil « ${k} » n'existe pas pour ${c.id}.` };
      if (!Number.isFinite(v) || v < 0) return { ok: false, reason: `Le seuil « ${k} » doit être un nombre positif.` };
      parts.push(`${k} ${cur.params[k]} → ${v}`);
      next.params![k] = v;
    }
  }
  if (!parts.length) return { ok: false, reason: "Aucun changement." };
  const out = [...criteria];
  out[i] = next;
  const total = (g: string) => out.filter((x) => x.gauge === g && x.status === "active").reduce((a, x) => a + x.weight, 0);
  return { ok: true, criteria: out, summary: `${c.id} « ${cur.label} » : ${parts.join(", ")} (total ${next.gauge.toUpperCase()} : ${total(next.gauge)})` };
}
