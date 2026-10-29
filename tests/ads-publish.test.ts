import { describe, expect, it, vi } from "vitest";

import { readPlan } from "@/modules/ads/lib/media-plan";
import { advance, advanceAdditions, emptyState, publishProblems, type PubInput, type PubState } from "@/modules/ads/lib/publish/engine";
import type { AdPlatform } from "@/modules/ads/platforms/types";

const acc = { externalId: "act_1", token: "T", currency: "EUR" };
const plan = readPlan({ objectif: "trafic", optimisation: "vues-page", ensembles: [{ nom: "Conducteurs", part: 60 }, { nom: "Large", part: 40 }], chiffres: { budget_meta_quotidien_eur: 20, cout_cible_eur: 2, resultats_semaine_par_ensemble: 30 } });
const input = (over: Partial<PubInput> = {}): PubInput => ({
  campaign: { id: 7, name: "Pointage BTP", landingUrl: "https://tim-management.co/demo" },
  account: { pageId: "p1", instagramId: "ig1", pixelId: null, canPublish: true, problems: [] },
  plan,
  metaDailyEur: 20,
  creas: [
    {
      id: 12,
      angle: "Le pointage papier coûte cher",
      cta: "LEARN_MORE",
      body: "Texte",
      title: "Titre",
      description: null,
      files: [
        { format: "9x16", kind: "video", url: "https://blob/C12-9x16.mp4" },
        { format: "4x5", kind: "video", url: "https://blob/C12-4x5.mp4" },
        { format: "1x1", kind: "image", url: "https://blob/C12-1x1.png" },
      ],
    },
  ],
  enabled: true,
  ...over,
});

/** Une régie simulée qui compte ses créations ; `videoReady` règle le traitement des vidéos. */
function platform(opts: { videoReady?: () => boolean; failOn?: string } = {}) {
  let n = 0;
  const id = (p: string) => `${p}${++n}`;
  const fail = (what: string) => {
    if (opts.failOn === what) {
      opts.failOn = undefined;
      throw new Error(`panne ${what}`);
    }
  };
  const p = {
    key: "meta",
    label: "Meta",
    capabilities: [],
    createCampaign: vi.fn(async () => id("c")),
    createAdSet: vi.fn(async () => id("s")),
    uploadImage: vi.fn(async () => ({ hash: id("h") })),
    uploadVideo: vi.fn(async () => ({ id: id("v") })),
    videoState: vi.fn(async () => (opts.videoReady?.() === false ? { ready: false, error: null, thumbnailUrl: null } : { ready: true, error: null, thumbnailUrl: "thumb" })),
    createCreative: vi.fn(async () => {
      fail("creative");
      return id("k");
    }),
    createAd: vi.fn(async () => id("a")),
  } as unknown as AdPlatform & Record<string, ReturnType<typeof vi.fn>>;
  return p;
}
const deps = (p: AdPlatform) => ({ platform: p, acc, now: () => new Date("2026-10-20T08:00:00Z"), deadline: Date.now() + 60_000 });

describe("ce qui empêche de publier", () => {
  it("rien quand tout est prêt", () => {
    expect(publishProblems(input())).toEqual([]);
  });
  it("interrupteur, droits du compte, plan, page d'arrivée, budget, créas, textes", () => {
    const all = publishProblems(
      input({ enabled: false, account: { pageId: null, instagramId: null, pixelId: null, canPublish: false, problems: ["Droit « ads_management » absent"] }, campaign: { id: 7, name: "X", landingUrl: null }, metaDailyEur: null, creas: [{ ...input().creas[0], title: null }] }),
    ).join(" | ");
    for (const m of [/interrupteur/, /ads_management/, /page d'arrivée/, /budget Meta/, /un titre/]) expect(all).toMatch(m);
    expect(publishProblems(input({ plan: null })).join(" ")).toMatch(/Aucun plan de diffusion/);
    expect(publishProblems(input({ creas: [] })).join(" ")).toMatch(/Aucune créa validée/);
  });
});

describe("publier, d'un bout à l'autre", () => {
  it("campagne, 2 ensembles (60/40 du budget), médias, 2 créas (vidéo, image), 4 pubs — tout en pause", async () => {
    const p = platform();
    const saves: PubState[] = [];
    const s = await advance(emptyState(input()), input(), deps(p), async (x) => void saves.push(structuredClone(x)));
    expect(s.status).toBe("en-pause");
    expect(p.createCampaign).toHaveBeenCalledWith(acc, { name: "Pointage BTP", objective: "OUTCOME_TRAFFIC" });
    expect((p.createAdSet as ReturnType<typeof vi.fn>).mock.calls.map((c) => [c[1].name, c[1].dailyBudget, c[1].optimizationGoal, c[1].destinationType])).toEqual([
      ["Conducteurs", 12, "LANDING_PAGE_VIEWS", "WEBSITE"],
      ["Large", 8, "LANDING_PAGE_VIEWS", "WEBSITE"],
    ]);
    expect(p.uploadVideo).toHaveBeenCalledTimes(2);
    expect(p.uploadImage).toHaveBeenCalledTimes(1);
    const creative = (p.createCreative as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(creative).toMatchObject({ kind: "video", pageId: "p1", instagramId: "ig1", link: "https://tim-management.co/demo", urlTags: expect.stringContaining("utm_medium=paid_social"), media: [{ format: "9x16", video: { thumbnailUrl: "thumb" } }, { format: "4x5" }] });
    expect(Object.keys(s.ads)).toEqual(["12:video:0", "12:image:0", "12:video:1", "12:image:1"]);
    expect(s.history.at(-1)!.line).toMatch(/EN PAUSE : 4 publicité\(s\) dans 2 ensemble\(s\)/);
    expect(saves.length).toBeGreaterThan(5);
  });

  it("attend le traitement d'une vidéo, puis reprend sans rien recréer", async () => {
    let ready = false;
    const p = platform({ videoReady: () => ready });
    const first = await advance(emptyState(input()), input(), deps(p), async () => {});
    expect(first.status).toBe("en-cours");
    expect(first.history.at(-1)!.line).toMatch(/traitement chez Meta/);
    ready = true;
    const second = await advance(first, input(), deps(p), async () => {});
    expect(second.status).toBe("en-pause");
    expect(p.createCampaign).toHaveBeenCalledTimes(1);
    expect(p.uploadVideo).toHaveBeenCalledTimes(2);
  });

  it("une panne lève ; la reprise repart des identifiants déjà obtenus", async () => {
    const p = platform({ failOn: "creative" });
    let last: PubState = emptyState(input());
    await expect(advance(last, input(), deps(p), async (x) => void (last = structuredClone(x)))).rejects.toThrow(/panne creative/);
    expect(last.campaignId).toBeTruthy();
    const s = await advance(last, input(), deps(p), async () => {});
    expect(s.status).toBe("en-pause");
    expect(p.createCampaign).toHaveBeenCalledTimes(1);
    expect(p.createAdSet).toHaveBeenCalledTimes(2);
  });

  it("optimiser sur les conversions passe le pixel ; une notoriété vise la Page, sans site", async () => {
    const p = platform();
    const conv = readPlan({ objectif: "prospects", optimisation: "conversions", ensembles: [{ nom: "A", part: 100 }] });
    await advance(emptyState(input({ plan: conv })), input({ plan: conv, account: { ...input().account, pixelId: "px" } }), deps(p), async () => {});
    expect((p.createAdSet as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({ optimizationGoal: "OFFSITE_CONVERSIONS", promotedObject: { pixel_id: "px", custom_event_type: "LEAD" } });
    const p2 = platform();
    const reach = readPlan({ objectif: "notoriete", ensembles: [{ nom: "A", part: 100 }] });
    await advance(emptyState(input({ plan: reach })), input({ plan: reach }), deps(p2), async () => {});
    expect((p2.createAdSet as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({ optimizationGoal: "REACH", promotedObject: { page_id: "p1" }, destinationType: null });
    expect((p2.createCreative as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({ link: null, urlTags: null });
  });

  it("un centre d'intérêt retiré par Meta est enlevé du ciblage, noté, et l'ensemble recréé une fois", async () => {
    const p = platform();
    const meta = `Meta 100 : Invalid parameter — Autres options pertinentes : [{"deprecated_interest_id":"222","deprecated_interest_name":"Vieux","alternative_interest_id":"999","alternative_interest_name":"Autre"}]`;
    (p.createAdSet as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error(meta));
    const withInterests = readPlan({ objectif: "trafic", optimisation: "vues-page", ensembles: [{ nom: "A", part: 100, interets: [{ id: "111", name: "Construction" }, { id: "222", name: "Vieux" }] }] });
    const s = await advance(emptyState(input({ plan: withInterests })), input({ plan: withInterests }), deps(p), async () => {});
    expect(s.status).toBe("en-pause");
    const calls = (p.createAdSet as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    expect(JSON.stringify(calls[1][1].targeting)).not.toContain("222");
    expect(JSON.stringify(calls[1][1].targeting)).not.toContain("999");
    expect(s.plan?.ensembles[0].interets.map((x) => x.id)).toEqual(["111"]);
    expect(s.history.some((h) => h.line.includes("« Vieux »"))).toBe(true);
  });

  it("une autre erreur de Meta sur l'ensemble lève, sans réessayer", async () => {
    const p = platform();
    (p.createAdSet as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Meta 100 : budget trop bas"));
    await expect(advance(emptyState(input()), input(), deps(p), async () => {})).rejects.toThrow(/budget trop bas/);
    expect(p.createAdSet).toHaveBeenCalledTimes(1);
  });
});

describe("ajouter des créas à une campagne en diffusion (renouvellement)", () => {
  const fresh = {
    id: 31,
    angle: "La météo change, le planning suit",
    cta: "LEARN_MORE",
    body: "Texte",
    title: "Titre",
    description: null,
    files: [{ format: "4x5" as const, kind: "video" as const, url: "https://blob/C31-4x5.mp4" }],
  };
  const live = async () => {
    const p = platform();
    const s = await advance(emptyState(input()), input(), deps(p), async () => {});
    return { p, state: { ...s, status: "active" as const, activatedAt: "2026-10-20T09:00:00Z" } };
  };

  it("pose la créa dans chaque ensemble, active ses publicités, sans toucher à la campagne ni aux ensembles", async () => {
    const { p, state } = await live();
    const setStatus = vi.fn(async () => {});
    (p as unknown as { setStatus: typeof setStatus }).setStatus = setStatus;
    const created = p as unknown as Record<"createCampaign" | "createAdSet", ReturnType<typeof vi.fn>>;
    created.createCampaign.mockClear();
    created.createAdSet.mockClear();
    const out = await advanceAdditions(state, [fresh], input({ creas: [fresh] }), deps(p), async () => {});
    expect(out).toMatchObject({ done: true, placed: [31] });
    expect(created.createCampaign).not.toHaveBeenCalled();
    expect(created.createAdSet).not.toHaveBeenCalled();
    // 1 nature × 2 ensembles → 2 publicités créées puis activées.
    expect(setStatus).toHaveBeenCalledTimes(2);
    expect(out.state.liveAds).toEqual(["31:video:0", "31:video:1"]);
    expect(out.state.creas).toEqual([12, 31]);
    expect(out.state.status).toBe("active");

    // Rejoué : rien de plus.
    const again = await advanceAdditions(out.state, [fresh], input({ creas: [fresh] }), deps(p), async () => {});
    expect(again.placed).toEqual([]);
    expect(setStatus).toHaveBeenCalledTimes(2);
  });

  it("attend une vidéo en traitement, sans rien activer", async () => {
    const { state } = await live();
    let ready = false;
    const p = platform({ videoReady: () => ready });
    (p as unknown as { setStatus: () => Promise<void> }).setStatus = vi.fn(async () => {});
    const first = await advanceAdditions(state, [fresh], input({ creas: [fresh] }), deps(p), async () => {});
    expect(first).toMatchObject({ done: false, placed: [] });
    ready = true;
    expect((await advanceAdditions(first.state, [fresh], input({ creas: [fresh] }), deps(p), async () => {})).placed).toEqual([31]);
  });

  it("refuse une campagne qui n'est pas en diffusion", async () => {
    const { p, state } = await live();
    (p as unknown as { setStatus: () => Promise<void> }).setStatus = vi.fn(async () => {});
    await expect(advanceAdditions({ ...state, status: "en-pause" }, [fresh], input(), deps(p), async () => {})).rejects.toThrow(/pas en diffusion/);
  });
});
