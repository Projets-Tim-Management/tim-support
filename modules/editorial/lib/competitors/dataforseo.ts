/**
 * LE TOP 10 DE GOOGLE.FR PAR DATAFORSEO (étape 4, 19/11/2026).
 *
 * Mode « Live advanced » : une requête, la réponse tout de suite. 0,002 $ par tranche
 * de 10 résultats (top 20 relevé : 0,004 $), + 0,00015 $ pour déplier une fois les « Autres questions
 * posées » (tarifs DataForSEO relevés le 19/11/2026). Pas de scraping de Google
 * par nous (contraire à ses conditions) : DataForSEO porte ce risque.
 *
 * Accès : DATAFORSEO_LOGIN et DATAFORSEO_PASSWORD (mot de passe d'API, onglet
 * « API Access » du compte, distinct du mot de passe de connexion).
 */

/** Les 15 premiers résultats naturels (top 20 relevé) : sur les requêtes où Google classe des PDF
 *  et des pages courtes, le top 10 seul donne trop peu de concurrents lisibles (constaté le 19/11/2026). */
export const MAX_RESULTS = 15;
/** France (codes de lieu Google Ads : 2250). */
export const FRANCE = 2250;

export const isDataForSeoConfigured = () => Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);

export type SerpResult = { rank: number; url: string; domain: string; title: string };
export type AiSource = { domain: string; url: string; title: string };
export type Serp = {
  keyword: string;
  /** Les 15 premiers résultats naturels (corpus du comparateur). */
  organic: SerpResult[];
  questions: string[];
  costUsd: number;
  checkUrl: string | null;
  /** Notre position dans le top 20 (null = absent), et la page classée. */
  ourPosition?: number | null;
  ourUrl?: string | null;
  /** La réponse IA de Google (AI Overview) : affichée ? quelles sources cite-t-elle ? */
  aiOverview?: { present: boolean; sources: AiSource[] };
};

/** Notre site. */
export const OUR_DOMAIN = "tim-management.co";

type Raw = Record<string, unknown>;
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : []);

const MASKED = /^https?:\/\/(www\.)?google\.[a-z.]+\/(goto|url)\?/i;
/** Une adresse masquée par Google, à suivre pour connaître la vraie page. Pure. */
export const isMaskedUrl = (u: string) => MASKED.test(u);

function realDomain(i: Raw): string {
  const d = String(i.domain ?? "").replace(/^www\./, "");
  if (!/^google\./.test(d)) return d;
  const name = String(i.website_name ?? "").trim();
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(name)) return name.replace(/^www\./, "").toLowerCase();
  const crumb = /^https?:\/\/([^\s/›]+)/.exec(String(i.breadcrumb ?? ""));
  return crumb ? crumb[1].replace(/^www\./, "").toLowerCase() : d;
}

/** La réponse de DataForSEO dans notre forme. Pure (testée). */
export function parseSerp(keyword: string, json: unknown): Serp {
  const top = (json ?? {}) as Raw;
  const task = arr(top.tasks)[0] ?? {};
  if (Number(top.status_code) !== 20000) throw new Error(`DataForSEO : ${String(top.status_message ?? "réponse illisible")} (code ${String(top.status_code ?? "?")})`);
  if (Number(task.status_code) !== 20000) throw new Error(`DataForSEO : ${String(task.status_message ?? "aucune tâche dans la réponse")} (code ${String(task.status_code ?? "?")})`);
  const result = arr(task.result)[0] ?? {};
  const items = arr(result.items);
  const allOrganic = items
    .filter((i) => i.type === "organic" && typeof i.url === "string")
    // Google masque les adresses (« google.com/goto?url=… », constaté le 19/11/2026) : le vrai
    // domaine est dans `website_name` ; l'adresse est suivie au moment de lire la page.
    .map((i) => ({ rank: Number(i.rank_group ?? i.rank_absolute ?? 0), url: String(i.url), domain: realDomain(i), title: String(i.title ?? "") }));
  const organic = allOrganic.slice(0, MAX_RESULTS);
  const ours = allOrganic.find((o) => o.domain === OUR_DOMAIN || o.domain.endsWith(`.${OUR_DOMAIN}`));
  // Les sources d'une réponse IA : au niveau de la réponse et de chacun de ses éléments.
  const ai = items.filter((i) => i.type === "ai_overview");
  const refs = ai.flatMap((i) => [...arr(i.references), ...arr(i.items).flatMap((el) => arr(el.references))]);
  const sources: AiSource[] = [];
  for (const r of refs) {
    const domain = String(r.domain ?? "").replace(/^www\./, "");
    if (domain && !/^google\./.test(domain) && !sources.some((x) => x.domain === domain && x.url === String(r.url ?? ""))) sources.push({ domain, url: String(r.url ?? ""), title: String(r.title ?? r.source ?? "") });
  }
  const questions = items
    .filter((i) => i.type === "people_also_ask")
    .flatMap((i) => arr(i.items))
    .map((q) => String(q.title ?? "").trim())
    .filter(Boolean);
  return {
    keyword,
    organic,
    questions: [...new Set(questions)],
    costUsd: Number(task.cost ?? top.cost ?? 0),
    checkUrl: (result.check_url as string) ?? null,
    ourPosition: ours?.rank ?? null,
    ourUrl: ours?.url ?? null,
    aiOverview: { present: ai.length > 0, sources },
  };
}

/** Un appel à DataForSEO (une tâche). Rend la réponse brute ; un refus remonte avec son message. */
export async function dfsPost(path: string, task: Raw, fetcher: typeof fetch = fetch, timeoutMs = 60_000): Promise<Raw> {
  if (!isDataForSeoConfigured()) throw new Error("DataForSEO n'est pas branché (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD).");
  const auth = Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString("base64");
  const res = await fetcher(`https://api.dataforseo.com/v3/${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify([task]),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as Raw | null;
  if (!res.ok || !json) throw new Error(`DataForSEO : ${String(json?.status_message ?? `erreur ${res.status}`)} (code ${String(json?.status_code ?? res.status)})`);
  return json;
}

/**
 * Le top 20 de google.fr sur une requête, avec les « Autres questions posées » et la réponse IA
 * chargée en entier (sources citées) : ≈ 0,006 $. Sert au suivi des positions ET au comparateur.
 */
export async function fetchSerp(keyword: string, fetcher: typeof fetch = fetch): Promise<Serp> {
  const json = await dfsPost("serp/google/organic/live/advanced", { keyword, location_code: FRANCE, language_code: "fr", device: "desktop", depth: 20, people_also_ask_click_depth: 1, load_async_ai_overview: true }, fetcher, 90_000);
  return parseSerp(keyword, json);
}
