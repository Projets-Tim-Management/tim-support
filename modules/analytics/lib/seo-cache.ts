/**
 * Ce que rend une source SEO externe : ses données, ou POURQUOI elle n'en a
 * pas — une variable manquante (à connecter) n'est pas une panne (à réparer),
 * et l'écran ne les dit pas de la même façon. Jamais de chiffre de secours :
 * une carte vide vaut mieux qu'un chiffre inventé.
 */
export type SourceResult<T> =
  | { status: "ok"; data: T; fetchedAt: string }
  | { status: "missing"; missing: string[] }
  | { status: "error"; message: string };

export const missingEnv = (names: string[]) => names.filter((n) => !process.env[n]?.trim());

/**
 * Un cache mémoire, par instance serveur. Search Console a 2 à 3 jours de
 * retard et PageSpeed ne bouge pas d'une heure à l'autre : relire leurs API à
 * chaque ouverture de l'écran brûlerait le quota pour rien. Une instance
 * froide relit — c'est le pire cas, et il est acceptable.
 */
const store = new Map<string, { at: number; value: unknown }>();
/** Au-delà, une entrée est morte quelle que soit sa durée : le plus long des TTL est d'un jour. */
const MAX_AGE_MS = 24 * 3600_000;
let lastSweep = 0;

/**
 * Les clés portent le jour (ou l'heure) : sans ménage, une instance chaude
 * gardait chaque jour de nouvelles entrées, jamais rendues. Un passage par
 * heure au plus retire ce qui a dépassé le plus long des TTL.
 */
function sweep(now: number) {
  if (now - lastSweep < 3600_000) return;
  lastSweep = now;
  for (const [k, v] of store) if (now - v.at > MAX_AGE_MS) store.delete(k);
}
/**
 * Les chargements en cours : deux ouvertures de l'écran pendant qu'un audit
 * tourne attendent le même résultat au lieu de relancer les appels — ce qui
 * doublait la charge et déclenchait la limite de débit de Google (429).
 */
const inflight = new Map<string, Promise<unknown>>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < ttlMs) return hit.value as T;
  if (hit) store.delete(key);
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = load()
    .then((value) => {
      sweep(Date.now());
      store.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/**
 * Le chargement d'une source, d'un bout à l'autre : variables manquantes
 * (« à connecter »), cache, réussite datée, ou panne dite en une phrase.
 * Les cinq connecteurs le faisaient chacun à la main.
 */
export async function loadSource<T>(env: string[], key: string, ttlMs: number, load: () => Promise<T>): Promise<SourceResult<T>> {
  const missing = missingEnv(env);
  if (missing.length) return { status: "missing", missing };
  try {
    return await cached(key, ttlMs, async () => ({ status: "ok" as const, data: await load(), fetchedAt: new Date().toISOString() }));
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/** Une réponse HTTP refusée, en une phrase. */
export async function httpError(res: Response, source: string): Promise<Error> {
  const body = await res.text().catch(() => "");
  const detail = body.match(/"message"\s*:\s*"([^"]+)"/)?.[1] ?? body.slice(0, 160);
  const why =
    res.status === 401 || res.status === 403
      ? "accès refusé — la clé est invalide, ou le compte n'a pas le droit sur ce site"
      : res.status === 429
        ? "quota dépassé"
        : `erreur ${res.status}`;
  return new Error(`${source} : ${why}${detail ? ` (${detail})` : ""}.`);
}
