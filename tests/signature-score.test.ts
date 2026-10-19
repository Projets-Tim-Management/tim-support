import { describe, expect, it } from "vitest";

import { potentialOf, rankRequesters, relId, type Requester } from "@/modules/dev/lib/potential-shared";
import { scoreTone, signatureScore, type ScoreActivity } from "@/modules/partner/lib/signature-score";

const NOW = new Date("2026-10-19T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const task = (taskKind: string, days: number, done = true): ScoreActivity => ({ type: "tache", taskKind, done, doneAt: done ? daysAgo(days) : null, occurredAt: daysAgo(days) });
const mail = (direction: "recu" | "envoye", days: number): ScoreActivity => ({ type: "email", emailDirection: direction, occurredAt: daysAgo(days) });

describe("signatureScore", () => {
  it("donne la base du statut quand on vient d'échanger sans rien qui compte", () => {
    const s = signatureScore("demo-programmee", [mail("envoye", 2)], NOW);
    expect(s.score).toBe(25);
    expect(s.silent).toBe(false);
  });

  it("ajoute les réunions, appels et réponses des 60 derniers jours", () => {
    const s = signatureScore("attente-engagement", [task("reunion", 5), task("appel", 10), mail("recu", 20)], NOW);
    expect(s.score).toBe(40 + 4 + 3 + 2);
    expect(s.explanation).toBe("En attente d'engagement 40 % + 1 réunion + 1 appel + 1 réponse = 49 %");
  });

  it("compte un déjeuner comme une réunion, ignore une tâche non faite ou trop ancienne", () => {
    const s = signatureScore("en-test", [task("dejeuner", 3), task("appel", 4, false), task("reunion", 70)], NOW);
    expect(s.meetings).toBe(1);
    expect(s.calls).toBe(0);
    expect(s.score).toBe(64);
  });

  it("plafonne le bonus à +15", () => {
    const many = Array.from({ length: 10 }, (_, i) => task("reunion", i + 1));
    expect(signatureScore("en-test", many, NOW).score).toBe(75);
  });

  it("ne dépasse jamais la base du statut suivant", () => {
    const many = Array.from({ length: 10 }, (_, i) => task("reunion", i + 1));
    // Démo programmée 25 + 15 = 40 : c'est la base d'« En attente d'engagement », plafonné à 39.
    expect(signatureScore("demo-programmee", many, NOW).score).toBe(39);
  });

  it("retire 10 points sans échange depuis 30 jours, sans passer sous zéro", () => {
    expect(signatureScore("en-test", [task("appel", 45)], NOW).score).toBe(60 + 3 - 10);
    expect(signatureScore("nouvelle", [], NOW).score).toBe(0);
    expect(signatureScore("en-test", [], NOW).explanation).toContain("silence depuis 30 jours");
  });

  it("ne compte pas le silence d'une opportunité ouverte depuis moins de 30 jours", () => {
    expect(signatureScore("nouvelle", [], NOW, daysAgo(3)).score).toBe(5);
    expect(signatureScore("nouvelle", [], NOW, daysAgo(40)).score).toBe(0);
  });

  it("fige Gagnée à 50 et Perdue à 0", () => {
    expect(signatureScore("actif", [task("reunion", 1)], NOW).score).toBe(50);
    expect(signatureScore("perdue", [task("reunion", 1)], NOW).score).toBe(0);
  });

  it("ignore un échange daté dans le futur", () => {
    expect(signatureScore("en-test", [task("reunion", -3)], NOW).meetings).toBe(0);
  });

  it("ne plafonne pas un statut du pipeline sur la base d'un client gagné", () => {
    const many = Array.from({ length: 10 }, (_, i) => task("reunion", i + 1));
    expect(signatureScore("attente-engagement", many, NOW).score).toBe(55);
  });

  it("teinte le % sur cinq crans", () => {
    expect([10, 25, 45, 65, 90].map(scoreTone)).toEqual(["froid", "frais", "tiede", "chaud", "brulant"]);
  });
});

describe("potentiel d'un développement", () => {
  const r = (id: number, status: string, score: number, company = `E${id}`): Requester => ({ id, company, status, score, explanation: "" });

  it("prend le plus gros %, puis le statut le plus avancé", () => {
    const ranked = rankRequesters([r(1, "attente-engagement", 50), r(2, "en-test", 50), r(3, "nouvelle", 72)]);
    expect(ranked.map((x) => x.id)).toEqual([3, 2, 1]);
  });

  it("ne stocke rien sans demandeur", () => {
    expect(potentialOf([])).toEqual({ potential: null, potentialDetail: null });
    expect(potentialOf([r(1, "en-test", 60), r(2, "nouvelle", 5)]).potential).toBe(60);
  });

  it("lit l'id d'une relation peuplée ou non", () => {
    expect([relId(4), relId("5"), relId({ id: 6 }), relId(null), relId("")]).toEqual([4, 5, 6, null, null]);
  });
});

describe("infobulle du potentiel", () => {
  it("liste les demandeurs avec leur statut et leur %", async () => {
    const { requestersTip } = await import("@/modules/dev/lib/potential-shared");
    expect(requestersTip({ requesters: [{ id: 1, company: "ACME", status: "en-test", score: 75, explanation: "" }] })).toBe(
      "Demandé par\nACME · En phase de test · 75 %",
    );
    expect(requestersTip(null)).toBe("");
  });
});
