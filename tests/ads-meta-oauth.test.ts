import { describe, expect, it } from "vitest";

import { SUPPORT_CONNECTIONS, isConfigured, isSimulated } from "@/core/lib/support-connections";
import { META_SCOPES, metaAuthUrl, metaRedirectUri, openPending, outcomeOf, sealPending } from "@/modules/ads/lib/meta-oauth";

process.env.PAYLOAD_SECRET ||= "secret-de-test";

const NOW = new Date("2026-09-29T08:00:00.000Z");
const acc = (id: string) => ({ externalId: id, name: id, currency: "EUR", timezone: "Europe/Paris" });

describe("écran de consentement Meta", () => {
  const env = { META_APP_ID: "123", NEXT_PUBLIC_SITE_URL: "https://support.tim-management.co/" };

  it("demande la lecture seule, et revient sur la route du module", () => {
    const u = new URL(metaAuthUrl("etat-signe", env));
    expect(u.origin + u.pathname).toBe("https://www.facebook.com/v26.0/dialog/oauth");
    expect(u.searchParams.get("scope")).toBe("ads_read");
    expect(META_SCOPES).not.toContain("ads_management");
    expect(u.searchParams.get("redirect_uri")).toBe("https://support.tim-management.co/api/admin/ads/meta/callback");
    expect(u.searchParams.get("state")).toBe("etat-signe");
  });

  it("suit META_GRAPH_VERSION", () => {
    expect(metaAuthUrl("s", { ...env, META_GRAPH_VERSION: "v27.0" })).toContain("/v27.0/dialog/oauth");
    expect(metaRedirectUri({})).toBe("http://localhost:3001/api/admin/ads/meta/callback");
  });
});

describe("choix en attente (cookie chiffré)", () => {
  const sealed = sealPending({ uid: "4", token: "EAAB-long", expiresAt: "2026-11-28T08:00:00.000Z" }, NOW);

  it("ne laisse pas lire le jeton en clair", () => {
    expect(sealed).not.toContain("EAAB");
  });

  it("s'ouvre pour l'admin qui a lancé la connexion, dans les dix minutes", () => {
    expect(openPending(sealed, 4, new Date(NOW.getTime() + 9 * 60_000))?.token).toBe("EAAB-long");
  });

  it("refuse un autre compte, un choix échu, une valeur altérée", () => {
    expect(openPending(sealed, 5, NOW)).toBeNull();
    expect(openPending(sealed, 4, new Date(NOW.getTime() + 11 * 60_000))).toBeNull();
    expect(openPending(sealed.slice(0, -2) + "xx", 4, NOW)).toBeNull();
    expect(openPending(undefined, 4, NOW)).toBeNull();
  });
});

describe("retour de Meta", () => {
  it("aucun compte, un seul (connecté d'office), ou plusieurs (on choisit)", () => {
    expect(outcomeOf([])).toEqual({ kind: "none" });
    expect(outcomeOf([acc("act_1")])).toEqual({ kind: "single", account: acc("act_1") });
    expect(outcomeOf([acc("act_1"), acc("act_2")])).toEqual({ kind: "choose", count: 2 });
  });
});

describe("connexion du support « meta »", () => {
  const meta = SUPPORT_CONNECTIONS.find((c) => c.key === "meta")!;

  it("exige l'identifiant et le secret de l'app", () => {
    expect(isConfigured(meta, {})).toBe(false);
    expect(isConfigured(meta, { META_APP_ID: "1", META_APP_SECRET: "s" })).toBe(true);
  });

  it("compte comme configurée en données simulées — et le dit", () => {
    expect(isSimulated(meta, { ADS_META_MOCK: "1" })).toBe(true);
    expect(isConfigured(meta, { ADS_META_MOCK: "1" })).toBe(true);
    expect(isSimulated(meta, { ADS_META_MOCK: "0" })).toBe(false);
  });

  it("ne rend aucune autre connexion simulable", () => {
    for (const c of SUPPORT_CONNECTIONS.filter((x) => x.key !== "meta")) expect(isSimulated(c, { ADS_META_MOCK: "1" })).toBe(false);
  });
});
