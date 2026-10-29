/**
 * Le verdict d'un test A/B, calculé par le CODE (plan Publicité, §9 quinquies
 * §3, règles 1 et 2) : le modèle interprète un verdict, il ne le fabrique pas.
 *
 * Pour chaque métrique, une loi a posteriori par variante :
 *  - taux de clic : Bêta(1 + clics, 1 + impressions − clics) ;
 *  - coût par lead, par lead qualifié, par vue de la page : un taux par euro
 *    dépensé, Gamma(1 + résultats, dépense) — plus il est haut, moins le
 *    résultat coûte.
 * La probabilité que la meilleure variante soit VRAIMENT la meilleure se tire
 * par simulation, avec un générateur à graine fixe : les mêmes chiffres donnent
 * toujours le même verdict.
 *
 * Pas de verdict sous le volume ni sous la durée minimum (« en attente de
 * volume ») ; au-delà de la durée maximale, le test se clôt « sans verdict »
 * plutôt que de tourner indéfiniment. Gagnant à 95 % et plus (« forte ») dès
 * que le volume est là ; à 80 % (« moyenne ») seulement après deux fois la
 * durée minimum — s'arrêter au premier regard favorable, c'est conclure au
 * hasard.
 *
 * Pure.
 */

export const TEST_METRICS = [
  { label: "Coût par lead qualifié", value: "cpl-qualifie" },
  { label: "Coût par lead", value: "cpl" },
  { label: "Coût par vue de la page", value: "cout-par-vue" },
  { label: "Taux de clic vers le site", value: "ctr" },
] as const;
export type TestMetric = (typeof TEST_METRICS)[number]["value"];

/** Volume minimum par variante, selon ce qu'on compte (décision 1 du 29/09/2026 : 50 leads). */
export const MIN_RESULTS: Record<TestMetric, number> = { "cpl-qualifie": 20, cpl: 50, "cout-par-vue": 100, ctr: 30 };
export const MIN_DAYS: Record<TestMetric, number> = { "cpl-qualifie": 14, cpl: 7, "cout-par-vue": 7, ctr: 7 };
export const MAX_DAYS = 42;
const SAMPLES = 20_000;

export type VariantData = { label: string; spend: number; impressions: number; linkClicks: number; landingViews: number; leads: number; qualifiedLeads: number };

/** Ce qui se compte pour la métrique : le « résultat » d'une variante. */
export const resultsOf = (v: VariantData, m: TestMetric): number =>
  m === "ctr" ? v.linkClicks : m === "cout-par-vue" ? v.landingViews : m === "cpl" ? v.leads : v.qualifiedLeads;

/** La valeur lisible de la métrique (coût en €, ou taux en %). */
export function metricValue(v: VariantData, m: TestMetric): number | null {
  if (m === "ctr") return v.impressions > 0 ? Math.round((v.linkClicks / v.impressions) * 10_000) / 100 : null;
  const n = resultsOf(v, m);
  return n > 0 ? Math.round((v.spend / n) * 100) / 100 : null;
}

/* ─── Simulation, déterministe ─────────────────────────────────────────── */

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) + 0.5) / 4_294_967_296;
  };
}
function normal(u: () => number): number {
  return Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}
/** Gamma(forme, 1) — Marsaglia et Tsang ; forme < 1 par le relèvement classique. */
function gamma(shape: number, u: () => number): number {
  if (shape < 1) return gamma(shape + 1, u) * Math.pow(u(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      x = normal(u);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const w = u();
    if (w < 1 - 0.0331 * x ** 4 || Math.log(w) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Pour chaque variante, la probabilité d'être la meilleure. */
export function winProbabilities(variants: VariantData[], m: TestMetric, seed = 42): number[] {
  const u = rng(seed);
  const wins = new Array(variants.length).fill(0);
  for (let i = 0; i < SAMPLES; i++) {
    let best = -1;
    let bestValue = -Infinity;
    variants.forEach((v, k) => {
      let draw: number;
      if (m === "ctr") {
        const a = gamma(1 + v.linkClicks, u);
        const b = gamma(1 + Math.max(0, v.impressions - v.linkClicks), u);
        draw = a / (a + b);
      } else {
        // Résultats par euro : plus haut = moins cher.
        draw = gamma(1 + resultsOf(v, m), u) / Math.max(v.spend, 0.01);
      }
      if (draw > bestValue) {
        bestValue = draw;
        best = k;
      }
    });
    wins[best]++;
  }
  return wins.map((w) => Math.round((w / SAMPLES) * 1000) / 1000);
}

export type Verdict =
  | { status: "en-attente-de-volume"; reason: string; probabilities: number[] }
  | { status: "conclu"; winner: number; probability: number; confidence: "forte" | "moyenne"; probabilities: number[] }
  | { status: "en-cours"; reason: string; probabilities: number[] }
  | { status: "sans-verdict"; reason: string; probabilities: number[] };

/**
 * Le verdict d'un test, `days` jours après son ouverture. `minResults` et
 * `minDays` par défaut ceux de la métrique.
 */
export function judgeTest(variants: VariantData[], m: TestMetric, days: number, opts: { minResults?: number; minDays?: number; maxDays?: number } = {}): Verdict {
  const minResults = opts.minResults ?? MIN_RESULTS[m];
  const minDays = opts.minDays ?? MIN_DAYS[m];
  const maxDays = opts.maxDays ?? MAX_DAYS;
  const probabilities = variants.length >= 2 ? winProbabilities(variants, m) : [];
  const short = variants.filter((v) => resultsOf(v, m) < minResults);
  const tooLong = days >= maxDays;

  if (days < minDays || short.length) {
    const reason = days < minDays ? `${days} jour(s) sur ${minDays} au minimum` : `pas assez de volume : ${short.map((v) => `${v.label} ${resultsOf(v, m)}/${minResults}`).join(", ")}`;
    if (tooLong) return { status: "sans-verdict", reason: `${maxDays} jours écoulés, ${reason}`, probabilities };
    return { status: "en-attente-de-volume", reason, probabilities };
  }
  const p = Math.max(...probabilities);
  const winner = probabilities.indexOf(p);
  if (p >= 0.95) return { status: "conclu", winner, probability: p, confidence: "forte", probabilities };
  // À 80 %, on ne s'arrête pas au premier regard (le hasard y passe souvent) : il faut avoir tenu deux fois la durée minimum.
  if (p >= 0.8 && (tooLong || days >= 2 * minDays)) return { status: "conclu", winner, probability: p, confidence: "moyenne", probabilities };
  if (tooLong) return { status: "sans-verdict", reason: `${maxDays} jours écoulés, aucune variante ne se détache (meilleure à ${Math.round(p * 100)} %)`, probabilities };
  return { status: "en-cours", reason: `meilleure variante à ${Math.round(p * 100)} %, on attend de franchir 95 %`, probabilities };
}
