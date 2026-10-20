import { describe, expect, it } from "vitest";

import { createMetaPlatform, metaCreativeSpec, toMetaAmount } from "@/modules/ads/platforms/meta";
import type { NewCreative } from "@/modules/ads/platforms/types";

const acc = { externalId: "act_42", token: "EAAB", currency: "EUR", timezone: "Europe/Paris" };

/** Un faux Graph qui note chaque appel (méthode, chemin, corps) et répond selon le chemin. */
function graph(routes: [RegExp, unknown][]) {
  const calls: { method: string; path: string; body: URLSearchParams | null }[] = [];
  const fetch = async (u: string, init?: RequestInit) => {
    const url = new URL(u);
    calls.push({ method: init?.method ?? "GET", path: url.pathname, body: init?.body instanceof URLSearchParams ? init.body : null });
    const hit = routes.find(([re]) => re.test(url.pathname));
    return new Response(JSON.stringify(hit ? hit[1] : { error: { message: "absente", code: 100, error_user_msg: "Le budget est trop bas." } }), { status: hit ? 200 : 400 });
  };
  return { platform: createMetaPlatform({ appId: "app", appSecret: "secret", version: "v26.0", fetch: fetch as never, now: () => new Date() }), calls };
}

describe("publier chez Meta", () => {
  it("crée une campagne EN PAUSE, le jeton dans le corps avec sa preuve, jamais dans l'adresse", async () => {
    const { platform, calls } = graph([[/act_42\/campaigns/, { id: "c1" }]]);
    expect(await platform.createCampaign!(acc, { name: "Pointage", objective: "OUTCOME_TRAFFIC" })).toBe("c1");
    const c = calls[0];
    expect(c.method).toBe("POST");
    expect(Object.fromEntries(c.body!)).toMatchObject({ name: "Pointage", objective: "OUTCOME_TRAFFIC", status: "PAUSED", special_ad_categories: "[]", access_token: "EAAB" });
    expect(c.body!.get("appsecret_proof")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("un ensemble : budget en centimes, ciblage et objet promu en JSON, en pause", async () => {
    const { platform, calls } = graph([[/act_42\/adsets/, { id: "s1" }]]);
    await platform.createAdSet!(acc, { campaignId: "c1", name: "A", dailyBudget: 12.5, optimizationGoal: "LANDING_PAGE_VIEWS", billingEvent: "IMPRESSIONS", targeting: { geo_locations: { countries: ["FR"] } }, destinationType: "WEBSITE" });
    const b = calls[0].body!;
    expect(b.get("daily_budget")).toBe("1250");
    expect(JSON.parse(b.get("targeting")!)).toEqual({ geo_locations: { countries: ["FR"] } });
    expect(b.get("status")).toBe("PAUSED");
    expect(b.has("promoted_object")).toBe(false);
    expect(toMetaAmount(1500, "JPY")).toBe(1500);
  });

  it("une erreur de Meta remonte avec son message pour l'utilisateur", async () => {
    const { platform } = graph([]);
    await expect(platform.createAdSet!(acc, { campaignId: "c", name: "A", dailyBudget: 0.1, optimizationGoal: "REACH", billingEvent: "IMPRESSIONS", targeting: {} })).rejects.toThrow(/budget est trop bas/);
  });

  it("une vidéo : Meta la cherche à son adresse, puis on attend son traitement et sa vignette", async () => {
    const { platform, calls } = graph([
      [/act_42\/advideos/, { id: "v1" }],
      [/v1\/thumbnails/, { data: [{ uri: "https://x/a.jpg" }, { uri: "https://x/b.jpg", is_preferred: true }] }],
      [/\/v1$/, { status: { video_status: "ready" } }],
    ]);
    expect(await platform.uploadVideo!(acc, "https://blob/C1-9x16.mp4", "C1-9x16")).toEqual({ id: "v1" });
    expect(calls[0].body!.get("file_url")).toBe("https://blob/C1-9x16.mp4");
    expect(await platform.videoState!(acc, "v1")).toEqual({ ready: true, error: null, thumbnailUrl: "https://x/b.jpg" });
  });
});

describe("la créa chez Meta", () => {
  const base: NewCreative = { name: "C12", pageId: "p1", instagramId: "ig1", kind: "video", body: "Texte", title: "Titre", link: "https://tim-management.co/demo", urlTags: "utm_source=x", cta: "LEARN_MORE", media: [] };

  it("chaque format à sa place : 9:16 en Stories et Reels, 4:5 dans les fils", () => {
    const spec = metaCreativeSpec({ ...base, media: [{ format: "9x16", video: { id: "v9", thumbnailUrl: "t9" } }, { format: "4x5", video: { id: "v4", thumbnailUrl: null } }] });
    expect(spec).toMatchObject({
      object_story_spec: { page_id: "p1", instagram_user_id: "ig1" },
      url_tags: "utm_source=x",
      asset_feed_spec: {
        videos: [{ video_id: "v9", thumbnail_url: "t9", adlabels: [{ name: "f9x16" }] }, { video_id: "v4", adlabels: [{ name: "f4x5" }] }],
        ad_formats: ["SINGLE_VIDEO"],
        call_to_action_types: ["LEARN_MORE"],
        link_urls: [{ website_url: "https://tim-management.co/demo" }],
        optimization_type: "PLACEMENT",
        asset_customization_rules: [
          { video_label: { name: "f4x5" }, priority: 1, customization_spec: expect.objectContaining({ instagram_positions: ["stream", "explore", "profile_feed"] }) },
          { video_label: { name: "f9x16" }, priority: 2, customization_spec: expect.objectContaining({ instagram_positions: ["story", "reels"] }) },
        ],
      },
    });
  });

  it("un seul format sert partout, sans règle ; une image a son empreinte", () => {
    const spec = metaCreativeSpec({ ...base, kind: "image", media: [{ format: "1x1", image: { hash: "h1" } }] }) as { asset_feed_spec: Record<string, unknown> };
    expect(spec.asset_feed_spec.images).toEqual([{ hash: "h1", adlabels: [{ name: "f1x1" }] }]);
    expect(spec.asset_feed_spec).not.toHaveProperty("asset_customization_rules");
  });
});
