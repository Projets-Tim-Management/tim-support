import { describe, expect, it, vi } from "vitest";

/**
 * Report du travail après la réponse.
 *
 * Deux garanties comptent : hors contexte de requête (cron, script), le travail
 * doit être exécuté quand même — sinon la notification serait purement perdue —
 * et une erreur ne doit JAMAIS remonter à l'appelant, sous peine d'annuler
 * l'enregistrement qu'elle accompagnait.
 */

describe("afterResponse hors contexte de requête", () => {
  it("exécute le travail au lieu de le perdre", async () => {
    vi.resetModules();
    // `after()` de Next lève hors requête : c'est exactement le cas d'un cron.
    vi.doMock("next/server", () => ({
      after: () => {
        throw new Error("no request scope");
      },
    }));
    const { afterResponse } = await import("@/core/lib/after-response");

    let done = false;
    afterResponse(async () => {
      done = true;
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(done).toBe(true);
  });

  it("avale l'erreur et la signale, sans la propager", async () => {
    vi.resetModules();
    vi.doMock("next/server", () => ({
      after: () => {
        throw new Error("no request scope");
      },
    }));
    const { afterResponse } = await import("@/core/lib/after-response");

    const seen: unknown[] = [];
    expect(() =>
      afterResponse(
        async () => {
          throw new Error("relais injoignable");
        },
        (e) => seen.push(e),
      ),
    ).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect((seen[0] as Error).message).toBe("relais injoignable");
  });
});

describe("afterResponse dans une requête", () => {
  it("confie le travail à la plateforme au lieu de l'exécuter tout de suite", async () => {
    vi.resetModules();
    const deferred: (() => Promise<unknown>)[] = [];
    vi.doMock("next/server", () => ({
      after: (fn: () => Promise<unknown>) => deferred.push(fn),
    }));
    const { afterResponse } = await import("@/core/lib/after-response");

    let done = false;
    afterResponse(async () => {
      done = true;
    });
    // Rien n'a encore tourné : c'est tout l'intérêt.
    expect(done).toBe(false);
    expect(deferred).toHaveLength(1);

    await deferred[0]();
    expect(done).toBe(true);
  });
});
