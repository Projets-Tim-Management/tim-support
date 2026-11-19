import { describe, expect, it } from "vitest";

import { DIRECTION_EMAIL, hideUnlessDirection, isDirection } from "@/core/access";
import { AGENT_ROLES } from "@/modules/ads/collections/AdAgents";
import { AiTeamMembers } from "@/modules/ai-team/collections/AiTeamMembers";
import { PORTRAITS } from "@/modules/ai-team/lib/portraits";
import { AI_TEAM_SEED, engineRoleOwner } from "@/modules/ai-team/lib/team";

/**
 * L'équipe d'agents IA n'existe que pour la direction : super-admin ET
 * direction@ — les deux, pas l'un ou l'autre (décision du 12/11/2026).
 */
describe("l'accès à l'équipe IA", () => {
  const direction = { email: DIRECTION_EMAIL, roles: ["super-admin"] };

  it("est ouvert à direction@ quand elle est super-admin", () => {
    expect(isDirection(direction)).toBe(true);
    expect(isDirection({ ...direction, email: " Direction@TIM-management.co " })).toBe(true);
    expect(hideUnlessDirection({ user: direction } as never)).toBe(false);
  });

  it("est fermé à un autre super-admin, à direction@ sans le rôle, et à un admin", () => {
    expect(isDirection({ email: "autre@tim-management.co", roles: ["super-admin"] })).toBe(false);
    expect(isDirection({ email: DIRECTION_EMAIL, roles: ["admin"] })).toBe(false);
    expect(isDirection({ email: "admin@tim-management.co", roles: ["admin"] })).toBe(false);
    expect(isDirection(null)).toBe(false);
    expect(hideUnlessDirection({ user: { email: "x@y.fr", roles: ["super-admin"] } } as never)).toBe(true);
  });

  it("ne laisse créer ni supprimer une fiche, même à la direction", () => {
    const access = AiTeamMembers.access!;
    const req = { req: { user: direction } } as never;
    expect(access.read!(req)).toBe(true);
    expect(access.update!(req)).toBe(true);
    expect(access.create!(req)).toBe(false);
    expect(access.delete!(req)).toBe(false);
    expect(access.read!({ req: { user: { email: "admin@tim-management.co", roles: ["admin"] } } } as never)).toBe(false);
  });
});

describe("la composition de l'équipe", () => {
  it("donne chaque rôle du moteur à une seule personne, et n'en oublie aucun", () => {
    const roles = AI_TEAM_SEED.flatMap((m) => m.engineRoles);
    expect(new Set(roles).size).toBe(roles.length);
    expect([...roles].sort()).toEqual(AGENT_ROLES.map((r) => r.value).sort());
    // Les suivis Meta passent à Camille, cheffe Meta Ads ; Mark garde la préparation.
    expect(engineRoleOwner("analyste")?.key).toBe("sea-meta");
    expect(engineRoleOwner("orchestrateur")?.key).toBe("chef-sea");
  });

  it("rattache chaque sous-agent à un chef existant, et aucun chef à un chef", () => {
    const chiefs = new Set(AI_TEAM_SEED.filter((m) => m.level === "chef").map((m) => m.key));
    for (const m of AI_TEAM_SEED) {
      if (m.level === "chef") expect(m.chiefKey).toBeUndefined();
      else expect(chiefs.has(m.chiefKey!)).toBe(true);
    }
  });

  it("a des identifiants uniques et des visages connus", () => {
    const keys = AI_TEAM_SEED.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const m of AI_TEAM_SEED) expect(PORTRAITS).toContain(m.portrait);
  });
});

describe("l'activité de l'équipe", async () => {
  const { buildTeamView, personalize, resultText } = await import("@/modules/ai-team/lib/activity");
  const NOW = new Date("2026-11-12T10:00:00Z");
  const members = [
    { id: 1, key: "chef-sea", name: "Mark", jobTitle: "Cheffe SEA", level: "chef", portrait: "chef-sea", engineRoles: ["orchestrateur", "analyste"] },
    { id: 2, key: "sea-redacteur", name: "Léa", jobTitle: "Rédactrice", level: "sous-agent", portrait: "redacteur", chief: 1, engineRoles: ["redacteur"] },
    { id: 3, key: "sea-controleur", name: "Inès", jobTitle: "Contrôleuse", level: "sous-agent", portrait: "controleur", chief: 1, engineRoles: ["controleur"] },
  ];
  const agents = [
    { id: 10, role: "redacteur", status: "en-cours", mission: "Écris deux accroches", run: 100, createdAt: "2026-11-12T09:00:00Z", spentEur: "0.12" },
    { id: 11, role: "redacteur", status: "termine", mission: "Écris un texte", result: { resume: "Les **deux** textes sont prêts." }, run: 100, createdAt: "2026-11-02T08:00:00Z", spentEur: 0.1 },
    { id: 12, role: "analyste", status: "termine", mission: "Suivi", run: 101, createdAt: "2026-10-20T08:00:00Z", spentEur: 0.5 },
  ];
  const runs = [
    { id: 100, campaign: 7, kind: "preparation", status: "a-valider", summary: "Deux angles proposés.", costEur: 1.2, startedAt: "2026-11-02T08:00:00Z" },
    { id: 101, campaign: 7, kind: "quotidien", status: "termine", summary: "RAS", costEur: 0.5, startedAt: "2026-10-20T08:00:00Z" },
  ];
  const steps = [
    { line: "Le rédacteur écrit les accroches.", agent: 10, createdAt: "2026-11-12T09:01:00Z" },
    { line: "L'analyste lit les résultats sur 7 jours.", agent: 12, createdAt: "2026-10-20T08:01:00Z" },
  ];
  const v = buildTeamView({ members, agents, runs, campaigns: [{ id: 7, name: "Campagne test" }], steps, pendingValidations: 3, now: NOW });
  const by = (k: string) => v.members.find((m) => m.key === k)!;

  it("remplace le rôle par le prénom en tête de ligne, et seulement là", () => {
    const names = new Map([["analyste", "Mark"]]);
    expect(personalize("L'analyste lit les résultats.", names)).toEqual({ line: "Mark lit les résultats.", role: "analyste" });
    expect(personalize("Rien à voir avec L'analyste", names).line).toBe("Rien à voir avec L'analyste");
    expect(v.feed[0]).toMatchObject({ memberKey: "sea-redacteur", line: "Léa écrit les accroches." });
  });

  it("donne l'état de chacun : au travail, attend la direction, au repos", () => {
    expect(by("sea-redacteur").state).toBe("travail");
    expect(by("sea-redacteur").stateLine).toMatch(/^Au travail : Écris deux accroches/);
    expect(by("chef-sea").state).toBe("validation");
    expect(by("chef-sea").stateLine).toBe("3 créas attendent votre validation");
    expect(by("sea-controleur")).toMatchObject({ state: "repos", stateLine: "Pas encore de mission" });
  });

  it("compte les missions et le coût du mois, et rend le compte rendu en texte", () => {
    expect(by("sea-redacteur")).toMatchObject({ monthMissions: 2, monthCostEur: 0.22 });
    expect(by("sea-redacteur").missions[1]).toMatchObject({ campaign: "Campagne test", result: "Les deux textes sont prêts." });
    expect(by("chef-sea").monthMissions).toBe(0);
    expect(by("chef-sea").runs.map((r) => r.kind)).toEqual(["Préparation de campagne", "Suivi (tous les 2 jours)"]);
    expect(resultText(null)).toBeNull();
    expect(resultText("  ")).toBeNull();
  });
});

describe("la pause d'un membre", async () => {
  const { pausedRoles, pausedReason, teamPort } = await import("@/modules/ai-team/lib/availability");
  const { buildTeamView, firstSentence } = await import("@/modules/ai-team/lib/activity");
  const fakePayload = (docs: unknown[] | Error) =>
    ({
      find: async () => {
        if (docs instanceof Error) throw docs;
        return { docs };
      },
      logger: { warn: () => {} },
    }) as never;

  it("met en pause tous les rôles de la personne : la cheffe, c'est l'orchestratrice ET l'analyste", async () => {
    const roles = await pausedRoles(fakePayload([{ name: "Mark", jobTitle: "Cheffe SEA", engineRoles: ["orchestrateur", "analyste"] }]));
    expect([...roles.keys()].sort()).toEqual(["analyste", "orchestrateur"]);
    expect(pausedReason(roles.get("analyste")!)).toMatch(/^Mark \(cheffe sea\) est en pause/);
    expect(await teamPort(fakePayload([])).paused("redacteur")).toBeNull();
  });

  it("ne bloque rien quand l'équipe est illisible (migration absente, base injoignable)", async () => {
    expect((await pausedRoles(fakePayload(new Error("relation absente")))).size).toBe(0);
  });

  it("affiche la pause avant tout autre état, même au milieu d'une mission", () => {
    const v = buildTeamView({
      members: [{ id: 2, key: "sea-redacteur", name: "Léa", jobTitle: "Rédactrice", level: "sous-agent", portrait: "redacteur", active: false, engineRoles: ["redacteur"] }],
      agents: [{ id: 10, role: "redacteur", status: "en-cours", mission: "Écris", run: 1, createdAt: "2026-11-12T09:00:00Z" }],
      runs: [],
      campaigns: [],
      steps: [
        { line: "Le rédacteur décide : generer_textes.", agent: 10, createdAt: "2026-11-12T09:01:00Z" },
        { line: "Le rédacteur écrit deux accroches.", agent: 10, createdAt: "2026-11-12T09:02:00Z" },
      ],
      pendingValidations: 0,
      now: new Date("2026-11-12T10:00:00Z"),
    });
    expect(v.members[0]).toMatchObject({ active: false, state: "pause" });
    // Les lignes qui parlent au moteur (« décide : … ») ne remontent pas à la direction.
    expect(v.feed.map((f) => f.line)).toEqual(["Léa écrit deux accroches."]);
  });

  it("ne garde que l'essentiel : la première phrase, coupée net", () => {
    expect(firstSentence("Les deux créas sont écrites avec un seul appel. Il manque les vidéos.")).toBe("Les deux créas sont écrites avec un seul appel.");
    expect(firstSentence("x".repeat(300), 50)).toHaveLength(50);
    expect(firstSentence("   ")).toBeNull();
  });
});

describe("le pilotage des agents est réservé à la direction", () => {
  it("chaque route des agents (lancer, suivre, questionner, arrêter) passe par isDirection", async () => {
    const { readFileSync } = await import("node:fs");
    const routes = [
      "app/(frontend)/api/admin/ads/campaigns/[id]/agent/route.ts",
      "app/(frontend)/api/admin/ads/campaigns/[id]/suivi/route.ts",
      "app/(frontend)/api/admin/ads/agent-runs/[id]/stop/route.ts",
    ];
    for (const r of routes) {
      const src = readFileSync(r, "utf8");
      const guards = src.match(/adminRequest\([^)]*\)/g) ?? [];
      expect(guards.length, r).toBeGreaterThan(0);
      for (const g of guards) expect(g, r).toContain("isDirection");
    }
  });

  it("l'onglet « Agent » d'une campagne ne pilote plus les agents : il renvoie vers Équipe IA", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("modules/ads/collections/AdCampaigns.ts", "utf8");
    expect(src).toContain("AgentTeamLink#AgentTeamLink");
    expect(src).not.toContain("AgentPanel#AgentPanel");
  });
});

describe("l'organisation SEA", async () => {
  const { groupOf, PREVIOUS_DEFAULTS } = await import("@/modules/ai-team/lib/team");
  it("Mark, directeur SEA, encadre les chefs de canal, la mesure et le studio ; Jordan tient le bureau commercial", () => {
    const margaux = AI_TEAM_SEED.find((m) => m.key === "chef-sea")!;
    expect(margaux).toMatchObject({ level: "chef", jobTitle: "Directeur SEA", engineRoles: ["orchestrateur"] });
    // Trois chefs : Mark (SEA), Sergey (SEO & GEO) et Jordan (commercial & revenu), chacun avec son domaine.
    expect(AI_TEAM_SEED.filter((m) => m.level === "chef").map((m) => [m.key, m.domain])).toEqual([
      ["chef-sea", "sea"],
      ["chef-seo", "seo"],
      ["chef-com", "com"],
    ]);
    expect(AI_TEAM_SEED.filter((m) => m.chiefKey === "chef-sea")).toHaveLength(8);
    expect(AI_TEAM_SEED.filter((m) => m.chiefKey === "chef-com").map((m) => [m.key, m.name])).toEqual([
      ["com-pipeline", "Nathan"],
      ["com-essais", "Jade"],
      ["com-clients", "Malo"],
    ]);
    expect(["com-pipeline", "com-essais", "com-clients"].map(groupOf)).toEqual(["commercial", "commercial", "commercial"]);
    expect(groupOf("seo-conversion")).toBe("revenu");
    expect(["sea-meta", "sea-google", "sea-chatgpt"].map(groupOf)).toEqual(["canal", "canal", "canal"]);
    expect(groupOf("sea-mesure")).toBe("mesure");
    expect(["sea-stratege", "sea-redacteur", "sea-directeur-artistique", "sea-controleur"].map(groupOf)).toEqual(["studio", "studio", "studio", "studio"]);
  });

  it("Google, ChatGPT et la mesure n'ont pas encore de rôle dans le moteur", () => {
    for (const k of ["sea-google", "sea-chatgpt", "sea-mesure"]) expect(AI_TEAM_SEED.find((m) => m.key === k)!.engineRoles).toEqual([]);
  });

  it("l'ancien métier de Mark est connu, pour être remplacé seulement s'il n'a pas été réécrit", () => {
    expect(PREVIOUS_DEFAULTS["chef-sea"].jobTitle).toBe("Cheffe de la publicité payante (SEA)");
  });
});
