/**
 * Le PLAN DE DIFFUSION d'une campagne (plan Publicité, 3b — décision de Charlie
 * du 19/10/2026 : « n'importe quel type de campagne, selon les besoins »).
 *
 * Le stratège choisit l'objectif, ce sur quoi Meta optimise et les ensembles de
 * publicités (leur part du budget et leur ciblage) ; le code vérifie que le tout
 * se tient, puis le traduit dans les termes de Meta au moment de publier. Le
 * plan ne publie rien : la publication reste un geste de Charlie.
 *
 * Pure.
 */

export type Objectif = "trafic" | "prospects" | "notoriete" | "interaction";
export type Optimisation = "vues-page" | "clics" | "conversions" | "couverture" | "impressions" | "souvenir" | "interactions" | "vues-video";

type ObjectifDef = {
  label: string;
  meta: string;
  /** Les optimisations permises, la première par défaut. */
  optimisations: Optimisation[];
  /** Mène vers le site : l'URL de la campagne et ses paramètres sont exigés. */
  site: boolean;
};

export const OBJECTIFS: Record<Objectif, ObjectifDef> = {
  trafic: { label: "Trafic vers le site", meta: "OUTCOME_TRAFFIC", optimisations: ["vues-page", "clics"], site: true },
  prospects: { label: "Prospects (demandes de démo sur le site)", meta: "OUTCOME_LEADS", optimisations: ["conversions"], site: true },
  notoriete: { label: "Notoriété", meta: "OUTCOME_AWARENESS", optimisations: ["couverture", "impressions", "souvenir"], site: false },
  interaction: { label: "Interaction (vidéo, publication)", meta: "OUTCOME_ENGAGEMENT", optimisations: ["vues-video", "interactions"], site: false },
};

export const OPTIMISATIONS: Record<Optimisation, { label: string; meta: string }> = {
  "vues-page": { label: "Vues de la page d'arrivée", meta: "LANDING_PAGE_VIEWS" },
  clics: { label: "Clics sur le lien", meta: "LINK_CLICKS" },
  conversions: { label: "Conversions sur le site (prospect)", meta: "OFFSITE_CONVERSIONS" },
  couverture: { label: "Personnes touchées", meta: "REACH" },
  impressions: { label: "Impressions", meta: "IMPRESSIONS" },
  souvenir: { label: "Souvenir publicitaire", meta: "AD_RECALL_LIFT" },
  interactions: { label: "Interactions avec la publication", meta: "POST_ENGAGEMENT" },
  "vues-video": { label: "Vues de vidéo (ThruPlay)", meta: "THRUPLAY" },
};

export type Ciblage = { id: string; name: string };

export type Ensemble = {
  nom: string;
  /** Part du budget Meta de la campagne, en %. */
  part: number;
  /** Advantage+ audience : Meta élargit au-delà du ciblage, qui devient une suggestion. */
  advantage: boolean;
  pays: string[];
  regions: Ciblage[];
  ageMin: number;
  ageMax: number;
  genres: "tous" | "hommes" | "femmes";
  interets: Ciblage[];
  metiers: Ciblage[];
};

export type MediaPlan = {
  objectif: Objectif;
  optimisation: Optimisation;
  ensembles: Ensemble[];
  /** Pour un test à plusieurs ensembles : de quoi juger que le budget les nourrit tous. */
  chiffres?: { budgetMetaQuotidienEur?: number | null; coutCibleEur?: number | null; resultatsSemaineParEnsemble?: number | null } | null;
};

/** Le budget quotidien minimal d'un ensemble chez Meta, en euros (prudent : Meta l'ajuste selon l'optimisation). */
export const MIN_ADSET_DAILY_EUR = 1;
export const MAX_ENSEMBLES = 4;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const refs = (v: unknown): Ciblage[] =>
  (Array.isArray(v) ? v : [])
    .map((x) => ({ id: str((x as Ciblage)?.id ?? (typeof x === "number" ? String(x) : "")), name: str((x as Ciblage)?.name) }))
    .filter((x) => /^\d{3,20}$/.test(x.id) || /^[A-Za-z0-9_-]{2,30}$/.test(x.id));

/** Le plan tel que l'agent l'écrit, ramené aux types (sans juger s'il se tient). Pure. */
export function readPlan(raw: Record<string, unknown>): MediaPlan {
  const objectif = str(raw.objectif) as Objectif;
  const def = OBJECTIFS[objectif];
  const optimisation = (str(raw.optimisation) || def?.optimisations[0]) as Optimisation;
  const ensembles = (Array.isArray(raw.ensembles) ? raw.ensembles : []).map((e, i): Ensemble => {
    const x = (e ?? {}) as Record<string, unknown>;
    const genres = str(x.genres);
    return {
      nom: str(x.nom) || `Ensemble ${i + 1}`,
      part: num(x.part, 0),
      advantage: x.advantage !== false,
      pays: (Array.isArray(x.pays) ? x.pays : ["FR"]).map((p) => str(p).toUpperCase()).filter((p) => /^[A-Z]{2}$/.test(p)),
      regions: refs(x.regions),
      ageMin: Math.round(num(x.age_min ?? x.ageMin, 18)),
      ageMax: Math.round(num(x.age_max ?? x.ageMax, 65)),
      genres: genres === "hommes" || genres === "femmes" ? genres : "tous",
      interets: refs(x.interets),
      metiers: refs(x.metiers),
    };
  });
  const c = (raw.chiffres ?? {}) as Record<string, unknown>;
  const opt = (k: string) => (typeof c[k] === "number" && (c[k] as number) > 0 ? (c[k] as number) : null);
  return { objectif, optimisation, ensembles, chiffres: { budgetMetaQuotidienEur: opt("budget_meta_quotidien_eur"), coutCibleEur: opt("cout_cible_eur"), resultatsSemaineParEnsemble: opt("resultats_semaine_par_ensemble") } };
}

/**
 * Ce qui ne se tient pas dans un plan, pour un budget Meta quotidien donné (ou
 * inconnu) et selon que le compte a un pixel. Vide : le plan se publie. Pure.
 */
export function planProblems(p: MediaPlan, ctx: { metaDailyEur?: number | null; hasPixel?: boolean } = {}): string[] {
  const out: string[] = [];
  const def = OBJECTIFS[p.objectif];
  if (!def) return [`Objectif inconnu : ${Object.keys(OBJECTIFS).join(", ")}.`];
  if (!def.optimisations.includes(p.optimisation)) out.push(`Pour l'objectif « ${def.label} », optimiser sur : ${def.optimisations.join(", ")}.`);
  if (p.optimisation === "conversions" && ctx.hasPixel === false) out.push("Optimiser sur les conversions exige un pixel sur le compte (ou la phase CAPI) : sinon, objectif trafic sur les vues de page.");
  if (!p.ensembles.length) out.push("Au moins un ensemble de publicités.");
  if (p.ensembles.length > MAX_ENSEMBLES) out.push(`${MAX_ENSEMBLES} ensembles au plus : au-delà, le budget se disperse.`);
  const total = p.ensembles.reduce((s, e) => s + e.part, 0);
  if (p.ensembles.length && Math.abs(total - 100) > 1) out.push(`Les parts des ensembles font ${total} % : elles doivent faire 100 %.`);
  for (const e of p.ensembles) {
    if (!e.pays.length && !e.regions.length) out.push(`« ${e.nom} » : au moins un pays ou une région.`);
    if (e.ageMin < 18 || e.ageMax > 65 || e.ageMin > e.ageMax) out.push(`« ${e.nom} » : âges entre 18 et 65, le minimum sous le maximum.`);
    if (e.part <= 0) out.push(`« ${e.nom} » : une part du budget positive.`);
    if (ctx.metaDailyEur != null && (ctx.metaDailyEur * e.part) / 100 < MIN_ADSET_DAILY_EUR) out.push(`« ${e.nom} » : ${((ctx.metaDailyEur * e.part) / 100).toFixed(2)} € par jour, sous le minimum de ${MIN_ADSET_DAILY_EUR} €.`);
  }
  // Décision 7 du 29/09/2026 : un test à plusieurs ensembles dit pourquoi le budget les nourrit tous.
  if (p.ensembles.length > 1) {
    const c = p.chiffres ?? {};
    const missing = [!c.budgetMetaQuotidienEur && "le budget Meta quotidien", !c.coutCibleEur && "le coût cible par résultat", !c.resultatsSemaineParEnsemble && "les résultats attendus par semaine et par ensemble"].filter(Boolean);
    if (missing.length) out.push(`Plusieurs ensembles : donnez ${missing.join(", ")}.`);
  }
  return out;
}

/** Le ciblage Meta d'un ensemble. Pure. */
export function metaTargeting(e: Ensemble): Record<string, unknown> {
  const flexible = [...(e.interets.length ? [{ interests: e.interets }] : []), ...(e.metiers.length ? [{ work_positions: e.metiers }] : [])];
  return {
    geo_locations: { ...(e.pays.length ? { countries: e.pays } : {}), ...(e.regions.length ? { regions: e.regions.map((r) => ({ key: r.id })) } : {}) },
    age_min: e.ageMin,
    age_max: e.ageMax,
    ...(e.genres === "hommes" ? { genders: [1] } : e.genres === "femmes" ? { genders: [2] } : {}),
    // Chaque groupe est un OU, les groupes entre eux un ET : intérêts ET métier ensemble restreindraient trop ; on les met dans un seul OU.
    ...(flexible.length ? { flexible_spec: [Object.assign({}, ...flexible)] } : {}),
    targeting_automation: { advantage_audience: e.advantage ? 1 : 0 },
  };
}

/** Le plan en une phrase, pour le journal et les cartes. Pure. */
export function planSummary(p: MediaPlan): string {
  const def = OBJECTIFS[p.objectif];
  if (!def) return "Plan illisible";
  const ens = p.ensembles.map((e) => `${e.nom} ${e.part} %${e.advantage ? " (Advantage+)" : ""}`).join(", ");
  return `${def.label}, optimisé sur ${OPTIMISATIONS[p.optimisation]?.label.toLowerCase() ?? p.optimisation} — ${ens}`;
}
