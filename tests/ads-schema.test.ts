import { describe, expect, it } from "vitest";

import { CHANNELS } from "@/core/lib/channels";
import { AdAccounts } from "@/modules/ads/collections/AdAccounts";
import { AdCampaigns } from "@/modules/ads/collections/AdCampaigns";
import { AdMetricsDaily } from "@/modules/ads/collections/AdMetricsDaily";
import { AD_PLATFORMS, isPlatformKey, platformLabel, validatePlatform } from "@/modules/ads/lib/platforms";
import { decryptSecret } from "@/core/lib/secrets";
import { PASSWORD_MASK } from "@/modules/marketing/lib/credential-secrets";

process.env.PAYLOAD_SECRET ||= "secret-de-test";

type AnyField = { name?: string; fields?: AnyField[]; hooks?: Record<string, ((a: unknown) => unknown)[]>; access?: Record<string, () => boolean> };
const findField = (fields: AnyField[], name: string): AnyField | undefined => {
  for (const f of fields) {
    if (f.name === name) return f;
    const inner = f.fields && findField(f.fields, name);
    if (inner) return inner;
  }
  return undefined;
};
const admin = { req: { user: { roles: ["admin"] } } } as never;

describe("registre des régies", () => {
  it("valide la régie en texte, sans enum", () => {
    expect(isPlatformKey("meta")).toBe(true);
    expect(isPlatformKey("tiktok")).toBe(false);
    expect(validatePlatform("meta")).toBe(true);
    expect(validatePlatform("tiktok")).toMatch(/Régie inconnue/);
    expect(platformLabel("google")).toBe("Google Ads");
  });

  it("ne relie une régie qu'à des canaux qui existent", () => {
    const known = new Set<string>(CHANNELS.map((c) => c.value));
    for (const p of AD_PLATFORMS) for (const c of p.channels) expect(known.has(c), `${p.key} → ${c}`).toBe(true);
  });
});

describe("campagnes et métriques : un miroir, écrit par la synchro seule", () => {
  it("refuse création et modification depuis le back-office, même à un admin", () => {
    for (const col of [AdCampaigns, AdMetricsDaily]) {
      expect((col.access!.create as (a: unknown) => boolean)(admin), col.slug).toBe(false);
      expect((col.access!.update as (a: unknown) => boolean)(admin), col.slug).toBe(false);
      expect((col.access!.read as (a: unknown) => boolean)(admin), col.slug).toBe(true);
    }
  });

  it("refuse la lecture à tout autre rôle (admin seul)", () => {
    const partner = { req: { user: { roles: ["partner-metier"] } } } as never;
    for (const col of [AdAccounts, AdCampaigns, AdMetricsDaily]) {
      expect((col.access!.read as (a: unknown) => boolean)(partner), col.slug).toBe(false);
    }
  });

  it("porte les clés d'unicité du plan (§4.6)", () => {
    expect(AdMetricsDaily.indexes).toEqual([{ fields: ["platform", "level", "externalId", "day"], unique: true }]);
    expect(AdCampaigns.indexes).toEqual([{ fields: ["platform", "externalId"], unique: true }]);
    expect(AdAccounts.indexes).toEqual([{ fields: ["platform", "externalId"], unique: true }]);
  });
});

describe("jetons d'un compte publicitaire", () => {
  const fields = AdAccounts.fields as AnyField[];

  it("le jeton OAuth n'est ni lisible ni inscriptible par l'API", () => {
    const token = findField(fields, "token")!;
    expect(token.access!.read()).toBe(false);
    expect(token.access!.create()).toBe(false);
    expect(token.access!.update()).toBe(false);
  });

  it("le jeton système est chiffré à l'enregistrement et masqué à la lecture", async () => {
    const f = findField(fields, "systemUserToken")!;
    const stored = (await f.hooks!.beforeChange[0]({ value: "EAAB-jeton-systeme", req: {}, originalDoc: undefined })) as string;
    expect(stored).not.toContain("EAAB");
    expect(decryptSecret(stored)).toBe("EAAB-jeton-systeme");
    expect(f.hooks!.afterRead[0]({ value: stored })).toBe(PASSWORD_MASK);
    expect(f.hooks!.afterRead[0]({ value: null })).toBeNull();
  });
});
