import { describe, expect, it, vi } from "vitest";

import { buildMyTasks } from "@/modules/ai-team/lib/my-tasks";
import { seedAiTeam } from "@/modules/ai-team/lib/seed";
import { AI_TEAM_SEED } from "@/modules/ai-team/lib/team";

/**
 * La mise à jour de l'équipe au démarrage (base partagée dev/prod) : créer ce
 * qui manque, réaligner ce qui relève du code, ne jamais écraser ce que la
 * direction a écrit — et ne rien écrire quand rien n'a changé.
 */
function fakePayload(docs: Record<string, unknown>[]) {
  const created: Record<string, unknown>[] = [];
  const updated: { id: unknown; data: Record<string, unknown> }[] = [];
  let next = 100;
  const payload = {
    find: vi.fn(async () => ({ docs })),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => (created.push(data), { id: next++, ...data })),
    update: vi.fn(async ({ id, data }: { id: unknown; data: Record<string, unknown> }) => (updated.push({ id, data }), { id, ...data })),
    logger: { info: vi.fn(), error: vi.fn() },
  };
  return { payload: payload as never, created, updated };
}

describe("la mise à jour de l'équipe au démarrage", () => {
  it("crée les nouveaux membres, passe l'analyste à Camille et fait de Mark le directeur SEA", async () => {
    const { payload, created, updated } = fakePayload([
      { id: 1, key: "chef-sea", name: "Mark", jobTitle: "Cheffe de la publicité payante (SEA)", level: "chef", domain: "sea", engineRoles: ["orchestrateur", "analyste"], order: 0, chief: null },
      { id: 2, key: "sea-redacteur", name: "Léa B.", jobTitle: "Ma rédactrice", level: "sous-agent", domain: "sea", engineRoles: ["redacteur"], order: 2, chief: 1 },
    ]);
    await seedAiTeam(payload);
    // Sergey, directeur SEO & GEO (12/11/2026), est créé avec l'organisation SEA.
    // Le bureau commercial de Jordan (15/11/2026) : Nathan, Jade et Malo.
    expect(created.map((c) => c.key).sort()).toEqual(["chef-com", "chef-seo", "com-clients", "com-essais", "com-pipeline", "sea-chatgpt", "sea-controleur", "sea-directeur-artistique", "sea-google", "sea-mesure", "sea-meta", "sea-stratege", "seo-analyste", "seo-autorite", "seo-concurrence", "seo-contenu", "seo-conversion", "seo-redacteur", "seo-reseaux", "seo-technique", "seo-visibilite-ia"]);
    const elise = created.find((c) => c.key === "chef-com")!;
    expect(elise).toMatchObject({ level: "chef", domain: "com" });
    // Ses trois agents ont le même chef, créé juste avant eux.
    const chiefs = ["com-pipeline", "com-essais", "com-clients"].map((k) => created.find((c) => c.key === k)!.chief);
    expect(chiefs[0]).toBeTruthy();
    expect(new Set(chiefs).size).toBe(1);
    expect(created.find((c) => c.key === "sea-meta")).toMatchObject({ engineRoles: ["analyste"], chief: 1 });
    const margaux = updated.find((u) => u.id === 1)!.data;
    expect(margaux).toMatchObject({ engineRoles: ["orchestrateur"], jobTitle: "Directeur SEA" });
    // Léa a été renommée par la direction : on garde son prénom et son métier, on réaligne l'ordre.
    const lea = updated.find((u) => u.id === 2)!.data;
    expect(lea).not.toHaveProperty("name");
    expect(lea).not.toHaveProperty("jobTitle");
    expect(lea.order).toBe(AI_TEAM_SEED.findIndex((m) => m.key === "sea-redacteur"));
  });

  it("n'écrit rien quand l'équipe est déjà à jour", async () => {
    const ids = new Map(AI_TEAM_SEED.map((m, i) => [m.key, i + 1]));
    const { payload, created, updated } = fakePayload(
      AI_TEAM_SEED.map((m, i) => ({ id: i + 1, key: m.key, name: m.name, jobTitle: m.jobTitle, level: m.level, domain: m.domain, engineRoles: m.engineRoles, order: i, chief: m.chiefKey ? ids.get(m.chiefKey) : null })),
    );
    await seedAiTeam(payload);
    expect(created).toEqual([]);
    expect(updated).toEqual([]);
  });
});

describe("la direction ne parle qu'aux chefs", () => {
  it("une action proposée par la cheffe Meta remonte sous le nom de Mark, en disant qui l'a soulevée", () => {
    const tasks = buildMyTasks({
      objectives: [],
      actions: [],
      goals: [],
      members: [
        { id: 1, key: "chef-sea", name: "Mark", jobTitle: "Directeur SEA", engineRoles: ["orchestrateur"] },
        { id: 2, key: "sea-meta", name: "Camille", jobTitle: "Cheffe Meta Ads", engineRoles: ["analyste"], chief: 1 },
      ],
      campaigns: [],
      requests: [],
      pendingCreatives: [],
      proposedActions: [{ id: 5, kind: "pause", campaign: 7, rationale: "Coût par lead qualifié trop haut", after: {}, createdAt: "2026-11-12T07:00:00Z" }],
    });
    expect(tasks[0]).toMatchObject({ chief: "chef-sea", from: "Mark", why: "Soulevé par Camille (Cheffe Meta Ads) : Coût par lead qualifié trop haut" });
  });
});
