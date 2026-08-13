import { beforeAll, describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret, readState, signState } from "@/core/lib/secrets";
import { generateSlots } from "@/modules/marketing/lib/scheduling";

beforeAll(() => {
  process.env.PAYLOAD_SECRET = "secret-de-test-pour-les-jetons-agenda";
});

describe("chiffrement des jetons d'agenda", () => {
  it("chiffre et déchiffre à l'identique", () => {
    const token = "1//0abcDEF-refresh-token-google";
    expect(decryptSecret(encryptSecret(token))).toBe(token);
  });

  it("ne produit jamais deux fois le même chiffré (IV aléatoire)", () => {
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });

  it("refuse une valeur altérée au lieu de renvoyer n'importe quoi", () => {
    const enc = encryptSecret("token");
    const [iv, tag, data] = enc.split(".");
    expect(decryptSecret(`${iv}.${tag}.${data.slice(0, -2)}AA`)).toBeNull();
    expect(decryptSecret("n'importe quoi")).toBeNull();
    expect(decryptSecret(null)).toBeNull();
  });

  it("devient illisible si le secret racine change", () => {
    const enc = encryptSecret("token");
    process.env.PAYLOAD_SECRET = "un-autre-secret";
    expect(decryptSecret(enc)).toBeNull();
    process.env.PAYLOAD_SECRET = "secret-de-test-pour-les-jetons-agenda";
  });
});

describe("state OAuth signé", () => {
  it("relit ce qu'il a signé", () => {
    const state = signState({ partnerId: "42", provider: "google" });
    expect(readState<{ partnerId: string }>(state)?.partnerId).toBe("42");
  });

  it("rejette un state falsifié", () => {
    const state = signState({ partnerId: "42" });
    const [body] = state.split(".");
    // Charge modifiée (partenaire 99), signature d'origine.
    const forged = Buffer.from(JSON.stringify({ partnerId: "99", exp: 9e9 })).toString("base64url");
    expect(readState(`${forged}.${state.split(".")[1]}`)).toBeNull();
    expect(readState(body)).toBeNull();
    expect(readState(null)).toBeNull();
  });

  it("rejette un state expiré", () => {
    expect(readState(signState({ partnerId: "42" }, -1))).toBeNull();
  });
});

describe("créneaux et agenda occupé", () => {
  const now = Date.parse("2026-08-07T09:00:00Z"); // vendredi

  it("retire les créneaux qui chevauchent une période occupée", () => {
    const all = generateSlots({ rules: null, nowMs: now });
    const first = all[0];
    // Rendez-vous existant qui empiète sur la SECONDE moitié du créneau.
    const busy = [
      {
        start: new Date(Date.parse(first) + 30 * 60_000).toISOString(),
        end: new Date(Date.parse(first) + 90 * 60_000).toISOString(),
      },
    ];
    const rest = generateSlots({ rules: null, nowMs: now, busy });
    expect(rest).not.toContain(first);
    // Le créneau suivant démarre pendant l'occupation : lui aussi doit sauter.
    expect(rest).not.toContain(all[1]);
    expect(rest).toContain(all[2]);
  });

  it("garde un créneau qui se termine juste avant une occupation", () => {
    const all = generateSlots({ rules: null, nowMs: now });
    const first = all[0];
    const busy = [
      {
        start: new Date(Date.parse(first) + 45 * 60_000).toISOString(),
        end: new Date(Date.parse(first) + 120 * 60_000).toISOString(),
      },
    ];
    expect(generateSlots({ rules: null, nowMs: now, busy })).toContain(first);
  });

  it("ignore les périodes occupées mal formées", () => {
    const all = generateSlots({ rules: null, nowMs: now });
    const busy = [
      { start: "pas-une-date", end: "non-plus" },
      { start: all[0], end: all[0] }, // durée nulle
    ];
    expect(generateSlots({ rules: null, nowMs: now, busy })).toHaveLength(all.length);
  });
});
