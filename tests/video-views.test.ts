import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildVideosAnalytics,
  createRateLimiter,
  maskIp,
  parisDay,
  parseVue,
  videoVersion,
  type VueRow,
} from "@/modules/analytics/lib/video-views";

const execute = vi.fn<(q: unknown) => Promise<{ rows: unknown[] }>>(async () => ({ rows: [] }));
const warn = vi.fn();
vi.mock("@/core/payload-client", () => ({
  payloadClient: async () => ({ db: { drizzle: { execute } }, logger: { warn, error: vi.fn(), info: vi.fn() } }),
}));

const ok = { video_id: "planning-ouvriers-demo", etape: "25", page: "/plannings-ouvriers" };

describe("parseVue", () => {
  it("accepte un corps valide (étapes en chaînes, comme la vitrine les envoie)", () => {
    expect(parseVue(ok)).toEqual({ videoId: "planning-ouvriers-demo", etape: "25", page: "/plannings-ouvriers", appareil: "inconnu", canal: "inconnu" });
    expect(parseVue({ ...ok, etape: "lecture", page: "/video/demo-planning-ouvriers" })?.etape).toBe("lecture");
  });

  it("accepte les étapes affichage et cta", () => {
    expect(parseVue({ ...ok, etape: "affichage" })?.etape).toBe("affichage");
    expect(parseVue({ ...ok, etape: "cta" })?.etape).toBe("cta");
  });

  it("garde l'appareil et le canal connus, ramène le reste à « inconnu » sans refuser la lecture", () => {
    expect(parseVue({ ...ok, appareil: "mobile", canal: "sea" })).toMatchObject({ appareil: "mobile", canal: "sea" });
    expect(parseVue({ ...ok, appareil: "direct", canal: "direct" })).toMatchObject({ appareil: "inconnu", canal: "direct" });
    expect(parseVue({ ...ok, appareil: "iPhone 15", canal: "newsletter" })).toMatchObject({ appareil: "inconnu", canal: "inconnu" });
  });

  it("lit la version d'une vidéo dans son identifiant", () => {
    expect(videoVersion("planning-ouvriers-demo-v2")).toEqual({ base: "planning-ouvriers-demo", version: 2 });
    expect(videoVersion("planning-ouvriers-demo")).toEqual({ base: "planning-ouvriers-demo", version: 1 });
  });

  it("refuse un video_id invalide", () => {
    for (const video_id of ["", "Planning", "a b", "x".repeat(65), 12]) expect(parseVue({ ...ok, video_id })).toBeNull();
  });

  it("refuse une étape inconnue (y compris en nombre)", () => {
    for (const etape of ["10", "100", "debut", 25]) expect(parseVue({ ...ok, etape })).toBeNull();
  });

  it("refuse une page invalide", () => {
    for (const page of ["plannings", "/Plannings", "/a?b=1", "/" + "a".repeat(201), "https://x.fr/"]) expect(parseVue({ ...ok, page })).toBeNull();
  });

  it("refuse un corps absent", () => {
    expect(parseVue(null)).toBeNull();
    expect(parseVue("x")).toBeNull();
  });
});

describe("parisDay", () => {
  it("compte le jour à Paris, pas en UTC", () => {
    expect(parisDay(new Date("2026-10-18T22:30:00Z"))).toBe("2026-10-19"); // 00 h 30 à Paris (été)
    expect(parisDay(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01"); // 00 h 30 à Paris (hiver)
    expect(parisDay(new Date("2026-10-19T21:59:00Z"))).toBe("2026-10-19");
  });

  it("tient le changement d'heure", () => {
    expect(parisDay(new Date("2026-10-25T00:30:00Z"))).toBe("2026-10-25");
    expect(parisDay(new Date("2026-03-28T23:30:00Z"))).toBe("2026-03-29");
  });
});

describe("plafond de débit", () => {
  it("laisse passer 60 étapes par heure, refuse la 61ᵉ, puis repart", () => {
    const l = createRateLimiter({ max: 60, windowMs: 3_600_000 });
    const t = 1_000_000;
    for (let i = 0; i < 60; i++) expect(l.hit("1.2.3.4", t + i)).toBe(true);
    expect(l.hit("1.2.3.4", t + 61)).toBe(false);
    expect(l.hit("5.6.7.8", t + 62)).toBe(true);
    expect(l.hit("1.2.3.4", t + 3_600_000)).toBe(true);
  });

  it("purge les adresses de plus d'une heure", () => {
    const l = createRateLimiter({ max: 60, windowMs: 1000 });
    l.hit("a", 0);
    l.hit("b", 0);
    l.hit("c", 2000);
    expect(l.size()).toBe(1);
  });

  it("ne journalise jamais l'adresse complète", () => {
    expect(maskIp("92.184.10.20")).toBe("92.184.x.x");
    expect(maskIp("2a01:cb08:1234::1")).toBe("2a01:cb08:x");
    expect(maskIp(undefined)).toBe("inconnue");
  });
});

describe("rapport", () => {
  const now = new Date("2026-10-19T10:00:00Z");
  const row = (etape: string, nombre: number, jour = "2026-10-18", page = "/plannings-ouvriers", videoId = "planning-ouvriers-demo", appareil = "inconnu", canal = "inconnu"): VueRow => ({ videoId, page, etape, jour, appareil, canal, nombre });

  it("donne l'entonnoir, le taux de complétion et la comparaison", () => {
    const r = buildVideosAnalytics(
      [row("lecture", 10), row("25", 8), row("50", 6), row("75", 5), row("fin", 4), row("lecture", 5, "2026-09-25"), row("fin", 1, "2026-09-25")],
      7,
      now,
    );
    const v = r.videos[0];
    expect(v.completion).toBe(40);
    expect(v.lectures.current).toBe(10);
    expect(v.funnel.map((s) => s.reached)).toEqual([10, 8, 6, 5, 4]);
    expect(v.funnel[2]).toMatchObject({ fromStart: 60, fromPrevious: 75 });
    expect(r.days).toHaveLength(7);
    expect(r.daily.find((d) => d.day === "2026-10-18")?.["planning-ouvriers-demo"]).toBe(10);
  });

  it("donne le taux de lancement, les clics et les répartitions par appareil et canal", () => {
    const r = buildVideosAnalytics(
      [
        row("affichage", 20),
        row("lecture", 6, "2026-10-18", "/plannings-ouvriers", "planning-ouvriers-demo", "mobile", "sea"),
        row("fin", 3, "2026-10-18", "/plannings-ouvriers", "planning-ouvriers-demo", "mobile", "sea"),
        row("lecture", 4, "2026-10-18", "/plannings-ouvriers", "planning-ouvriers-demo", "ordinateur", "seo"),
        row("cta", 2, "2026-10-18", "/plannings-ouvriers", "planning-ouvriers-demo", "ordinateur", "seo"),
      ],
      7,
      now,
    );
    const v = r.videos[0];
    expect([v.affichages, v.lancement, v.cta, v.ctaRate]).toEqual([20, 50, 2, 20]);
    expect(v.funnel.map((s) => s.key)).toEqual(["lecture", "25", "50", "75", "fin"]);
    expect(v.appareils.map((a) => [a.label, a.lectures, a.completion])).toEqual([["Mobile", 6, 50], ["Ordinateur", 4, 0]]);
    expect(v.canaux.map((c) => [c.label, c.cta])).toEqual([["Google Ads — SEA", 0], ["Site vitrine — SEO", 2]]);
  });

  it("répartit par page et sépare la période précédente", () => {
    const r = buildVideosAnalytics(
      [row("lecture", 3), row("lecture", 2, "2026-10-18", "/video/demo-planning-ouvriers"), row("fin", 1, "2026-10-18", "/video/demo-planning-ouvriers"), row("lecture", 4, "2026-10-08")],
      7,
      now,
    );
    const v = r.videos[0];
    expect(v.pages).toEqual([
      { page: "/plannings-ouvriers", kind: "produit", lectures: 3, fins: 0 },
      { page: "/video/demo-planning-ouvriers", kind: "video", lectures: 2, fins: 1 },
    ]);
    expect(v.lectures.previous).toBe(4);
  });
});

describe("POST /api/videos/vues", () => {
  const env = { ...process.env };
  const post = async (body: unknown, headers: Record<string, string> = {}) => {
    const { POST } = await import("@/app/(frontend)/api/videos/vues/route");
    return POST(
      new Request("https://support.test/api/videos/vues", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
  };

  beforeEach(() => {
    vi.resetModules();
    execute.mockClear();
    warn.mockClear();
    process.env.FORMS_INGEST_SECRET = "s3cret";
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("compte une étape valide : 204, sans cache, une requête SQL", async () => {
    const res = await post(ok, { "x-form-key": "s3cret", "x-visitor-ip": "1.2.3.4" });
    expect(res.status).toBe(204);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(execute.mock.calls[0][0])).toContain("appareil");
  });

  it("refuse un secret faux ou absent (401), une configuration manquante (503)", async () => {
    expect((await post(ok, { "x-form-key": "faux" })).status).toBe(401);
    expect((await post(ok)).status).toBe(401);
    delete process.env.FORMS_INGEST_SECRET;
    vi.stubEnv("NODE_ENV", "production");
    expect((await post(ok, { "x-form-key": "s3cret" })).status).toBe(503);
    vi.unstubAllEnvs();
    expect(execute).not.toHaveBeenCalled();
  });

  it("refuse un corps invalide (400)", async () => {
    expect((await post({ ...ok, etape: "33" }, { "x-form-key": "s3cret" })).status).toBe(400);
    expect((await post("pas du json", { "x-form-key": "s3cret" })).status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it("plafonne une adresse à 60 étapes par heure (429), sans l'écrire en entier", async () => {
    const { POST } = await import("@/app/(frontend)/api/videos/vues/route");
    const send = () =>
      POST(new Request("https://support.test/api/videos/vues", { method: "POST", headers: { "x-form-key": "s3cret", "x-visitor-ip": "9.8.7.6" }, body: JSON.stringify(ok) }));
    for (let i = 0; i < 60; i++) expect((await send()).status).toBe(204);
    expect((await send()).status).toBe(429);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("9.8.x.x"));
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("9.8.7.6"));
  });

  it("n'écrit jamais l'adresse en base", async () => {
    await post(ok, { "x-form-key": "s3cret", "x-visitor-ip": "1.2.3.4" });
    expect(JSON.stringify(execute.mock.calls[0][0])).not.toContain("1.2.3.4");
  });
});
