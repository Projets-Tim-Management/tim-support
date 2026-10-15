import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { ga4MayBeDue } from "@/modules/analytics/lib/ga4-hook";
import { CLOSE_VALUE_WAIT_DAYS, ga4Body, Ga4NotConfigured, ga4Url, pendingGa4, processGa4Steps, sendGa4, stepsDue, type Ga4Lead } from "@/modules/analytics/lib/ga4-mp";

/**
 * Les étapes commerciales renvoyées à GA4 (plan de mesure, phase 2.2) :
 * `qualify_lead` à la démo programmée, `close_convert_lead` à la signature,
 * une fois chacune, jamais sans identifiant GA4, jamais à 0 €, jamais sur
 * l'historique d'avant la mise en ligne.
 */

const LEAD: Ga4Lead = { gaClientId: "1234567890.1700000000", gaSessionId: "1760345678", formId: "demo", channel: "google-ads", sourcePagePath: "/produits/pointage", landingPath: "/lp/demande-demo" };
const NOW = new Date("2026-10-20T10:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const ENV = { GA4_MEASUREMENT_ID: "G-TEST", GA4_API_SECRET: "secret-de-test" };

describe("le corps envoyé à GA4", () => {
  it("rattache l'étape à la visite : client_id, session_id et les pages d'origine", () => {
    expect(ga4Body("qualify", LEAD)).toEqual({
      client_id: "1234567890.1700000000",
      events: [{ name: "qualify_lead", params: { engagement_time_msec: 1, session_id: "1760345678", form_id: "demo", channel: "google-ads", source_page: "/produits/pointage", landing_page: "/lp/demande-demo" } }],
    });
  });

  it("la signature porte le CA payé en euros ; sans montant, ni value ni currency", () => {
    expect(ga4Body("close", LEAD, 1490)?.events).toEqual([expect.objectContaining({ name: "close_convert_lead", params: expect.objectContaining({ value: 1490, currency: "EUR", session_id: "1760345678" }) })]);
    const noValue = (ga4Body("close", LEAD, null)?.events as { params: Record<string, unknown> }[])[0].params;
    expect(noValue).not.toHaveProperty("value");
    expect(noValue).not.toHaveProperty("currency");
    expect((ga4Body("qualify", LEAD, 1490)?.events as { params: Record<string, unknown> }[])[0].params).not.toHaveProperty("value");
  });

  it("sans identifiant GA4, rien : on n'en fabrique jamais", () => {
    expect(ga4Body("qualify", { ...LEAD, gaClientId: null })).toBeNull();
    expect(ga4Body("close", { ...LEAD, gaClientId: "" }, 1490)).toBeNull();
  });

  it("jamais d'horodatage : GA4 rattacherait mal une signature de plusieurs semaines", () => {
    expect(JSON.stringify(ga4Body("close", LEAD, 10))).not.toMatch(/timestamp_micros/);
  });
});

describe("les étapes dues", () => {
  it("démo programmée : qualify_lead, une fois", () => {
    expect(stepsDue({ clientStatus: "demo-programmee" }, LEAD, NOW)).toEqual([{ step: "qualify" }]);
    expect(stepsDue({ clientStatus: "demo-programmee", ga4QualifySentAt: daysAgo(1) }, LEAD, NOW)).toEqual([]);
    expect(stepsDue({ clientStatus: "nouvelle" }, LEAD, NOW)).toEqual([]);
    expect(stepsDue({ clientStatus: "perdue" }, LEAD, NOW)).toEqual([]);
  });

  it("un lead passé directement à Gagnée envoie aussi qualify_lead, puis la signature avec son CA", () => {
    expect(stepsDue({ clientStatus: "actif", caPaye: 1490.456 }, LEAD, NOW)).toEqual([{ step: "qualify" }, { step: "close", value: 1490.46, note: null }]);
  });

  it("une signature déjà envoyée ne repart pas (un client résilié puis réactivé ne compte pas deux fois)", () => {
    expect(stepsDue({ clientStatus: "actif", caPaye: 900, ga4QualifySentAt: daysAgo(40), ga4CloseSentAt: daysAgo(30) }, LEAD, NOW)).toEqual([]);
  });

  it("pas de conversion à 0 € : sans CA payé, la signature attend, et l'attente est datée", () => {
    expect(stepsDue({ clientStatus: "actif", caPaye: 0, ga4QualifySentAt: daysAgo(3) }, LEAD, NOW)).toEqual([{ step: "wait", since: NOW }]);
    expect(stepsDue({ clientStatus: "actif", caPaye: null, ga4QualifySentAt: daysAgo(3), ga4CloseWaitSince: daysAgo(5) }, LEAD, NOW)).toEqual([{ step: "wait", since: null }]);
    // Le CA arrive pendant l'attente : la signature part avec lui.
    expect(stepsDue({ clientStatus: "actif", caPaye: 600, ga4QualifySentAt: daysAgo(3), ga4CloseWaitSince: daysAgo(5) }, LEAD, NOW)).toEqual([{ step: "close", value: 600, note: null }]);
  });

  it(`au-delà de ${CLOSE_VALUE_WAIT_DAYS} jours sans CA payé, la signature part sans montant, et la fiche le dit`, () => {
    const [due] = stepsDue({ clientStatus: "actif", caPaye: 0, ga4QualifySentAt: daysAgo(20), ga4CloseWaitSince: daysAgo(CLOSE_VALUE_WAIT_DAYS) }, LEAD, NOW);
    expect(due).toEqual({ step: "close", value: null, note: expect.stringMatching(/sans montant/) });
  });

  it("sans identifiant GA4 sur la demande d'origine, aucune étape", () => {
    expect(stepsDue({ clientStatus: "actif", caPaye: 900 }, null, NOW)).toEqual([]);
    expect(stepsDue({ clientStatus: "actif", caPaye: 900 }, { ...LEAD, gaClientId: null }, NOW)).toEqual([]);
  });
});

describe("l'envoi", () => {
  it("POST en JSON sur mp/collect ; sans les deux variables, rien ne part", async () => {
    expect(ga4Url({})).toBeNull();
    expect(ga4Url({ GA4_MEASUREMENT_ID: "G-TEST" })).toBeNull();
    expect(ga4Url(ENV)).toBe("https://www.google-analytics.com/mp/collect?measurement_id=G-TEST&api_secret=secret-de-test");
    expect(ga4Url(ENV, true)).toMatch(/\/debug\/mp\/collect\?/);
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    await sendGa4(ga4Body("qualify", LEAD)!, { fetch: fetch as never, env: ENV });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/www\.google-analytics\.com\/mp\/collect\?/);
    expect(init).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json" } });
    expect(JSON.parse(String(init.body))).toMatchObject({ client_id: LEAD.gaClientId });
    await expect(sendGa4(ga4Body("qualify", LEAD)!, { fetch: fetch as never, env: {} })).rejects.toBeInstanceOf(Ga4NotConfigured);
  });

  it("une réponse en erreur lève (l'étape sera reprise)", async () => {
    const fetch = vi.fn(async () => new Response("non", { status: 500 }));
    await expect(sendGa4(ga4Body("qualify", LEAD)!, { fetch: fetch as never, env: ENV })).rejects.toThrow(/500/);
  });
});

describe("le déclenchement à l'enregistrement", () => {
  it("seulement quand le statut change, ou le CA payé d'une affaire gagnée ; jamais un brouillon", () => {
    expect(ga4MayBeDue({ clientStatus: "demo-programmee" }, { clientStatus: "nouvelle" }, "update")).toBe(true);
    expect(ga4MayBeDue({ clientStatus: "demo-programmee" }, { clientStatus: "demo-programmee" }, "update")).toBe(false);
    expect(ga4MayBeDue({ clientStatus: "actif", caPaye: 500 }, { clientStatus: "actif", caPaye: 0 }, "update")).toBe(true);
    expect(ga4MayBeDue({ clientStatus: "nouvelle", caPaye: 500 }, { clientStatus: "nouvelle", caPaye: 0 }, "update")).toBe(false);
    expect(ga4MayBeDue({ clientStatus: "actif", _status: "draft" }, { clientStatus: "nouvelle" }, "update")).toBe(false);
  });
});

/** Une base factice : enregistre chaque requête (en SQL lisible) et répond par `answer`. */
function fakeDb(answer: (text: string) => Record<string, unknown>[]) {
  const dialect = new PgDialect();
  const queries: { text: string; params: unknown[] }[] = [];
  const payload = {
    db: {
      drizzle: {
        execute: vi.fn(async (q: never) => {
          const { sql, params } = dialect.sqlToQuery(q);
          queries.push({ text: sql, params });
          return { rows: answer(sql) };
        }),
      },
    },
    logger: { warn: vi.fn(), info: vi.fn() },
  };
  return { payload: payload as never, queries };
}

describe("aucun envoi rétroactif sur l'historique", () => {
  it("la reprise ne retient que les opportunités dont la demande porte un identifiant GA4", async () => {
    const { payload, queries } = fakeDb(() => [{ id: 7 }]);
    expect(await pendingGa4(payload)).toEqual([7]);
    const q = queries[0].text;
    // Jointure INTERNE sur la demande d'origine : une opportunité sans demande (saisie, import) n'en sort jamais.
    expect(q).toMatch(/FROM "partner_clients" pc JOIN "form_submissions" fs ON fs\."id" = pc\."form_submission_id"/);
    expect(q).not.toMatch(/LEFT JOIN/);
    expect(q).toMatch(/fs\."ga_client_id" IS NOT NULL AND fs\."ga_client_id" <> ''/);
  });

  it("une opportunité d'avant la mise en ligne (demande sans identifiant GA4) n'envoie rien, même gagnée", async () => {
    const fetch = vi.fn();
    const { payload, queries } = fakeDb((text) =>
      text.startsWith("SELECT pc.") ? [{ client_status: "actif", ca_paye: 4800, _status: "published", ga4_qualify_sent_at: null, ga4_close_sent_at: null, ga4_close_wait_since: null, ga_client_id: null }] : [],
    );
    expect(await processGa4Steps(payload, 12, { fetch: fetch as never, env: ENV, now: () => NOW })).toEqual({ id: 12, sent: [], waiting: false, error: null });
    expect(fetch).not.toHaveBeenCalled();
    expect(queries.filter((x) => x.text.startsWith("UPDATE"))).toEqual([]);
  });

  it("une opportunité née d'une demande avec identifiant : les deux étapes partent, chacune réservée avant l'envoi", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const { payload, queries } = fakeDb((text) =>
      text.startsWith("SELECT pc.")
        ? [{ client_status: "actif", ca_paye: 1490, _status: "published", ga4_qualify_sent_at: null, ga4_close_sent_at: null, ga4_close_wait_since: null, ga_client_id: LEAD.gaClientId, ga_session_id: LEAD.gaSessionId, form_id_snapshot: "demo" }]
        : text.includes("RETURNING")
          ? [{ id: 12 }]
          : [],
    );
    expect(await processGa4Steps(payload, 12, { fetch: fetch as never, env: ENV, now: () => NOW })).toMatchObject({ sent: ["qualify", "close"], error: null });
    expect(fetch).toHaveBeenCalledTimes(2);
    const claims = queries.filter((x) => x.text.includes("RETURNING")).map((x) => x.text);
    expect(claims[0]).toMatch(/"ga4_qualify_sent_at" = .* AND "ga4_qualify_sent_at" IS NULL/);
    expect(claims[1]).toMatch(/"ga4_close_sent_at" = .* AND "ga4_close_sent_at" IS NULL/);
  });

  it("déjà réservée ailleurs (le hook et la reprise en même temps) : pas de second envoi", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const { payload } = fakeDb((text) =>
      text.startsWith("SELECT pc.") ? [{ client_status: "demo-programmee", _status: "published", ga_client_id: LEAD.gaClientId }] : [],
    );
    expect(await processGa4Steps(payload, 12, { fetch: fetch as never, env: ENV, now: () => NOW })).toMatchObject({ sent: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("un échec libère l'étape et le note sur la fiche, sans lever", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 503 }));
    const { payload, queries } = fakeDb((text) =>
      text.startsWith("SELECT pc.") ? [{ client_status: "demo-programmee", _status: "published", ga_client_id: LEAD.gaClientId }] : text.includes("RETURNING") ? [{ id: 12 }] : [],
    );
    const r = await processGa4Steps(payload, 12, { fetch: fetch as never, env: ENV, now: () => NOW });
    expect(r).toMatchObject({ sent: [], error: expect.stringMatching(/503/) });
    expect(queries.some((x) => /SET "ga4_qualify_sent_at" = NULL/.test(x.text))).toBe(true);
    expect(queries.some((x) => /SET "ga4_error" = /.test(x.text) && String(x.params[0]).includes("repris automatiquement"))).toBe(true);
  });
});
