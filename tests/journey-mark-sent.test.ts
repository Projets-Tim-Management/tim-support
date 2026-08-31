import { describe, expect, it } from "vitest";

import { ROLES } from "@/core/access";
import { guardStructuralEdits } from "@/modules/marketing/collections/JourneyRuns";

/**
 * Qui a le droit d'écrire `sentAt` sur une ligne d'envoi.
 *
 * Deux exigences qui tirent en sens inverse, et c'est tout l'enjeu :
 *
 *  - un PARTENAIRE ne doit pas pouvoir marquer un envoi comme parti depuis la
 *    fiche. Il ferait taire un message qui n'a jamais quitté le serveur, sans
 *    que rien ne le signale. `sentAt` est donc absent d'EMAIL_OWN_FIELDS ;
 *
 *  - le HOOK qui vient d'envoyer l'e-mail doit pouvoir le noter — or il
 *    s'exécute sur la requête de ce même partenaire, avec son utilisateur.
 *
 * Le drapeau `req.context` sépare les deux. Sans lui, la correction de
 * l'interblocage (passer `req` à markEmailSent) aurait rendu le marquage
 * silencieusement inopérant pour tout envoi déclenché par un partenaire —
 * c'est-à-dire pour « demande-recue », le plus fréquent de tous.
 */

// Rôles pris à leur source : un libellé recopié à la main ferait passer le test
// pour un utilisateur qui n'existe pas, donc sans jamais éprouver la règle.
const partenaire = { id: 7, roles: [ROLES.partnerMetier] };
const admin = { id: 1, roles: [ROLES.admin] };

/** État en base : deux lignes du modèle, aucune encore partie. */
const original = () => ({
  emails: [
    { key: "demande-recue", audience: "tim", scheduledAt: null, sentAt: null },
    { key: "check-in", audience: "client", scheduledAt: "2026-09-07T06:00:00.000Z", sentAt: null },
  ],
});

/** Ce qu'une écriture propose : « demande-recue » vient de partir. */
const marquage = () => ({
  emails: [
    { key: "demande-recue", audience: "tim", scheduledAt: null, sentAt: "2026-08-31T09:00:00.000Z" },
    { key: "check-in", audience: "client", scheduledAt: "2026-09-07T06:00:00.000Z", sentAt: null },
  ],
});

type LigneEnvoi = { key: string; sentAt: string | null; scheduledAt: string | null };
type Sortie = { emails: LigneEnvoi[] };

const passer = (user: unknown, context: Record<string, unknown> = {}) =>
  guardStructuralEdits({
    data: marquage(),
    originalDoc: original(),
    req: { user, context },
  } as never) as Sortie;

const ligne = (out: Sortie, key: string) => out.emails.find((e) => e.key === key);

describe("marquage d'un envoi comme parti", () => {
  it("refuse le marquage venu d'un partenaire", () => {
    expect(ligne(passer(partenaire), "demande-recue")?.sentAt).toBeNull();
  });

  it("accepte le marquage du logiciel, même sur la requête d'un partenaire", () => {
    const out = passer(partenaire, { journeySystemWrite: true });
    expect(ligne(out, "demande-recue")?.sentAt).toBe("2026-08-31T09:00:00.000Z");
  });

  it("ne touche pas aux lignes que l'écriture ne vise pas", () => {
    const out = passer(partenaire, { journeySystemWrite: true });
    expect(ligne(out, "check-in")?.sentAt).toBeNull();
    expect(ligne(out, "check-in")?.scheduledAt).toBe("2026-09-07T06:00:00.000Z");
  });

  it("laisse un admin écrire sans drapeau", () => {
    expect(ligne(passer(admin), "demande-recue")?.sentAt).toBe("2026-08-31T09:00:00.000Z");
  });

  it("laisse passer une écriture sans utilisateur (cron, route système)", () => {
    expect(ligne(passer(undefined), "demande-recue")?.sentAt).toBe("2026-08-31T09:00:00.000Z");
  });

  it("continue d'autoriser un partenaire à décaler une date d'envoi", () => {
    // Le garde ne doit pas devenir un mur : `scheduledAt` reste son champ.
    const out = guardStructuralEdits({
      data: {
        emails: [
          { key: "demande-recue", sentAt: "2026-08-31T09:00:00.000Z", scheduledAt: null },
          { key: "check-in", sentAt: null, scheduledAt: "2026-09-09T06:00:00.000Z" },
        ],
      },
      originalDoc: original(),
      req: { user: partenaire, context: {} },
    } as never) as Sortie;

    expect(out.emails.find((e) => e.key === "check-in")?.scheduledAt).toBe("2026-09-09T06:00:00.000Z");
    expect(out.emails.find((e) => e.key === "demande-recue")?.sentAt).toBeNull();
  });
});
