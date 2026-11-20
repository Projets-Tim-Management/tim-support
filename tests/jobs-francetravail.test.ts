/**
 * Client France Travail des fiches métier (portage de tim-management/francetravail.py).
 * Aucun test Python n'existait pour ce module : attentes calculées avec le code Python
 * (parse des libellés de salaire, percentiles, difflib) sur les mêmes entrées.
 * Aucun appel réel : `fetch` injecté.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  FT_API_BASE,
  FT_OFFRES_BASE,
  FT_OFFRES_SCOPE,
  FT_SCOPE,
  FT_TOKEN_URL,
  FtError,
  clearFtTokenCache,
  computeFourchette,
  dataDate,
  fetchFourchetteOffres,
  fetchJobFigures,
  fetchSalaires,
  getFtToken,
  indicatorBody,
  isFtConfigured,
  latestPrincipal,
  offerSalaries,
  parseSalaireMensuel,
  parseSalaires,
  parseTension,
  parseTokenResponse,
  sequenceRatio,
  valueByNomenclature,
} from "@/modules/editorial/lib/jobs/francetravail";

import { FT_OFFRES_PAGE, FT_SALAIRES, FT_STAT_DEMANDEURS, FT_STAT_OFFRES, FT_STAT_TENSION, FT_TOKEN } from "./jobs-fixtures";

const ENV = { FT_CLIENT_ID: "id-test", FT_CLIENT_SECRET: "secret-test" };

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

/** Faux serveur France Travail : route par URL, garde chaque appel. */
function fakeFetch(routes: (c: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const c: Call = { url: String(input), method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body as string | undefined };
    calls.push(c);
    return routes(c);
  }) as typeof fetch;
  return { f, calls };
}

const offersPage = (n: number, libelle = "Mensuel de 2000 Euros à 2200 Euros sur 12 mois") => ({
  resultats: Array.from({ length: n }, (_, i) => ({ id: String(i), salaire: { libelle } })),
});

function defaultRoutes(c: Call): Response {
  if (c.url === FT_TOKEN_URL) return jsonResponse(FT_TOKEN);
  if (c.url.startsWith(`${FT_API_BASE}/v1/indicateur/salaire-rome-fap/NAT/FR`)) return jsonResponse(FT_SALAIRES);
  if (c.url === `${FT_API_BASE}/v1/indicateur/stat-offres`) return jsonResponse(FT_STAT_OFFRES);
  if (c.url === `${FT_API_BASE}/v1/indicateur/stat-demandeurs-entrant`) return jsonResponse(FT_STAT_DEMANDEURS);
  if (c.url === `${FT_API_BASE}/v1/indicateur/stat-perspective-employeur`) return jsonResponse(FT_STAT_TENSION);
  if (c.url.startsWith(`${FT_OFFRES_BASE}/offres/search`)) {
    const range = new URL(c.url).searchParams.get("range");
    if (range === "0-149") return jsonResponse(offersPage(150, "Mensuel de 1900 Euros à 2100 Euros"), 206);
    if (range === "150-299") return jsonResponse(offersPage(20, "Mensuel de 2200 Euros à 2400 Euros"), 206);
  }
  return new Response("", { status: 404 });
}

beforeEach(() => clearFtTokenCache());

describe("configuration", () => {
  it("isFtConfigured demande les deux identifiants", () => {
    expect(isFtConfigured({})).toBe(false);
    expect(isFtConfigured({ FT_CLIENT_ID: "a" })).toBe(false);
    expect(isFtConfigured(ENV)).toBe(true);
  });

  it("non configuré : fetchJobFigures ne fait aucun appel et ne rend rien (comme Python)", async () => {
    const { f, calls } = fakeFetch(defaultRoutes);
    expect(await fetchJobFigures("F1710", "", { fetch: f, env: {} })).toEqual({ figures: {}, errors: [] });
    expect(await fetchJobFigures("", "", { fetch: f, env: ENV })).toEqual({ figures: {}, errors: [] });
    expect(calls).toEqual([]);
  });

  it("getFtToken sans identifiants : FtError « config »", async () => {
    await expect(getFtToken(FT_SCOPE, { env: {} })).rejects.toMatchObject({ kind: "config" });
  });
});

describe("lecture des réponses", () => {
  it("parseTokenResponse : expiration = maintenant + expires_in - 60, défaut 1400", () => {
    expect(parseTokenResponse(FT_TOKEN, 1000)).toEqual({ value: "jeton-test", expiresAt: 1000 + 1499 - 60 });
    expect(parseTokenResponse({ access_token: "x" }, 0)).toEqual({ value: "x", expiresAt: 1340 });
    expect(() => parseTokenResponse({}, 0)).toThrow(FtError);
  });

  it("parseSalaireMensuel : annuel /12, horaire × 151,67, mensuel tel quel (valeurs de Python)", () => {
    expect(parseSalaireMensuel("Annuel de 22404 Euros à 27000 Euros sur 12 mois")).toBe(2058.5);
    expect(parseSalaireMensuel("Mensuel de 1900.0 Euros à 2100.0 Euros sur 12 mois")).toBe(2000);
    expect(parseSalaireMensuel("Horaire de 11.88 Euros à 12.50 Euros sur 12 mois")).toBeCloseTo(1848.8573, 6);
    expect(parseSalaireMensuel("Annuel de 9000 Euros à 10000 Euros")).toBeCloseTo(791.6667, 3);
    expect(parseSalaireMensuel("Mensuel de 1800 Euros")).toBeNull();
    expect(parseSalaireMensuel("Selon profil")).toBeNull();
    expect(parseSalaireMensuel("")).toBeNull();
    expect(parseSalaireMensuel(null)).toBeNull();
  });

  it("offerSalaries : garde les salaires lisibles entre 1000 et 8000", () => {
    const v = offerSalaries(FT_OFFRES_PAGE);
    expect(v).toHaveLength(3);
    expect(v[0]).toBe(2058.5);
    expect(v[1]).toBe(2000);
    expect(offerSalaries({})).toEqual([]);
  });

  it("computeFourchette : percentiles 10/90 arrondis à la dizaine, null sous 30 offres (valeurs de Python)", () => {
    const vals = Array.from({ length: 41 }, (_, i) => 1500 + i * 37.3);
    expect(computeFourchette(vals.reverse())).toEqual({ fourchette_min: 1650, fourchette_max: 2840, fourchette_part: 80 });
    expect(computeFourchette(vals.slice(0, 29))).toBeNull();
    // arrondi au pair de Python : round(192.5) = 192, round(193.5) = 194
    expect(computeFourchette(Array(30).fill(1925))).toMatchObject({ fourchette_min: 1920, fourchette_max: 1920 });
    expect(computeFourchette(Array(30).fill(1935))).toMatchObject({ fourchette_min: 1940 });
  });

  it("valueByNomenclature / latestPrincipal / dataDate / parseTension", () => {
    expect(valueByNomenclature(FT_STAT_OFFRES, "TOFF-CUMUL12MOIS")).toBe(640);
    expect(valueByNomenclature(FT_STAT_DEMANDEURS, "CUMUL 12 MOIS")).toBe(80);
    expect(valueByNomenclature(FT_STAT_DEMANDEURS, "ABSENT")).toBeNull();
    expect(valueByNomenclature({}, "X")).toBeNull();
    expect(latestPrincipal(FT_STAT_OFFRES)).toBe(170);
    expect(latestPrincipal({ listeValeursParPeriode: [] })).toBeNull();
    expect(dataDate(FT_STAT_OFFRES, "TOFF-CUMUL12MOIS")).toBe("2026-10-16");
    expect(dataDate(FT_STAT_OFFRES)).toBe("2026-10-15");
    expect(dataDate(FT_STAT_DEMANDEURS)).toBeNull();
    expect(parseTension(FT_STAT_TENSION)).toBe("Modérée");
    expect(parseTension({ listeValeursParPeriode: [{ codeNomenclature: "PERSPECTIVE", valeurPrincipaleNombre: 5 }] })).toBe("Très élevée");
    expect(parseTension({ listeValeursParPeriode: [{ codeNomenclature: "PERSPECTIVE", valeurPrincipaleNombre: 7 }] })).toBeNull();
  });

  it("sequenceRatio = difflib.SequenceMatcher(None, a, b).ratio()", () => {
    expect(sequenceRatio("magasiniers qualifiés", "magasinier en négoce des matériaux")).toBeCloseTo(0.4727272727272727, 12);
    expect(sequenceRatio("ouvriers qualifiés de la manutention", "magasinier en négoce des matériaux")).toBeCloseTo(0.34285714285714286, 12);
    expect(sequenceRatio("charpentiers (bois)", "charpentier / charpentière")).toBeCloseTo(0.5777777777777777, 12);
    expect(sequenceRatio("abc", "")).toBe(0);
    expect(sequenceRatio("", "")).toBe(1);
  });

  it("parseSalaires : FAP la plus proche du métier, médianes arrondies (SAL3/SAL1/SAL2)", () => {
    expect(parseSalaires(FT_SALAIRES, "Magasinier en négoce des matériaux")).toEqual({
      salaire_median: 2189,
      salaire_median_moins35: 2141,
      salaire_median_plus35: 2254,
    });
    // sans libellé : la première ligne
    expect(parseSalaires(FT_SALAIRES, "")).toEqual({ salaire_median: 2050, salaire_median_moins35: 1990, salaire_median_plus35: 2121 });
    expect(parseSalaires({ valeursParPeriode: [] })).toEqual({});
    // round() de Python : au pair
    const one = (v: number) => ({ valeursParPeriode: [{ salaireValeurMontant: [{ codeNomenclature: "SAL3", valeurPrincipaleMontant: v }] }] });
    expect(parseSalaires(one(2188.5))).toEqual({ salaire_median: 2188 });
    expect(parseSalaires(one(2189.5))).toEqual({ salaire_median: 2190 });
  });

  it("indicatorBody : corps des POST /v1/indicateur/*", () => {
    expect(indicatorBody("F1710", "TRIMESTRE", "ORIGINEOFF")).toEqual({
      codeTypeTerritoire: "NAT",
      codeTerritoire: "FR",
      codeTypeActivite: "ROME",
      codeActivite: "F1710",
      codeTypePeriode: "TRIMESTRE",
      codeTypeNomenclature: "ORIGINEOFF",
      dernierePeriode: true,
    });
  });
});

describe("appels (fetch simulé)", () => {
  it("jeton : POST form client_credentials, un par scope, gardé jusqu'à expiration", async () => {
    let now = 1_000_000;
    const { f, calls } = fakeFetch(defaultRoutes);
    const deps = { fetch: f, env: ENV, now: () => now };
    expect(await getFtToken(FT_SCOPE, deps)).toBe("jeton-test");
    await getFtToken(FT_SCOPE, deps);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(Object.fromEntries(new URLSearchParams(calls[0].body))).toEqual({
      grant_type: "client_credentials",
      client_id: "id-test",
      client_secret: "secret-test",
      scope: FT_SCOPE,
    });
    await getFtToken(FT_OFFRES_SCOPE, deps);
    expect(calls).toHaveLength(2);
    now += (1499 - 60) * 1000; // expiré
    await getFtToken(FT_SCOPE, deps);
    expect(calls).toHaveLength(3);
  });

  it("fetchSalaires : GET avec codeRome et jeton Bearer", async () => {
    const { f, calls } = fakeFetch(defaultRoutes);
    expect(await fetchSalaires("F1710", "Magasinier", { fetch: f, env: ENV })).toMatchObject({ salaire_median: 2189 });
    const c = calls[1];
    expect(c.url).toBe(`${FT_API_BASE}/v1/indicateur/salaire-rome-fap/NAT/FR?codeRome=F1710`);
    expect(c.headers).toEqual({ Authorization: "Bearer jeton-test", Accept: "application/json", "Content-Type": "application/json" });
  });

  it("fetchFourchetteOffres : pages de 150 jusqu'à une page incomplète", async () => {
    const { f, calls } = fakeFetch(defaultRoutes);
    expect(await fetchFourchetteOffres("F1710", 6, { fetch: f, env: ENV })).toEqual({ fourchette_min: 2000, fourchette_max: 2300, fourchette_part: 80 });
    const pages = calls.filter((c) => c.url.startsWith(FT_OFFRES_BASE)).map((c) => new URL(c.url).searchParams.get("range"));
    expect(pages).toEqual(["0-149", "150-299"]);
    expect(new URL(calls[1].url).searchParams.get("codeROME")).toBe("F1710");
    expect(Object.fromEntries(new URLSearchParams(calls[0].body)).scope).toBe(FT_OFFRES_SCOPE);
  });

  it("fetchFourchetteOffres : HTTP 204 (plus d'offre) arrête sans erreur ; moins de 30 offres → null", async () => {
    const { f } = fakeFetch((c) => (c.url === FT_TOKEN_URL ? jsonResponse(FT_TOKEN) : new Response(null, { status: 204 })));
    expect(await fetchFourchetteOffres("F1710", 6, { fetch: f, env: ENV })).toBeNull();
  });

  it("fetchJobFigures : tous les indicateurs, comme fetch_indicators", async () => {
    const { f, calls } = fakeFetch(defaultRoutes);
    const res = await fetchJobFigures("F1710", "Magasinier en négoce des matériaux", { fetch: f, env: ENV });
    expect(res.errors).toEqual([]);
    expect(res.figures).toEqual({
      salaire_median: 2189,
      salaire_median_moins35: 2141,
      salaire_median_plus35: 2254,
      offres_12m: 640,
      date_donnees: "2026-10-16",
      demandeurs: 80,
      tension: "Modérée",
      fourchette_min: 2000,
      fourchette_max: 2300,
      fourchette_part: 80,
    });
    const offres = calls.find((c) => c.url.endsWith("/stat-offres"));
    expect(JSON.parse(offres!.body!)).toEqual(indicatorBody("F1710", "TRIMESTRE", "ORIGINEOFF"));
    expect(JSON.parse(calls.find((c) => c.url.endsWith("/stat-demandeurs-entrant"))!.body!)).toMatchObject({ codeTypePeriode: "TRIMESTRE", codeTypeNomenclature: "CATCAND" });
    expect(JSON.parse(calls.find((c) => c.url.endsWith("/stat-perspective-employeur"))!.body!)).toMatchObject({ codeTypePeriode: "ANNEE", codeTypeNomenclature: "TYPE_TENSION" });
    expect(calls.filter((c) => c.url === FT_TOKEN_URL)).toHaveLength(2); // un jeton par scope
  });

  it("fetchJobFigures : un indicateur en échec n'empêche pas les autres, erreurs typées", async () => {
    const { f } = fakeFetch((c) => {
      if (c.url.endsWith("/stat-demandeurs-entrant")) return new Response("panne", { status: 503 });
      if (c.url.endsWith("/stat-perspective-employeur")) throw new TypeError("fetch failed");
      if (c.url.startsWith(`${FT_API_BASE}/v1/indicateur/salaire-rome-fap`)) return new Response("<html>", { status: 200 });
      return defaultRoutes(c);
    });
    const res = await fetchJobFigures("F1710", "", { fetch: f, env: ENV });
    expect(res.figures).toMatchObject({ offres_12m: 640, fourchette_min: 2000 });
    expect(res.figures.demandeurs).toBeUndefined();
    expect(res.figures.tension).toBeUndefined();
    expect(res.figures.salaire_median).toBeUndefined();
    expect(res.errors.map((e) => [e.kind, e.status])).toEqual([
      ["parse", 200],
      ["http", 503],
      ["network", undefined],
    ]);
    expect(res.errors.every((e) => e instanceof FtError)).toBe(true);
  });

  it("jeton refusé : erreur http sur chaque indicateur, aucun chiffre", async () => {
    const { f } = fakeFetch((c) => (c.url === FT_TOKEN_URL ? new Response("{}", { status: 401 }) : defaultRoutes(c)));
    const res = await fetchJobFigures("F1710", "", { fetch: f, env: ENV });
    expect(res.figures).toEqual({});
    expect(res.errors).toHaveLength(5);
    expect(res.errors[0]).toMatchObject({ kind: "http", status: 401, endpoint: FT_TOKEN_URL });
  });
});
