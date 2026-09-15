import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le client Pennylane : ce qu'il fait des pages, des refus et des limites.
 *
 * Le module garde un cache en mémoire : chaque test repart d'un module neuf
 * (`vi.resetModules`) et d'un `fetch` simulé, sans jamais toucher au réseau.
 */

type Call = { url: string; init?: RequestInit };

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const page = (items: unknown[], next: string | null = null) => json({ items, has_more: next != null, next_cursor: next });

/** Un serveur Pennylane minimal : répond selon le chemin, note chaque appel. */
function fakeServer(routes: Record<string, (url: URL, n: number) => Response>) {
  const calls: Call[] = [];
  const counts = new Map<string, number>();
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url: url.toString(), init });
    const path = url.pathname.replace("/api/external/v2", "");
    const n = (counts.get(path) ?? 0) + 1;
    counts.set(path, n);
    const route = routes[path];
    if (!route) return json({ error: "not found" }, 404);
    return route(url, n);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

async function load() {
  vi.resetModules();
  return import("@/modules/partner/lib/pennylane");
}

const SUB = { id: 1, status: "not_started", customer: { id: 10 }, customer_invoice_data: { currency_amount_before_tax: "39.0" } };

beforeEach(() => {
  process.env.PENNYLANE_API_TOKEN = "tok";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("lecture de l'instantané", () => {
  it("suit les curseurs de pagination et lit les lignes de chaque abonnement", async () => {
    const { calls } = fakeServer({
      "/customers": (url) =>
        url.searchParams.get("cursor") === "c2" ? page([{ id: 11, name: "B" }]) : page([{ id: 10, name: "A" }], "c2"),
      "/products": () => page([]),
      "/billing_subscriptions": () => page([SUB, { ...SUB, id: 2 }]),
      "/customer_invoices": () => page([{ id: 7, customer: { id: 10 } }]),
      "/billing_subscriptions/1/invoice_lines": () => page([{ id: 100, quantity: "1" }]),
      "/billing_subscriptions/2/invoice_lines": () => page([{ id: 200, quantity: "2" }, { id: 201, quantity: "3" }]),
    });
    const { loadPennylane } = await load();
    const snap = await loadPennylane();

    expect(snap.customers.map((c) => c.id)).toEqual([10, 11]);
    expect(snap.subscriptions.map((s) => s.lines.length)).toEqual([1, 2]);
    expect(snap.invoices).toHaveLength(1);
    expect(snap.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Le token part en Bearer, jamais en clair dans l'URL.
    expect(calls.every((c) => (c.init?.headers as Record<string, string>).Authorization === "Bearer tok")).toBe(true);
    expect(calls.some((c) => c.url.includes("tok"))).toBe(false);
    expect(calls.filter((c) => c.url.includes("/customers")).map((c) => new URL(c.url).searchParams.get("limit"))).toEqual(["100", "100"]);
  });

  it("garde l'instantané une heure, et « Actualiser » force la relecture", async () => {
    const { fetchMock } = fakeServer({
      "/customers": () => page([]),
      "/products": () => page([]),
      "/billing_subscriptions": () => page([]),
      "/customer_invoices": () => page([]),
    });
    const { loadPennylane, peekPennylane } = await load();
    expect(peekPennylane()).toBeNull(); // rien en cache : lance une lecture en fond
    const first = await loadPennylane();
    const n = fetchMock.mock.calls.length;
    expect(await loadPennylane()).toBe(first);
    expect(fetchMock.mock.calls.length).toBe(n); // aucun appel de plus
    expect(peekPennylane()).toBe(first);
    const again = await loadPennylane({ refresh: true });
    expect(again).not.toBe(first);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(n);
  });

  it("se passe des factures si le token n'a pas ce scope", async () => {
    fakeServer({
      "/customers": () => page([]),
      "/products": () => page([]),
      "/billing_subscriptions": () => page([]),
      "/customer_invoices": () => json({ error: "forbidden" }, 403),
    });
    const { loadPennylane } = await load();
    expect((await loadPennylane()).invoices).toEqual([]);
  });
});

describe("erreurs expliquées", () => {
  it("dit quand le token est refusé, sans réessayer", async () => {
    const { fetchMock } = fakeServer({
      "/customers": () => json({ error: "unauthorized" }, 401),
      "/products": () => page([]),
      "/billing_subscriptions": () => page([]),
      "/customer_invoices": () => page([]),
    });
    const { loadPennylane, pennylaneErrorMessage, PennylaneError } = await load();
    const err = await loadPennylane().catch((e) => e);
    expect(err).toBeInstanceOf(PennylaneError);
    expect(err.code).toBe("unauthorized");
    expect(pennylaneErrorMessage(err)).toMatch(/refuse le token/);
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/customers"))).toHaveLength(1);
  });

  it("attend `retry-after` sur une limite, une seule fois", async () => {
    vi.useFakeTimers();
    fakeServer({
      "/customers": (_u, n) => (n === 1 ? json({}, 429, { "retry-after": "2" }) : page([{ id: 1, name: "A" }])),
      "/products": () => page([]),
      "/billing_subscriptions": () => page([]),
      "/customer_invoices": () => page([]),
    });
    const { loadPennylane } = await load();
    const pending = loadPennylane();
    await vi.advanceTimersByTimeAsync(2000);
    expect((await pending).customers).toHaveLength(1);
  });

  it("abandonne proprement si la limite persiste", async () => {
    vi.useFakeTimers();
    fakeServer({
      "/customers": () => json({}, 429, { "retry-after": "1" }),
      "/products": () => page([]),
      "/billing_subscriptions": () => page([]),
      "/customer_invoices": () => page([]),
    });
    const { loadPennylane, pennylaneErrorMessage } = await load();
    const pending = loadPennylane().catch((e) => e);
    await vi.advanceTimersByTimeAsync(1000);
    const err = await pending;
    expect(err.code).toBe("rate_limited");
    expect(pennylaneErrorMessage(err)).toMatch(/limite les appels/);
  });

  it("distingue un réseau injoignable d'une erreur de l'API", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const m1 = await load();
    expect((await m1.loadPennylane().catch((e) => e)).code).toBe("unreachable");

    fakeServer({ "/customers": () => json({}, 500), "/products": () => page([]), "/billing_subscriptions": () => page([]), "/customer_invoices": () => page([]) });
    const m2 = await load();
    const err = await m2.loadPennylane().catch((e) => e);
    expect(err.code).toBe("api_error");
    expect(m2.pennylaneErrorMessage(err)).toBe("Pennylane a répondu une erreur (HTTP 500).");
  });

  it("sans token : rien ne part, et l'écran sait le dire", async () => {
    delete process.env.PENNYLANE_API_TOKEN;
    const { fetchMock } = fakeServer({});
    const { isPennylaneConfigured, loadPennylane, peekPennylane, pennylaneErrorMessage } = await load();
    expect(isPennylaneConfigured()).toBe(false);
    expect(peekPennylane()).toBeNull();
    const err = await loadPennylane().catch((e) => e);
    expect(err.code).toBe("not_configured");
    expect(pennylaneErrorMessage(err)).toMatch(/PENNYLANE_API_TOKEN/);
    expect(pennylaneErrorMessage(new Error("x"))).toBe("Lecture Pennylane impossible.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
