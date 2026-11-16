import { describe, expect, it } from "vitest";

import { minAgentBudgetEur } from "@/modules/ads/agent/tools";
import { buildTeamSpend } from "@/modules/ai-team/lib/spend";

/**
 * Ce que coûte l'équipe IA : par agent, au total par chef, et des pistes
 * d'optimisation qui disent où est vraiment le levier.
 */
const NOW = new Date("2026-11-12T10:00:00Z");
const members = [
  { id: 1, key: "chef-sea", name: "Margaux", level: "chef", engineRoles: ["orchestrateur", "analyste"] },
  { id: 2, key: "sea-redacteur", name: "Léa", level: "sous-agent", engineRoles: ["redacteur"] },
  { id: 3, key: "sea-stratege", name: "Hugo", level: "sous-agent", engineRoles: ["stratege"] },
];
const floorRed = minAgentBudgetEur("redacteur");
const agent = (role: string, budget: number, spent: number, at: string) => ({ role, budgetEur: budget, spentEur: spent, createdAt: at });

describe("le budget IA de l'équipe", () => {
  const s = buildTeamSpend({
    members,
    agents: [
      agent("orchestrateur", 3, 0.3, "2026-11-02T08:00:00Z"),
      agent("analyste", 1.5, 0.05, "2026-10-20T08:00:00Z"),
      agent("redacteur", floorRed, 0.1, "2026-11-02T08:00:00Z"),
      agent("redacteur", floorRed, 0.12, "2026-10-02T08:00:00Z"),
      agent("redacteur", floorRed, 0.14, "2026-09-02T08:00:00Z"),
      agent("stratege", 3, 0.2, "2026-11-02T08:00:00Z"),
      agent("stratege", 3, 0.25, "2026-10-02T08:00:00Z"),
      agent("stratege", 3, 0.3, "2026-09-02T08:00:00Z"),
    ],
    messages: [{ member: 1, costEur: 0.02, createdAt: "2026-11-10T08:00:00Z" }],
    questions: [{ costEur: 0.03, askedAt: "2026-11-05T08:00:00Z" }, { costEur: 9, askedAt: "2026-10-05T08:00:00Z" }],
    capMonthEur: 200,
    now: NOW,
  });
  const by = (k: string) => s.members.find((m) => m.key === k)!;

  it("détaille chaque agent : le mois, et depuis le début", () => {
    expect(by("sea-redacteur").month).toMatchObject({ missions: 1, spentEur: 0.1 });
    expect(by("sea-redacteur").all).toMatchObject({ missions: 3, spentEur: 0.36, maxEur: 0.14 });
    expect(by("sea-redacteur").floorEur).toBe(floorRed);
    expect(by("chef-sea").floorEur).toBeNull();
  });

  it("compte pour le chef ses passages, ses conversations et les questions du mois", () => {
    expect(by("chef-sea")).toMatchObject({ conversationsEur: 0.02, questionsEur: 0.03 });
    expect(by("chef-sea").month.spentEur).toBe(0.3);
    // Total du mois : 0,30 + 0,02 + 0,03 (chef) + 0,10 (Léa) + 0,20 (Hugo).
    expect(s.teamMonthEur).toBe(0.65);
    expect(s.capMonthEur).toBe(200);
  });

  it("dit où est le levier : le plancher du moteur, ou un budget qu'on peut baisser", () => {
    const lea = s.hints.find((h) => h.memberKey === "sea-redacteur")!;
    expect(lea.tone).toBe("info");
    expect(lea.text).toMatch(/plancher du moteur/);
    expect(lea.text).toMatch(/Margaux ne peut pas confier moins/);
    const hugo = s.hints.find((h) => h.memberKey === "sea-stratege");
    // Hugo reçoit 3 € quand le plancher est plus bas : on peut baisser.
    if (3 > minAgentBudgetEur("stratege") * 1.05) {
      expect(hugo?.tone).toBe("save");
      expect(hugo?.text).toMatch(/suffiraient/);
    }
  });

  it("ne conclut rien en dessous de 3 missions", () => {
    const few = buildTeamSpend({ members, agents: [agent("redacteur", 1, 0.01, "2026-11-02T08:00:00Z")], messages: [], questions: [], capMonthEur: null, now: NOW });
    expect(few.hints).toEqual([]);
  });
});

describe("la moyenne par jour, sur les cartes", async () => {
  const { monthTotal, perDay } = await import("@/modules/ai-team/lib/spend");
  it("divise le total du mois par les jours écoulés, aujourd'hui compris", () => {
    const s = buildTeamSpend({ members, agents: [agent("redacteur", 1, 0.6, "2026-11-02T08:00:00Z")], messages: [], questions: [], capMonthEur: null, now: NOW });
    expect(s.daysElapsed).toBe(12);
    expect(perDay(0.6, s.daysElapsed)).toBe(0.05);
    expect(perDay(1, 0)).toBe(0);
  });

  it("compte pour un chef ses passages, ses conversations et ses questions", () => {
    const chief = { key: "c", name: "M", level: "chef" as const, floorEur: null, month: { missions: 1, budgetEur: 3, spentEur: 0.3, usedPct: 10, avgEur: 0.3, maxEur: 0.3 }, all: { missions: 1, budgetEur: 3, spentEur: 0.3, usedPct: 10, avgEur: 0.3, maxEur: 0.3 }, conversationsEur: 0.02, questionsEur: 0.03 };
    expect(monthTotal(chief)).toBe(0.35);
  });
});

describe("le budget du chef sur sa carte", () => {
  it("lit le budget posé sur la fiche, les jours du mois, et fait foi du registre pour le total", () => {
    const s = buildTeamSpend({
      members: [{ ...members[0], monthlyAiBudgetEur: 15 }, members[1]],
      agents: [agent("redacteur", 1, 0.6, "2026-11-02T08:00:00Z")],
      messages: [],
      questions: [],
      capMonthEur: 200,
      now: NOW,
      registryMonthEur: 3.456,
    });
    expect(s).toMatchObject({ budgetEur: 15, daysInMonth: 30, daysElapsed: 12, teamMonthEur: 3.46 });
  });
});
