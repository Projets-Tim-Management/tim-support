import { describe, expect, it } from "vitest";

import { windowsFor } from "@/modules/partner/lib/mailbox/sync";

/**
 * Les fenêtres de lecture d'une boîte.
 *
 * Deux curseurs qui avancent en sens inverse : le présent monte, la reprise du
 * passé descend. Une erreur ici ne se voit pas — elle saute des messages, ou
 * relit indéfiniment les mêmes.
 */

const iso = (s: string) => new Date(s).toISOString();
const NOW = new Date("2026-09-04T12:00:00Z");

const conn = (over: Record<string, unknown> = {}) => ({
  id: 1,
  syncSince: iso("2025-09-04"),
  syncedUpTo: iso("2026-09-04"),
  backfillBefore: iso("2026-09-04"),
  ...over,
});

describe("le présent", () => {
  it("passe toujours en premier", () => {
    // Un message reçu il y a une heure vaut plus qu'un message d'il y a six
    // mois : si le plafond tombe, c'est la reprise du passé qui attend.
    const [first] = windowsFor(conn(), NOW);
    expect(first.before).toBeUndefined();
  });

  it("recouvre d'un jour le passage précédent", () => {
    /**
     * Gmail filtre par JOUR. Sans recouvrement, un message arrivé pendant le
     * passage précédent serait sauté définitivement — et rien ne le dirait.
     * Le doublon, lui, est écarté par le Message-ID.
     */
    const [first] = windowsFor(conn({ syncedUpTo: iso("2026-09-04") }), NOW);
    expect(first.since.toISOString().slice(0, 10)).toBe("2026-09-03");
  });
});

describe("la reprise du passé", () => {
  it("découpe en tranches d'un mois, du plus récent au plus ancien", () => {
    const w = windowsFor(conn(), NOW).slice(1);
    expect(w[0].before?.toISOString().slice(0, 10)).toBe("2026-09-04");
    expect(w[0].since.toISOString().slice(0, 10)).toBe("2026-08-05");
    // Chaque tranche reprend exactement où la précédente s'est arrêtée.
    expect(w[1].before?.toISOString()).toBe(w[0].since.toISOString());
  });

  it("ne descend jamais sous la date de reprise choisie à la connexion", () => {
    // C'est l'engagement pris : les échanges antérieurs ne sont pas repris.
    const w = windowsFor(conn(), NOW);
    const oldest = w[w.length - 1].since;
    expect(oldest.toISOString().slice(0, 10)).toBe("2025-09-04");
    expect(w.every((x) => x.since >= new Date(iso("2025-09-04")))).toBe(true);
  });

  it("s'arrête quand le passé est rattrapé", () => {
    // Plus qu'une fenêtre : le présent. La reprise ne repart pas en boucle.
    const done = windowsFor(conn({ backfillBefore: iso("2025-09-04") }), NOW);
    expect(done).toHaveLength(1);
    expect(done[0].before).toBeUndefined();
  });

  it("repart d'où elle s'était arrêtée, pas du début", () => {
    const w = windowsFor(conn({ backfillBefore: iso("2026-03-01") }), NOW).slice(1);
    expect(w[0].before?.toISOString().slice(0, 10)).toBe("2026-03-01");
  });
});

describe("une connexion sans curseur", () => {
  it("tient debout : un an en arrière, découpé", () => {
    // Cas d'une ligne créée avant l'existence des curseurs.
    const w = windowsFor({ id: 1 }, NOW);
    expect(w.length).toBeGreaterThan(1);
    expect(w[0].before).toBeUndefined();
  });
});
