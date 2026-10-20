import { describe, expect, it } from "vitest";

import { accessVerdict, metaAccountState } from "@/modules/ads/lib/access-verdict";
import { createMetaPlatform } from "@/modules/ads/platforms/meta";
import { createMockMetaPlatform } from "@/modules/ads/platforms/meta-mock";
import { AdTokenError } from "@/modules/ads/platforms/types";

const acc = { externalId: "act_42", token: "EAAB", currency: "EUR", timezone: "Europe/Paris" };

function graph(routes: [RegExp, unknown, number?][]) {
  const seen: URL[] = [];
  const fetch = async (u: string) => {
    const url = new URL(u);
    seen.push(url);
    const hit = routes.find(([re]) => re.test(url.pathname + url.search));
    if (!hit) return new Response(JSON.stringify({ error: { message: `route absente : ${url.pathname}`, code: 100 } }), { status: 400 });
    return new Response(JSON.stringify(hit[1]), { status: hit[2] ?? 200 });
  };
  return { platform: createMetaPlatform({ appId: "app", appSecret: "secret", version: "v26.0", fetch, now: () => new Date() }), seen };
}

describe("vérifier les droits d'un compte", () => {
  it("lit les droits par debug_token (jeton de l'application, sans preuve), puis Pages, Instagram et pixels", async () => {
    const { platform, seen } = graph([
      [/debug_token/, { data: { is_valid: true, scopes: ["ads_management", "ads_read"] } }],
      [/me\/accounts/, { data: [{ id: "p1", name: "TIM", instagram_business_account: { id: "ig1", username: "tim" } }] }],
      [/instagram_accounts/, { data: [{ id: "ig1", username: "tim" }, { id: "ig2", username: "tim2" }] }],
      [/adspixels/, { data: [{ id: "px1", name: "Pixel" }] }],
    ]);
    const r = await platform.checkAccess!(acc);
    expect(r).toEqual({
      scopes: ["ads_management", "ads_read"],
      pages: [{ id: "p1", name: "TIM", instagram: { id: "ig1", username: "tim" } }],
      instagram: [{ id: "ig1", username: "tim" }, { id: "ig2", username: "tim2" }],
      pixels: [{ id: "px1", name: "Pixel" }],
    });
    const debug = seen.find((u) => u.pathname.endsWith("debug_token"))!;
    expect(debug.searchParams.get("access_token")).toBe("app|secret");
    expect(debug.searchParams.has("appsecret_proof")).toBe(false);
    expect(seen.find((u) => u.pathname.endsWith("me/accounts"))!.searchParams.has("appsecret_proof")).toBe(true);
  });

  it("une liste illisible reste vide ; un jeton invalide est une erreur de jeton", async () => {
    const partial = graph([[/debug_token/, { data: { is_valid: true, scopes: ["ads_read"] } }]]);
    expect(await partial.platform.checkAccess!(acc)).toMatchObject({ pages: [], instagram: [], pixels: [] });
    const dead = graph([[/debug_token/, { data: { is_valid: false } }]]);
    await expect(dead.platform.checkAccess!(acc)).rejects.toBeInstanceOf(AdTokenError);
  });

  it("le mode simulé a tous les droits, une Page, un Instagram et un pixel", async () => {
    const r = await createMockMetaPlatform().checkAccess!(acc);
    expect(accessVerdict(r.scopes, { pageId: r.pages[0].id }).canPublish).toBe(true);
  });
});

describe("le verdict", () => {
  it("publier exige ads_management et une Page", () => {
    expect(accessVerdict(["ads_read"], { pageId: "p" })).toMatchObject({ canPublish: false, missing: ["ads_management"] });
    expect(accessVerdict(["ads_management"], { pageId: null }).problems[0]).toMatch(/Aucune Page/);
    expect(accessVerdict(["ads_management", ...["business_management", "pages_show_list", "pages_read_engagement", "pages_manage_ads", "instagram_basic"]], { pageId: "p" })).toEqual({
      canPublish: true,
      missing: [],
      helpfulMissing: [],
      problems: [],
    });
  });

  it("un compte publicitaire fermé bloque, avec le chemin pour le rouvrir", () => {
    const v = accessVerdict(["ads_management"], { pageId: "p", account: metaAccountState(101) });
    expect(v.canPublish).toBe(false);
    expect(v.problems[0]).toMatch(/fermé.*« Activer »/);
    expect(accessVerdict(["ads_management"], { pageId: "p", account: metaAccountState(3) }).problems[0]).toMatch(/impayé/);
  });
});

describe("l'état du compte publicitaire", () => {
  it("seuls actif et délai de grâce diffusent ; un état absent ne bloque pas", () => {
    expect(metaAccountState(1)).toEqual({ ok: true, code: 1, label: "actif" });
    expect(metaAccountState(9).ok).toBe(true);
    expect(metaAccountState(101)).toEqual({ ok: false, code: 101, label: "fermé" });
    expect(metaAccountState(2).ok).toBe(false);
    expect(metaAccountState(undefined).ok).toBe(true);
  });

  it("se lit en direct chez Meta, et accompagne la vérification des droits", async () => {
    const { platform } = graph([
      [/debug_token/, { data: { is_valid: true, scopes: ["ads_management"] } }],
      [/act_42\?/, { account_status: 101, id: "act_42" }],
    ]);
    expect(await platform.accountState!(acc)).toEqual({ ok: false, code: 101, label: "fermé" });
    expect((await platform.checkAccess!(acc)).account).toEqual({ ok: false, code: 101, label: "fermé" });
  });
});
