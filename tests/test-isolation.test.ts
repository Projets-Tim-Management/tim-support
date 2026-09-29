import { afterEach, describe, expect, it, vi } from "vitest";

import { NetworkBlockedError, declaredNames } from "./setup-isolation";

/** Le garde-fou lui-même : s'il saute, rien d'autre ne le signalerait. */
describe("isolation du banc de test", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ne voit aucune des clés du poste, même chargées dans le shell", () => {
    for (const name of ["DATABASE_URL", "PAYLOAD_SECRET", "BREVO_API_KEY", "PENNYLANE_API_TOKEN", "META_APP_SECRET", "NEXT_PUBLIC_SITE_URL"]) {
      expect(process.env[name], name).toBeUndefined();
    }
  });

  it("retire toute variable déclarée dans .env.local", () => {
    for (const name of declaredNames(`${process.cwd()}/.env.local`)) expect(process.env[name], name).toBeUndefined();
  });

  it("coupe le réseau réel", async () => {
    await expect(fetch("https://api.brevo.com/v3/account")).rejects.toBeInstanceOf(NetworkBlockedError);
  });

  it("laisse un test simuler sa réponse, puis recoupe le réseau", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}"));
    expect((await fetch("https://exemple.test")).ok).toBe(true);
    vi.unstubAllGlobals();
    await expect(fetch("https://exemple.test")).rejects.toBeInstanceOf(NetworkBlockedError);
  });
});
