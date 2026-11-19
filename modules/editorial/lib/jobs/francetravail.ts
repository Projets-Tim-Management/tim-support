/**
 * CLIENT FRANCE TRAVAIL des fiches métier : portage de tim-management/francetravail.py.
 *
 * - API « Marché du travail » (stats-offres-demandes-emploi v1) : salaires médians, offres sur
 *   12 mois, demandeurs d'emploi, tension de recrutement.
 * - API « Offres d'emploi » v2 : fourchette de salaire des offres réelles (10e-90e percentile).
 * Authentification OAuth2 client_credentials, FT_CLIENT_ID / FT_CLIENT_SECRET. Jeton gardé en
 * mémoire jusqu'à son expiration (moins 60 s), un par scope, comme Python.
 *
 * Mêmes endpoints, paramètres et lecture des réponses que Python. Les fonctions de lecture
 * (`parse…`) sont pures et testées sur des réponses enregistrées ; les appels réseau prennent un
 * `fetch` injectable. Erreur réseau, HTTP ou réponse illisible → `FtError` (typée).
 *
 * Ajout par rapport à Python : `date_donnees` est lue dans la réponse « offres » (`datMaj`, date de
 * mise à jour de la série), Python la laissait au Sheet (ou à la date du jour).
 */
import { pyRound } from "@/modules/editorial/lib/articles/check/py";

export const FT_TOKEN_URL = "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";
export const FT_SCOPE = "api_stats-offres-demandes-emploiv1 offresetdemandesemploi";
export const FT_API_BASE = "https://api.francetravail.io/partenaire/stats-offres-demandes-emploi";
export const FT_OFFRES_SCOPE = "api_offresdemploiv2 o2dsoffre";
export const FT_OFFRES_BASE = "https://api.francetravail.io/partenaire/offresdemploi/v2";

/** Échelle de tension France Travail (indicateur PERSPECTIVE, 1 à 5). */
export const TENSION_LABELS: Record<number, string> = { 1: "Très faible", 2: "Faible", 3: "Modérée", 4: "Élevée", 5: "Très élevée" };

/** Chiffres d'une fiche métier (clés de metiers_sheet.py / main_metiers.py). */
export type JobFigures = {
  salaire_median?: number | null;
  salaire_median_moins35?: number | null;
  salaire_median_plus35?: number | null;
  fourchette_min?: number | null;
  fourchette_max?: number | null;
  fourchette_part?: number | null;
  offres_12m?: number | null;
  demandeurs?: number | null;
  tension?: string | null;
  /** AAAA-MM-JJ : date des données (source affichée sur la fiche). */
  date_donnees?: string | null;
};

export type FtErrorKind = "config" | "network" | "http" | "parse";

export class FtError extends Error {
  constructor(
    message: string,
    readonly kind: FtErrorKind,
    readonly endpoint: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "FtError";
  }
}

export type FtDeps = {
  fetch?: typeof fetch;
  env?: Record<string, string | undefined>;
  /** Horloge en millisecondes (tests). */
  now?: () => number;
};

const envOf = (deps?: FtDeps) => deps?.env ?? process.env;

export function isFtConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.FT_CLIENT_ID && env.FT_CLIENT_SECRET);
}

// ── Lecture des réponses (pures) ─────────────────────────────────────────────

type Json = Record<string, unknown>;
const isObj = (x: unknown): x is Json => typeof x === "object" && x !== null && !Array.isArray(x);
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

/** `round(x)` de Python (au pair, sur la valeur exacte) : `round(2.5) == 2`. */
const pyRoundInt = (x: number): number => pyRound(x);

export type FtToken = { value: string; expiresAt: number };

/** Réponse du jeton → valeur et expiration (secondes, `expires_in` par défaut 1400, moins 60 s). */
export function parseTokenResponse(data: unknown, nowSeconds: number): FtToken {
  if (!isObj(data) || typeof data.access_token !== "string" || !data.access_token) {
    throw new FtError("Jeton France Travail absent de la réponse", "parse", FT_TOKEN_URL);
  }
  const expiresIn = data.expires_in == null ? 1400 : Math.trunc(Number(data.expires_in));
  return { value: data.access_token, expiresAt: nowSeconds + expiresIn - 60 };
}

const SALAIRE_RE = /de\s*([\d.]+)\s*Euros?\s*(?:à|a)\s*([\d.]+)/;

/** « Annuel de 22404 Euros à 27000 Euros… » → salaire mensuel médian de l'offre (null si illisible). */
export function parseSalaireMensuel(libelle: string | null | undefined): number | null {
  if (!libelle) return null;
  const m = SALAIRE_RE.exec(libelle);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null; // float("1.2.3") lève en Python
  const mid = (a + b) / 2;
  const low = libelle.toLowerCase();
  if (low.includes("annuel")) return mid / 12;
  if (low.includes("horaire")) return mid * 151.67; // heures mensuelles légales
  if (low.includes("mensuel")) return mid;
  return null;
}

/** Salaires mensuels retenus d'une page d'offres (`resultats`), bornés à ]1000, 8000[ comme Python. */
export function offerSalaries(page: unknown): number[] {
  const out: number[] = [];
  for (const o of arr(isObj(page) ? page.resultats : undefined)) {
    const salaire = isObj(o) && isObj(o.salaire) ? o.salaire : {};
    const v = parseSalaireMensuel(typeof salaire.libelle === "string" ? salaire.libelle : null);
    if (v && v > 1000 && v < 8000) out.push(v);
  }
  return out;
}

export type FourchetteOffres = { fourchette_min: number; fourchette_max: number; fourchette_part: number };

/** 10e et 90e percentiles (« 80 % des offres »), arrondis à la dizaine ; null sous 30 valeurs. */
export function computeFourchette(values: readonly number[]): FourchetteOffres | null {
  if (values.length < 30) return null;
  const vals = [...values].sort((a, b) => a - b);
  const n = vals.length;
  const pct = (q: number) => vals[Math.trunc(q * (n - 1))];
  return {
    fourchette_min: pyRoundInt(pct(0.1) / 10) * 10,
    fourchette_max: pyRoundInt(pct(0.9) / 10) * 10,
    fourchette_part: 80,
  };
}

/** Valeur principale (nombre) de la période la plus récente (`_latest_principal`). */
export function latestPrincipal(data: unknown): number | null {
  const vals = arr(isObj(data) ? data.listeValeursParPeriode : undefined);
  if (!vals.length || !isObj(vals[0])) return null;
  const v = vals[0].valeurPrincipaleNombre;
  return typeof v === "number" ? v : null;
}

/** Valeur principale de la dernière période pour un code de nomenclature (`_value_by_nomenclature`). */
export function valueByNomenclature(data: unknown, codeNomenclature: string): number | null {
  for (const v of arr(isObj(data) ? data.listeValeursParPeriode : undefined)) {
    if (isObj(v) && v.codeNomenclature === codeNomenclature) {
      return typeof v.valeurPrincipaleNombre === "number" ? v.valeurPrincipaleNombre : null;
    }
  }
  return null;
}

/** Date de mise à jour (`datMaj`, AAAA-MM-JJ) de la valeur d'une nomenclature, sinon de la 1re valeur. */
export function dataDate(data: unknown, codeNomenclature?: string): string | null {
  const vals = arr(isObj(data) ? data.listeValeursParPeriode : undefined).filter(isObj);
  const row = (codeNomenclature && vals.find((v) => v.codeNomenclature === codeNomenclature)) || vals[0];
  const d = row?.datMaj;
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : null;
}

/** Niveau de tension (1-5) → libellé ; null hors échelle. */
export function parseTension(data: unknown): string | null {
  const lvl = valueByNomenclature(data, "PERSPECTIVE");
  return lvl != null && Object.prototype.hasOwnProperty.call(TENSION_LABELS, lvl) ? TENSION_LABELS[lvl] : null;
}

/**
 * `difflib.SequenceMatcher(None, a, b).ratio()` de Python (sans fonction junk, autojunk compris).
 * Sert à choisir la FAP dont le libellé ressemble le plus au métier.
 */
export function sequenceRatio(aStr: string, bStr: string): number {
  const a = Array.from(aStr);
  const b = Array.from(bStr);
  const b2j = new Map<string, number[]>();
  b.forEach((ch, j) => {
    const l = b2j.get(ch);
    if (l) l.push(j);
    else b2j.set(ch, [j]);
  });
  if (b.length >= 200) {
    const ntest = Math.trunc(b.length / 100) + 1;
    for (const [ch, idx] of [...b2j]) if (idx.length > ntest) b2j.delete(ch);
  }
  const longest = (alo: number, ahi: number, blo: number, bhi: number): [number, number, number] => {
    let besti = alo;
    let bestj = blo;
    let bestsize = 0;
    let j2len = new Map<number, number>();
    for (let i = alo; i < ahi; i++) {
      const next = new Map<number, number>();
      for (const j of b2j.get(a[i]) ?? []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) ?? 0) + 1;
        next.set(j, k);
        if (k > bestsize) [besti, bestj, bestsize] = [i - k + 1, j - k + 1, k];
      }
      j2len = next;
    }
    while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) [besti, bestj, bestsize] = [besti - 1, bestj - 1, bestsize + 1];
    while (besti + bestsize < ahi && bestj + bestsize < bhi && a[besti + bestsize] === b[bestj + bestsize]) bestsize++;
    return [besti, bestj, bestsize];
  };
  let matches = 0;
  const queue: Array<[number, number, number, number]> = [[0, a.length, 0, b.length]];
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop()!;
    const [i, j, k] = longest(alo, ahi, blo, bhi);
    if (!k) continue;
    matches += k;
    if (alo < i && blo < j) queue.push([alo, i, blo, j]);
    if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
  }
  const total = a.length + b.length;
  return total ? (2 * matches) / total : 1;
}

/**
 * Réponse salaire-rome-fap (SAL_3) → médianes : SAL3 = tous âges, SAL1 = moins de 35 ans,
 * SAL2 = 35 ans et plus. Une ligne par FAP rattachée au ROME : on garde celle dont le libellé
 * ressemble le plus au métier (la première en cas d'égalité, comme `max` de Python).
 */
export function parseSalaires(data: unknown, metierLabel = ""): JobFigures {
  const rows = arr(isObj(data) ? data.valeursParPeriode : undefined).filter(isObj);
  if (!rows.length) return {};
  let chosen = rows[0];
  if (rows.length > 1 && metierLabel) {
    let best = -1;
    for (const r of rows) {
      const score = sequenceRatio(String(r.libActivite ?? "").toLowerCase(), metierLabel.toLowerCase());
      if (score > best) [best, chosen] = [score, r];
    }
  }
  const montants = new Map<unknown, unknown>();
  for (const m of arr(chosen.salaireValeurMontant)) if (isObj(m)) montants.set(m.codeNomenclature, m.valeurPrincipaleMontant);
  const out: JobFigures = {};
  const num = (k: string) => {
    const v = montants.get(k);
    return typeof v === "number" ? pyRoundInt(v) : undefined;
  };
  if (num("SAL3") !== undefined) out.salaire_median = num("SAL3");
  if (num("SAL1") !== undefined) out.salaire_median_moins35 = num("SAL1");
  if (num("SAL2") !== undefined) out.salaire_median_plus35 = num("SAL2");
  return out;
}

// ── Réseau ───────────────────────────────────────────────────────────────────

const tokenCache = new Map<string, FtToken>();

/** Vide le cache des jetons (tests, rotation des identifiants). */
export function clearFtTokenCache(): void {
  tokenCache.clear();
}

async function call(deps: FtDeps | undefined, endpoint: string, init: RequestInit): Promise<Response> {
  const f = deps?.fetch ?? fetch;
  try {
    return await f(endpoint, { ...init, signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    throw new FtError(`France Travail injoignable (${e instanceof Error ? e.name : "erreur"})`, "network", endpoint);
  }
}

async function json(res: Response, endpoint: string): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new FtError(`Réponse France Travail illisible (HTTP ${res.status})`, "parse", endpoint, res.status);
  }
}

async function ok(res: Response, endpoint: string): Promise<unknown> {
  if (!res.ok) throw new FtError(`France Travail : HTTP ${res.status}`, "http", endpoint, res.status);
  return json(res, endpoint);
}

/** Jeton OAuth2 client_credentials pour un scope, en cache jusqu'à expiration. */
export async function getFtToken(scope: string = FT_SCOPE, deps?: FtDeps): Promise<string> {
  const env = envOf(deps);
  if (!isFtConfigured(env)) throw new FtError("France Travail non configuré (FT_CLIENT_ID, FT_CLIENT_SECRET)", "config", FT_TOKEN_URL);
  const now = (deps?.now ?? Date.now)() / 1000;
  const cached = tokenCache.get(scope);
  if (cached && now < cached.expiresAt) return cached.value;
  const res = await call(deps, FT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.FT_CLIENT_ID ?? "",
      client_secret: env.FT_CLIENT_SECRET ?? "",
      scope,
    }).toString(),
  });
  const token = parseTokenResponse(await ok(res, FT_TOKEN_URL), now);
  tokenCache.set(scope, token);
  return token.value;
}

async function statsHeaders(deps?: FtDeps) {
  return { Authorization: `Bearer ${await getFtToken(FT_SCOPE, deps)}`, Accept: "application/json", "Content-Type": "application/json" };
}

/** Corps des POST /v1/indicateur/* (`_post_indicateur`). */
export function indicatorBody(rome: string, periode: string, nomenclature: string) {
  return {
    codeTypeTerritoire: "NAT",
    codeTerritoire: "FR",
    codeTypeActivite: "ROME",
    codeActivite: rome,
    codeTypePeriode: periode,
    codeTypeNomenclature: nomenclature,
    dernierePeriode: true,
  };
}

export async function fetchIndicator(path: string, rome: string, periode: string, nomenclature: string, deps?: FtDeps): Promise<unknown> {
  const endpoint = `${FT_API_BASE}${path}`;
  const res = await call(deps, endpoint, { method: "POST", headers: await statsHeaders(deps), body: JSON.stringify(indicatorBody(rome, periode, nomenclature)) });
  return ok(res, endpoint);
}

/** Salaires médians (SAL_3) d'un code ROME. */
export async function fetchSalaires(rome: string, metierLabel = "", deps?: FtDeps): Promise<JobFigures> {
  const endpoint = `${FT_API_BASE}/v1/indicateur/salaire-rome-fap/NAT/FR?${new URLSearchParams({ codeRome: rome })}`;
  const res = await call(deps, endpoint, { method: "GET", headers: await statsHeaders(deps) });
  return parseSalaires(await ok(res, endpoint), metierLabel);
}

/**
 * Fourchette de salaire des offres réelles du ROME (pages de 150, 6 au plus). Une page en
 * HTTP autre que 200/206 (204 = plus d'offre) arrête la lecture sans erreur, comme Python.
 */
export async function fetchFourchetteOffres(rome: string, maxPages = 6, deps?: FtDeps): Promise<FourchetteOffres | null> {
  if (!isFtConfigured(envOf(deps)) || !rome) return null;
  const headers = { Authorization: `Bearer ${await getFtToken(FT_OFFRES_SCOPE, deps)}`, Accept: "application/json" };
  const vals: number[] = [];
  for (let start = 0; start < maxPages * 150; start += 150) {
    const endpoint = `${FT_OFFRES_BASE}/offres/search?${new URLSearchParams({ codeROME: rome, range: `${start}-${start + 149}` })}`;
    const res = await call(deps, endpoint, { method: "GET", headers });
    if (res.status !== 200 && res.status !== 206) break;
    const page = await json(res, endpoint);
    const results = arr(isObj(page) ? page.resultats : undefined);
    if (!results.length) break;
    vals.push(...offerSalaries(page));
    if (results.length < 150) break;
  }
  return computeFourchette(vals);
}

export type FtFetchResult = { figures: JobFigures; errors: FtError[] };

const asFtError = (e: unknown, endpoint: string): FtError =>
  e instanceof FtError ? e : new FtError(e instanceof Error ? e.message : String(e), "parse", endpoint);

/**
 * Tous les indicateurs d'un ROME (`fetch_indicators`). Ne lève jamais : chaque indicateur est
 * indépendant, ses erreurs sont rendues dans `errors`. Non configuré ou ROME vide → rien.
 */
export async function fetchJobFigures(rome: string, metierLabel = "", deps?: FtDeps): Promise<FtFetchResult> {
  const figures: JobFigures = {};
  const errors: FtError[] = [];
  if (!isFtConfigured(envOf(deps)) || !rome) return { figures, errors };
  const step = async (endpoint: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      errors.push(asFtError(e, endpoint));
    }
  };
  await step("salaires", async () => {
    Object.assign(figures, await fetchSalaires(rome, metierLabel, deps));
  });
  await step("/v1/indicateur/stat-offres", async () => {
    const d = await fetchIndicator("/v1/indicateur/stat-offres", rome, "TRIMESTRE", "ORIGINEOFF", deps);
    const n = valueByNomenclature(d, "TOFF-CUMUL12MOIS");
    if (n != null) figures.offres_12m = n;
    const date = dataDate(d, "TOFF-CUMUL12MOIS");
    if (date) figures.date_donnees = date;
  });
  await step("/v1/indicateur/stat-demandeurs-entrant", async () => {
    const d = await fetchIndicator("/v1/indicateur/stat-demandeurs-entrant", rome, "TRIMESTRE", "CATCAND", deps);
    const n = valueByNomenclature(d, "CUMUL 12 MOIS");
    if (n != null) figures.demandeurs = n;
  });
  await step("/v1/indicateur/stat-perspective-employeur", async () => {
    const d = await fetchIndicator("/v1/indicateur/stat-perspective-employeur", rome, "ANNEE", "TYPE_TENSION", deps);
    const t = parseTension(d);
    if (t) figures.tension = t;
  });
  await step("offres/search", async () => {
    const f = await fetchFourchetteOffres(rome, 6, deps);
    if (f) Object.assign(figures, f);
  });
  return { figures, errors };
}
