import { describe, expect, it } from "vitest";

import { decryptSecret } from "@/core/lib/secrets";
import { AdAccounts } from "@/modules/ads/collections/AdAccounts";
import {
  PURGE_CONTEXT,
  isSyncable,
  sameImpact,
  statusFromTokens,
  upsertConnectedAccount,
} from "@/modules/ads/lib/accounts";
import { PASSWORD_MASK } from "@/modules/marketing/lib/credential-secrets";

process.env.PAYLOAD_SECRET ||= "secret-de-test";

const NOW = new Date("2026-09-29T08:00:00.000Z");
const meta = { externalId: "act_42", name: "TIM — Meta", currency: "EUR", timezone: "Europe/Paris" };

/** Une base en mémoire, juste assez pour find / update / create. */
function fakePayload(docs: Record<string, unknown>[] = []) {
  const calls: { op: string; args: Record<string, unknown> }[] = [];
  const payload = {
    find: async (args: Record<string, unknown>) => {
      calls.push({ op: "find", args });
      const and = ((args.where as { and: Record<string, { equals: unknown }>[] }).and ?? []);
      return { docs: docs.filter((d) => and.every((c) => Object.entries(c).every(([k, v]) => d[k] === v.equals))) };
    },
    update: async (args: Record<string, unknown>) => {
      calls.push({ op: "update", args });
      return {};
    },
    create: async (args: Record<string, unknown>) => {
      calls.push({ op: "create", args });
      return { id: 99 };
    },
  };
  return { payload: payload as never, calls };
}

describe("un compte archivé", () => {
  it("n'est plus synchronisé, les autres états le sont", () => {
    expect(isSyncable({ status: "archive" })).toBe(false);
    for (const s of ["sans-jeton", "connecte", "expire", "erreur"]) expect(isSyncable({ status: s })).toBe(true);
  });
});

describe("état d'un compte d'après ses jetons", () => {
  it("le jeton système prime, même si l'OAuth a expiré", () => {
    expect(statusFromTokens({ systemUserToken: "x", token: "y", tokenExpiresAt: "2026-01-01" }, NOW)).toBe("connecte");
  });
  it("OAuth valide → connecté ; échu → expiré ; aucun → sans jeton", () => {
    expect(statusFromTokens({ token: "y", tokenExpiresAt: "2026-11-01" }, NOW)).toBe("connecte");
    expect(statusFromTokens({ token: "y", tokenExpiresAt: "2026-09-29T08:00:00.000Z" }, NOW)).toBe("expire");
    expect(statusFromTokens({}, NOW)).toBe("sans-jeton");
  });
});

describe("reconnexion OAuth : toujours le même enregistrement", () => {
  it("retrouve le compte par régie + identifiant, même archivé, et le sort de l'archive", async () => {
    const { payload, calls } = fakePayload([{ id: 7, platform: "meta", externalId: "act_42", status: "archive" }]);
    const res = await upsertConnectedAccount(payload, { platform: "meta", account: meta, token: "EAAB-oauth", expiresAt: new Date("2026-11-28") });
    expect(res).toEqual({ id: 7, created: false });
    expect(calls.map((c) => c.op)).toEqual(["find", "update"]);
    const data = calls[1].args.data as Record<string, unknown>;
    expect(data.status).toBe("connecte");
    expect(data.tokenAlertSentAt).toBeNull(); // l'alerte J-7 repart pour la nouvelle échéance
    expect(decryptSecret(data.token as string)).toBe("EAAB-oauth");
  });

  it("ne crée un compte que la première fois", async () => {
    const { payload, calls } = fakePayload([{ id: 7, platform: "meta", externalId: "act_1" }]);
    const res = await upsertConnectedAccount(payload, { platform: "meta", account: meta, token: "t", expiresAt: null });
    expect(res).toEqual({ id: 99, created: true });
    expect(calls.map((c) => c.op)).toEqual(["find", "create"]);
    expect((calls[1].args.data as Record<string, unknown>).externalId).toBe("act_42");
  });
});

describe("suppression d'un compte", () => {
  const hooks = AdAccounts.hooks!;

  it("est fermée à tous par l'API, super-admin compris", () => {
    const superAdmin = { req: { user: { roles: ["super-admin"] } } } as never;
    expect((AdAccounts.access!.delete as (a: unknown) => boolean)(superAdmin)).toBe(false);
  });

  it("est refusée sans le contexte de purge, même en overrideAccess", async () => {
    const req = { context: {}, payload: { delete: async () => ({ errors: [] }) } };
    await expect(hooks.beforeDelete![0]({ req, id: 1 } as never)).rejects.toThrow(/s'archive/);
  });

  it("par la purge, emporte les chiffres puis les campagnes du compte", async () => {
    const deleted: string[] = [];
    const req = { context: { [PURGE_CONTEXT]: true }, payload: { delete: async (a: { collection: string }) => (deleted.push(a.collection), { errors: [] }) } };
    await hooks.beforeDelete![0]({ req, id: 1 } as never);
    expect(deleted).toEqual(["ad-metrics-daily", "ad-campaigns"]);
  });

  it("ne confirme que les chiffres actuels", () => {
    expect(sameImpact({ campaigns: 3, metrics: 120 }, { campaigns: 3, metrics: 120 })).toBe(true);
    expect(sameImpact({ campaigns: 3, metrics: 121 }, { campaigns: 3, metrics: 120 })).toBe(false);
    expect(sameImpact({ campaigns: 0, metrics: 0 }, null)).toBe(false);
  });
});

describe("coller un jeton d'utilisateur système", () => {
  const reconnect = AdAccounts.hooks!.beforeChange![0];

  it("reconnecte le compte, archivé compris", () => {
    const out = reconnect({ data: { systemUserToken: "EAAB-systeme" }, originalDoc: { status: "archive" } } as never) as Record<string, unknown>;
    expect(out.status).toBe("connecte");
    expect(out.lastError).toBeNull();
  });

  it("le masque renvoyé tel quel ne change rien", () => {
    const data = { systemUserToken: PASSWORD_MASK, name: "x" };
    expect(reconnect({ data, originalDoc: { status: "archive" } } as never)).toEqual(data);
  });
});
