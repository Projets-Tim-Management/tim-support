import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { AdAccounts } from "@/modules/ads/collections/AdAccounts";
import { upsertConnectedAccount } from "@/modules/ads/lib/accounts";
import { allowedAccounts, isAllowedAccount, refusal } from "@/modules/ads/lib/allowlist";
import { createMetaPlatform } from "@/modules/ads/platforms/meta";
import { MOCK_ACCOUNT_ID } from "@/modules/ads/platforms/meta-mock";

/**
 * Le profil qui connecte voit aussi des comptes publicitaires personnels. Seuls
 * ceux de la liste entrent — et sans liste, aucun.
 */
describe("liste des comptes autorisés", () => {
  const env = { META_ALLOWED_AD_ACCOUNTS: "act_211325410243618, 42" };

  it("lit la variable, et normalise un identifiant sans « act_ »", () => {
    expect([...allowedAccounts(env)]).toEqual(["act_211325410243618", "act_42"]);
  });

  it("n'accepte que les comptes de la liste", () => {
    expect(isAllowedAccount("act_211325410243618", env)).toBe(true);
    expect(isAllowedAccount("act_999", env)).toBe(false);
    expect(isAllowedAccount(null, env)).toBe(false);
  });

  it("est FERMÉE sans la variable : aucun compte réel n'entre", () => {
    expect(isAllowedAccount("act_211325410243618", {})).toBe(false);
    expect(refusal("act_1", {})).toMatch(/Posez META_ALLOWED_AD_ACCOUNTS/);
  });

  it("n'accepte le compte simulé qu'en données simulées", () => {
    expect(isAllowedAccount(MOCK_ACCOUNT_ID, { ADS_META_MOCK: "1" })).toBe(true);
    expect(isAllowedAccount(MOCK_ACCOUNT_ID, env)).toBe(false);
  });
});

describe("fiche d'un compte publicitaire", () => {
  afterEach(() => vi.unstubAllEnvs());
  const enforce = AdAccounts.hooks!.beforeValidate![0] as (a: unknown) => unknown;

  it("ne se crée jamais par le formulaire natif", () => {
    const admin = { req: { user: { roles: ["super-admin"] } } } as never;
    expect((AdAccounts.access!.create as (a: unknown) => boolean)(admin)).toBe(false);
  });

  it("refuse un compte hors liste, quel que soit le chemin (overrideAccess compris)", () => {
    vi.stubEnv("META_ALLOWED_AD_ACCOUNTS", "act_211325410243618");
    expect(() => enforce({ operation: "create", data: { externalId: "act_999" } })).toThrow(/act_999 refusé/);
    expect(enforce({ operation: "create", data: { externalId: "act_211325410243618" } })).toEqual({ externalId: "act_211325410243618" });
  });

  it("laisse archiver un compte déjà présent hors liste (le simulé, en production)", () => {
    vi.stubEnv("META_ALLOWED_AD_ACCOUNTS", "act_211325410243618");
    const data = { status: "archive" };
    expect(enforce({ operation: "update", data, originalDoc: { externalId: MOCK_ACCOUNT_ID } })).toBe(data);
  });
});

describe("connexion par jeton d'utilisateur système", () => {
  it("crée le compte avec le jeton système, sans échéance ni jeton OAuth", async () => {
    const calls: { op: string; data?: Record<string, unknown> }[] = [];
    const payload = {
      find: async () => ({ docs: [] }),
      create: async ({ data }: { data: Record<string, unknown> }) => (calls.push({ op: "create", data }), { id: 5 }),
      update: async () => ({}),
    } as never;
    const account = { externalId: "act_211325410243618", name: "TIM Management", currency: "EUR", timezone: "Europe/Paris" };
    expect(await upsertConnectedAccount(payload, { platform: "meta", account, token: "EAAsys", expiresAt: null, kind: "system" })).toEqual({ id: 5, created: true });
    const data = calls[0].data!;
    // En clair ici : c'est le champ qui chiffre à l'enregistrement.
    expect(data).toMatchObject({ systemUserToken: "EAAsys", status: "connecte", name: "TIM Management", externalId: "act_211325410243618" });
    expect(data).not.toHaveProperty("token");
    expect(data).not.toHaveProperty("tokenExpiresAt");
  });
});

describe("appsecret_proof", () => {
  it("accompagne chaque appel fait avec un jeton", async () => {
    const seen: URL[] = [];
    const platform = createMetaPlatform({
      appId: "app",
      appSecret: "secret-app",
      version: "v26.0",
      now: () => new Date(),
      fetch: async (u: string) => (seen.push(new URL(u)), new Response(JSON.stringify({ data: [] }))),
    });
    await platform.listAccounts("EAAsys");
    expect(seen[0].searchParams.get("appsecret_proof")).toBe(createHmac("sha256", "secret-app").update("EAAsys").digest("hex"));
  });
});
