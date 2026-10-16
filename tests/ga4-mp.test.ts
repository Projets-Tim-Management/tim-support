import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { ga4Change } from "@/modules/analytics/lib/ga4-hook";
import {
  CLAIM_TTL_MS,
  CLOSE_VALUE_WAIT_DAYS,
  decide,
  ga4Body,
  ga4Enabled,
  Ga4NotConfigured,
  ga4Url,
  handleClientChange,
  pendingSends,
  processSend,
  reachedSteps,
  recordReached,
  resumeGa4,
  retryDelayMs,
  sendGa4,
  type Ga4Lead,
} from "@/modules/analytics/lib/ga4-mp";

/**
 * Les étapes commerciales renvoyées à GA4 (plan de mesure, phase 2.2) :
 * `qualify_lead` à la démo programmée, `close_convert_lead` à la signature,
 * notées au passage du statut dans `ga4-sends` (une ligne par opportunité et
 * par étape), envoyées une fois, jamais sans identifiant GA4, jamais à 0 €,
 * jamais sur l'historique, jamais hors production.
 */

const LEAD: Ga4Lead = { gaClientId: "1234567890.1700000000", gaSessionId: "1760345678", formId: "demo", channel: "google-ads", sourcePagePath: "/produits/pointage", landingPath: "/lp/demande-demo" };
const NOW = new Date("2026-10-20T10:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const PROD = { GA4_MEASUREMENT_ID: "G-TEST", GA4_API_SECRET: "secret-de-test", VERCEL_ENV: "production" };

describe("le corps envoyé à GA4", () => {
  it("rattache l'étape à la visite : client_id, session_id et les pages d'origine", () => {
    expect(ga4Body("qualify", LEAD)).toEqual({
      client_id: "1234567890.1700000000",
      events: [{ name: "qualify_lead", params: { engagement_time_msec: 1, session_id: "1760345678", form_id: "demo", channel: "google-ads", source_page: "/produits/pointage", landing_page: "/lp/demande-demo" } }],
    });
  });

  it("la signature porte le CA payé en euros ; sans montant, ni value ni currency ; jamais d'horodatage", () => {
    expect(ga4Body("close", LEAD, 1490)?.events).toEqual([expect.objectContaining({ name: "close_convert_lead", params: expect.objectContaining({ value: 1490, currency: "EUR", session_id: "1760345678" }) })]);
    const noValue = (ga4Body("close", LEAD, null)?.events as { params: Record<string, unknown> }[])[0].params;
    expect(noValue).not.toHaveProperty("value");
    expect(noValue).not.toHaveProperty("currency");
    expect(JSON.stringify(ga4Body("close", LEAD, 10))).not.toMatch(/timestamp_micros/);
  });

  it("sans identifiant GA4, rien : on n'en fabrique jamais", () => {
    expect(ga4Body("qualify", { ...LEAD, gaClientId: null })).toBeNull();
  });
});

describe("les étapes franchies", () => {
  it("démo programmée et au-delà franchissent la démo ; Gagnée franchit aussi la signature", () => {
    expect(reachedSteps("demo-programmee")).toEqual(["qualify"]);
    expect(reachedSteps("en-test")).toEqual(["qualify"]);
    expect(reachedSteps("actif")).toEqual(["qualify", "close"]);
  });

  it("nouvelle, perdue, résiliée, archivée ne franchissent rien", () => {
    for (const s of ["nouvelle", "en-qualification", "attente-longue", "perdue", "resilie", "archive", null]) expect(reachedSteps(s)).toEqual([]);
  });

  it("notées au PASSAGE du statut, jamais sur un brouillon ; un CA payé qui bouge sur une affaire gagnée relance l'envoi", () => {
    expect(ga4Change({ clientStatus: "demo-programmee" }, { clientStatus: "nouvelle" }, "update")).toEqual({ steps: ["qualify"], poke: false });
    expect(ga4Change({ clientStatus: "demo-programmee" }, { clientStatus: "demo-programmee" }, "update")).toEqual({ steps: [], poke: false });
    expect(ga4Change({ clientStatus: "actif", caPaye: 500 }, { clientStatus: "actif", caPaye: 0 }, "update")).toEqual({ steps: [], poke: true });
    expect(ga4Change({ clientStatus: "actif", _status: "draft" }, { clientStatus: "nouvelle" }, "update")).toEqual({ steps: [], poke: false });
    expect(ga4Change({ clientStatus: "nouvelle" }, null, "create")).toEqual({ steps: [], poke: false });
  });
});

describe("la décision d'envoi", () => {
  it("la démo part tout de suite ; la signature avec son CA payé", () => {
    expect(decide("qualify", daysAgo(1), null, NOW)).toEqual({ kind: "send", value: null, note: null });
    expect(decide("close", daysAgo(1), 1490.456, NOW)).toEqual({ kind: "send", value: 1490.46, note: null });
  });

  it("pas de conversion à 0 € : sans CA payé, la signature attend et repasse dans l'heure", () => {
    expect(decide("close", daysAgo(2), 0, NOW)).toEqual({ kind: "wait", nextTry: new Date(NOW.getTime() + 3_600_000) });
  });

  it(`au-delà de ${CLOSE_VALUE_WAIT_DAYS} jours sans CA payé, la signature part sans montant, et la ligne le note`, () => {
    expect(decide("close", daysAgo(CLOSE_VALUE_WAIT_DAYS), null, NOW)).toEqual({ kind: "send", value: null, note: expect.stringMatching(/sans montant/) });
  });

  it("un échec réessaie de plus en plus tard, 6 h au plus", () => {
    expect(retryDelayMs(1)).toBe(15 * 60_000);
    expect(retryDelayMs(2)).toBe(30 * 60_000);
    expect(retryDelayMs(20)).toBe(6 * 3_600_000);
  });
});

describe("l'envoi", () => {
  it("POST en JSON sur mp/collect ; sans les deux variables, rien ne part", async () => {
    expect(ga4Url({})).toBeNull();
    expect(ga4Url(PROD)).toBe("https://www.google-analytics.com/mp/collect?measurement_id=G-TEST&api_secret=secret-de-test");
    expect(ga4Url(PROD, true)).toMatch(/\/debug\/mp\/collect\?/);
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    await sendGa4(ga4Body("qualify", LEAD)!, { fetch: fetch as never, env: PROD });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(init).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json" } });
    await expect(sendGa4(ga4Body("qualify", LEAD)!, { fetch: fetch as never, env: {} })).rejects.toBeInstanceOf(Ga4NotConfigured);
  });

  it("seulement en production : la base est partagée avec le développement", () => {
    expect(ga4Enabled(PROD)).toBe(true);
    expect(ga4Enabled({ ...PROD, VERCEL_ENV: "preview" })).toBe(false);
    expect(ga4Enabled({ ...PROD, VERCEL_ENV: undefined })).toBe(false);
    expect(ga4Enabled({ ...PROD, VERCEL_ENV: undefined, GA4_SEND_OUTSIDE_PRODUCTION: "1" })).toBe(true);
    expect(ga4Enabled({ VERCEL_ENV: "production" })).toBe(false);
  });
});

/** Une base factice : enregistre chaque requête (en SQL lisible) et répond par `answer`. */
function fakeDb(answer: (text: string, params: unknown[]) => Record<string, unknown>[] | Error) {
  const dialect = new PgDialect();
  const queries: { text: string; params: unknown[] }[] = [];
  const payload = {
    db: {
      drizzle: {
        execute: vi.fn(async (q: never) => {
          const { sql, params } = dialect.sqlToQuery(q);
          queries.push({ text: sql, params });
          const r = answer(sql, params);
          if (r instanceof Error) throw r;
          return { rows: r };
        }),
      },
    },
    logger: { warn: vi.fn(), info: vi.fn() },
  };
  return { payload: payload as never, queries };
}

const ROW = { step: "qualify", reached_at: daysAgo(1).toISOString(), sent_at: null, attempts: 0, ca_paye: null, ga_client_id: LEAD.gaClientId, ga_session_id: LEAD.gaSessionId, form_id_snapshot: "demo" };
const isSelect = (t: string) => t.startsWith("SELECT gs.");
const isClaim = (t: string) => t.includes(`SET "claimed_at" = `) && t.includes("RETURNING");

describe("aucun envoi rétroactif, rien sans identifiant GA4", () => {
  it("une étape n'est notée que si la demande d'origine porte un identifiant GA4, et une seule fois", async () => {
    const { payload, queries } = fakeDb(() => []);
    await recordReached(payload, 12, ["qualify", "close"], NOW);
    expect(queries).toHaveLength(2);
    for (const q of queries) {
      // Jointure INTERNE sur la demande : une opportunité saisie à la main ou importée (sans demande) n'est jamais notée.
      expect(q.text).toMatch(/JOIN "form_submissions" fs ON fs\."id" = pc\."form_submission_id"/);
      expect(q.text).not.toMatch(/LEFT JOIN/);
      expect(q.text).toMatch(/fs\."ga_client_id" IS NOT NULL AND fs\."ga_client_id" <> ''/);
      expect(q.text).toMatch(/ON CONFLICT \("client_id", "step"\) DO NOTHING/);
    }
  });

  it("l'historique n'est jamais repris : la reprise ne lit que les étapes NOTÉES (au passage d'un statut, depuis la mise en ligne)", async () => {
    const { payload, queries } = fakeDb(() => [{ id: 3 }]);
    expect(await pendingSends(payload, NOW)).toEqual([3]);
    expect(queries[0].text).toMatch(/^SELECT "id" FROM "ga4_sends"/);
    expect(queries[0].text).not.toMatch(/partner_clients/);
  });
});

describe("le traitement d'une étape", () => {
  it("hors production, rien n'est lu ni écrit", async () => {
    const { payload, queries } = fakeDb(() => []);
    expect(await processSend(payload, 7, { env: { ...PROD, VERCEL_ENV: "development" } })).toEqual({ id: 7, outcome: "inactif" });
    expect(await resumeGa4(payload, { env: {} })).toMatchObject({ active: false, checked: 0 });
    await handleClientChange(payload, 12, [], { env: {} });
    expect(queries).toEqual([]);
  });

  it("réservée en une requête, envoyée, puis datée en une écriture", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const { payload, queries } = fakeDb((t) => (isSelect(t) ? [ROW] : isClaim(t) ? [{ id: 7 }] : []));
    expect(await processSend(payload, 7, { fetch: fetch as never, env: PROD, now: () => NOW })).toEqual({ id: 7, outcome: "envoyee" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const claim = queries.find((q) => isClaim(q.text))!;
    expect(claim.text).toMatch(/"sent_at" IS NULL AND \("claimed_at" IS NULL OR "claimed_at" < /);
    expect(queries.at(-1)!.text).toMatch(/SET "sent_at" = .*"claimed_at" = NULL WHERE "id" = /);
  });

  it("une réservation abandonnée (fonction coupée) expire au bout de 10 minutes", async () => {
    const { payload, queries } = fakeDb(() => []);
    await pendingSends(payload, NOW);
    expect(queries[0].params).toContain(new Date(NOW.getTime() - CLAIM_TTL_MS).toISOString());
  });

  it("déjà réservée ailleurs (le hook et la reprise en même temps) : pas de second envoi", async () => {
    const fetch = vi.fn();
    const { payload } = fakeDb((t) => (isSelect(t) ? [ROW] : []));
    expect(await processSend(payload, 7, { fetch: fetch as never, env: PROD, now: () => NOW })).toEqual({ id: 7, outcome: "deja" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("déjà partie : rien", async () => {
    const fetch = vi.fn();
    const { payload } = fakeDb((t) => (isSelect(t) ? [{ ...ROW, sent_at: daysAgo(1).toISOString() }] : []));
    expect(await processSend(payload, 7, { fetch: fetch as never, env: PROD, now: () => NOW })).toEqual({ id: 7, outcome: "deja" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("un échec libère SA réservation, compte l'essai, note l'incident et repasse plus tard", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 503 }));
    const { payload, queries } = fakeDb((t) => (isSelect(t) ? [ROW] : isClaim(t) ? [{ id: 7 }] : []));
    expect(await processSend(payload, 7, { fetch: fetch as never, env: PROD, now: () => NOW })).toMatchObject({ outcome: "echec", error: expect.stringMatching(/503/) });
    const release = queries.at(-1)!;
    expect(release.text).toMatch(/SET "claimed_at" = NULL, "attempts" = [\s\S]*"next_try_at" = [\s\S]* WHERE "id" = [\s\S]* AND "claimed_at" = /);
    expect(release.params).toContain(new Date(NOW.getTime() + retryDelayMs(1)).toISOString());
    expect(release.params.some((p) => String(p).includes("repris automatiquement"))).toBe(true);
  });

  it("parti, mais la datation échoue : la réservation n'est PAS libérée (l'étape ne repart pas), la datation est réessayée", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    let fails = 1;
    const { payload, queries } = fakeDb((t) => {
      if (isSelect(t)) return [ROW];
      if (isClaim(t)) return [{ id: 7 }];
      if (t.includes(`SET "sent_at"`) && fails-- > 0) return new Error("connexion perdue");
      return [];
    });
    expect(await processSend(payload, 7, { fetch: fetch as never, env: PROD, now: () => NOW })).toEqual({ id: 7, outcome: "envoyee" });
    expect(queries.filter((q) => q.text.includes(`SET "sent_at"`))).toHaveLength(2);
    expect(queries.some((q) => /SET "claimed_at" = NULL, "attempts"/.test(q.text))).toBe(false);
  });

  it("une signature sans CA payé attend : ni réservation ni envoi, prochain passage daté", async () => {
    const fetch = vi.fn();
    const { payload, queries } = fakeDb((t) => (isSelect(t) ? [{ ...ROW, step: "close", ca_paye: 0 }] : []));
    expect(await processSend(payload, 7, { fetch: fetch as never, env: PROD, now: () => NOW })).toEqual({ id: 7, outcome: "attente" });
    expect(fetch).not.toHaveBeenCalled();
    expect(queries.some((q) => isClaim(q.text))).toBe(false);
    expect(queries.at(-1)!.text).toMatch(/SET "next_try_at" = /);
  });

  it("le CA payé arrive pendant l'attente : la signature part avec ce montant", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const { payload } = fakeDb((t) => (isSelect(t) ? [{ ...ROW, step: "close", ca_paye: 650 }] : isClaim(t) ? [{ id: 7 }] : []));
    expect(await processSend(payload, 7, { fetch: fetch as never, env: PROD, now: () => NOW })).toEqual({ id: 7, outcome: "envoyee" });
    const body = JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as { events: { params: { value: number } }[] };
    expect(body.events[0].params.value).toBe(650);
  });

  it("la reprise prend d'abord ce dont l'heure est venue, puis les plus anciennes (aucune fiche bloquée en tête de file)", async () => {
    const { payload, queries } = fakeDb(() => []);
    await pendingSends(payload, NOW);
    expect(queries[0].text).toMatch(/"next_try_at" IS NULL OR "next_try_at" <= /);
    expect(queries[0].text).toMatch(/ORDER BY COALESCE\("next_try_at", "reached_at"\) ASC/);
  });

  it("après l'enregistrement : note les étapes, puis traite celles de CETTE opportunité", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const { payload, queries } = fakeDb((t) => (t.startsWith(`SELECT "id" FROM "ga4_sends"`) ? [{ id: 7 }] : isSelect(t) ? [ROW] : isClaim(t) ? [{ id: 7 }] : []));
    await handleClientChange(payload, 12, ["qualify"], { fetch: fetch as never, env: PROD, now: () => NOW });
    expect(queries[0].text).toMatch(/^INSERT INTO "ga4_sends"/);
    expect(queries[1].text).toMatch(/AND "client_id" = /);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
