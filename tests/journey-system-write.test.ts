import { describe, expect, it } from "vitest";

import { sendJourneyEmail } from "@/modules/marketing/lib/send";
import { JOURNEY_SYSTEM_WRITE, withSystemWrite } from "@/modules/marketing/lib/system-write";

/**
 * Le marquage d'un envoi est une écriture SYSTÈME.
 *
 * `guardStructuralEdits` ne laisse un utilisateur non-admin modifier, sur une
 * ligne d'envoi, que sa date programmée et sa dérogation — `sentAt` en est
 * exclu, et doit le rester. Le code qui vient d'envoyer, lui, s'exécute sur la
 * requête de cet utilisateur : sans le drapeau, son constat était effacé comme
 * s'il venait de l'humain.
 *
 * Constaté le 03/09/2026 : `invitation-espace-client` à `null` sur les quatre
 * parcours, alors que Brevo prouvait la remise. Le garde-fou anti-doublon lit
 * précisément ce champ — un second envoi vers le client était possible.
 */

describe("withSystemWrite", () => {
  it("pose le drapeau pendant l'écriture", async () => {
    const req = { context: {} } as never as { context: Record<string, unknown> };
    let vuPendant: unknown;
    await withSystemWrite(req as never, async () => {
      vuPendant = req.context[JOURNEY_SYSTEM_WRITE];
    });
    expect(vuPendant).toBe(true);
  });

  it("le retire ensuite, même si l'écriture échoue", async () => {
    // Un drapeau oublié ferait passer pour un constat du logiciel la
    // modification suivante — celle d'un humain, sur la même requête.
    const req = { context: {} } as never as { context: Record<string, unknown> };
    await expect(
      withSystemWrite(req as never, async () => {
        throw new Error("boum");
      }),
    ).rejects.toThrow("boum");
    expect(req.context[JOURNEY_SYSTEM_WRITE]).toBeUndefined();
  });

  it("s'exécute sans requête (cron, script) sans rien casser", async () => {
    await expect(withSystemWrite(undefined, async () => "ok")).resolves.toBe("ok");
  });
});

describe("sendJourneyEmail — le marquage s'annonce comme une écriture système", () => {
  it("porte le drapeau au moment où il écrit le sentAt", async () => {
    const req = { context: {} } as Record<string, unknown>;
    let drapeauALEcriture: unknown;
    let marque: string | null = null;

    const run = {
      id: 2,
      client: 19,
      partner: 6,
      startDate: "2026-08-31T00:00:00.000Z",
      endDate: "2026-09-28T00:00:00.000Z",
      steps: [],
      emails: [{ key: "invitation-espace-client", audience: "client", sentAt: null }],
    };

    const payload = {
      logger: { info: () => {}, error: () => {} },
      sendEmail: async () => {},
      findByID: async ({ collection }: { collection: string }) =>
        collection === "journey-runs" ? run : { companyName: "TOITURES SA" },
      find: async ({ collection }: { collection: string }) =>
        collection === "client-portal-accounts"
          ? { docs: [{ email: "contact@toitures.fr", firstName: "Charlie" }] }
          : { docs: [] },
      count: async () => ({ totalDocs: 0 }),
      update: async ({ data }: { data: { emails?: Array<{ key?: string; sentAt?: string | null }> } }) => {
        drapeauALEcriture = (req.context as Record<string, unknown>)[JOURNEY_SYSTEM_WRITE];
        marque = data.emails?.find((e) => e.key === "invitation-espace-client")?.sentAt ?? null;
        return run;
      },
    } as never;

    const r = await sendJourneyEmail(payload, {
      run: run as never,
      key: "invitation-espace-client",
      req: req as never,
    });

    expect(r.sent).toBe(true);
    expect(drapeauALEcriture).toBe(true);
    expect(marque).not.toBeNull();
    // Et la requête ressort propre : le drapeau ne survit pas à l'envoi.
    expect((req.context as Record<string, unknown>)[JOURNEY_SYSTEM_WRITE]).toBeUndefined();
  });
});
