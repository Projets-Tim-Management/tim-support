import { describe, expect, it } from "vitest";

import { ROLE_TOOLS } from "@/modules/ads/agent/roles";
import { buildMyTasks, type MyTasksInput } from "@/modules/ai-team/lib/my-tasks";
import { groupOf, weekProgress } from "@/modules/ai-team/lib/my-tasks-shared";
import { checkRequestStep, closeRequest, safeRequestUrl, validateRequest } from "@/modules/ai-team/lib/requests";

/**
 * Les demandes des chefs à la direction : deux formes (à faire / question),
 * des liens sûrs seulement, et « À valider » rangé au même endroit.
 */

describe("un lien de demande ne mène qu'au back-office ou à une console connue", () => {
  it("accepte une page du back-office et une console en https", () => {
    expect(safeRequestUrl("/admin/publicite/a-valider?campagne=7")).toBe("/admin/publicite/a-valider?campagne=7");
    expect(safeRequestUrl("https://business.facebook.com/settings")).toBe("https://business.facebook.com/settings");
    expect(safeRequestUrl("https://ads.google.com/aw/overview")).toBe("https://ads.google.com/aw/overview");
  });

  it("refuse tout le reste : autre site, http, faux sous-domaine, identifiants, chemin détourné", () => {
    expect(safeRequestUrl("https://evil.example.com/admin")).toBeNull();
    expect(safeRequestUrl("http://business.facebook.com")).toBeNull();
    expect(safeRequestUrl("https://facebook.com.evil.io")).toBeNull();
    expect(safeRequestUrl("https://user:pw@ads.google.com")).toBeNull();
    expect(safeRequestUrl("/admin//evil.example.com")).toBeNull();
    expect(safeRequestUrl("javascript:alert(1)")).toBeNull();
    expect(safeRequestUrl("/autre-page")).toBeNull();
  });
});

describe("une demande telle qu'un chef la formule", () => {
  it("« à faire » : des étapes obligatoires, un lien sûr ou aucun", () => {
    const ok = validateRequest({ type: "a-faire", titre: "Connecter le compte Meta", pourquoi: "Le jeton expire", lien: "/admin/collections/ad-accounts", etapes: ["Ouvrez le compte", "  Cliquez « Reconnecter »  ", ""] });
    expect(ok).toEqual({ ok: true, value: { kind: "a-faire", title: "Connecter le compte Meta", why: "Le jeton expire", url: "/admin/collections/ad-accounts", steps: ["Ouvrez le compte", "Cliquez « Reconnecter »"], question: null } });
    expect(validateRequest({ type: "a-faire", titre: "x", pourquoi: "y", etapes: [] })).toMatchObject({ ok: false });
    expect(validateRequest({ type: "a-faire", titre: "x", pourquoi: "y", etapes: ["a"], lien: "https://evil.example.com" })).toMatchObject({ ok: false, reason: expect.stringMatching(/lien refusé/) });
  });

  it("« question » : une question, pas de lien", () => {
    expect(validateRequest({ type: "question", titre: "Budget de décembre", pourquoi: "Les fêtes", question: "Quel plafond Meta pour décembre ?" })).toMatchObject({ ok: true, value: { kind: "question", url: null } });
    expect(validateRequest({ type: "question", titre: "x", pourquoi: "y" })).toMatchObject({ ok: false });
    expect(validateRequest({ type: "autre", titre: "x", pourquoi: "y" })).toMatchObject({ ok: false });
  });
});

describe("clore une demande", () => {
  const todo = { kind: "a-faire", status: "ouverte" };
  const ask = { kind: "question", status: "ouverte" };
  it("« C'est fait » pour un à-faire, une réponse pour une question, retirer pour les deux", () => {
    expect(closeRequest(todo, "fait", "")).toEqual({ ok: true, status: "faite", answer: null });
    expect(closeRequest(todo, "fait", "Fait ce matin")).toEqual({ ok: true, status: "faite", answer: "Fait ce matin" });
    expect(closeRequest(ask, "repondre", "200 €")).toEqual({ ok: true, status: "repondue", answer: "200 €" });
    expect(closeRequest(ask, "retirer", "")).toMatchObject({ ok: true, status: "retiree" });
  });
  it("refuse ce qui ne colle pas à la forme, une réponse vide, une demande déjà close", () => {
    expect(closeRequest(ask, "fait", "")).toMatchObject({ ok: false });
    expect(closeRequest(todo, "repondre", "x")).toMatchObject({ ok: false });
    expect(closeRequest(ask, "repondre", "  ")).toMatchObject({ ok: false });
    expect(closeRequest({ kind: "a-faire", status: "faite" }, "fait", "")).toMatchObject({ ok: false });
  });
});

describe("« Mes tâches » rassemble tout ce qui attend la direction", () => {
  const base: MyTasksInput = { requests: [], objectives: [], actions: [], members: [], goals: [], campaigns: [], pendingCreatives: [], proposedActions: [] };
  const tasks = buildMyTasks({
    ...base,
    members: [
      { id: 1, key: "chef-sea", name: "Margaux", engineRoles: ["orchestrateur"] },
      { id: 2, key: "chef-com", name: "Élise" },
      { id: 3, key: "com-clients", name: "Malo" },
      { id: 4, key: "chef-seo", name: "Serge" },
    ],
    goals: [{ id: 9, title: "5 000 € de MRR" }],
    campaigns: [{ id: 7, name: "Campagne test" }],
    requests: [
      { id: 10, member: 1, kind: "question", status: "ouverte", title: "Budget de décembre", why: "Les fêtes", question: "Quel plafond ?", createdAt: "2026-11-11T08:00:00Z" },
      { id: 11, member: 1, kind: "a-faire", status: "faite", title: "Reconnecter Meta", why: "Jeton", answer: "OK", steps: ["Ouvrir", "Reconnecter"], closedAt: "2026-11-16T08:00:00Z", createdAt: "2026-11-09T08:00:00Z" },
      { id: 12, member: 3, kind: "a-faire", status: "ouverte", title: "🔴 Urgent — Rappeler Kern", why: "Résiliation annoncée", steps: [{ text: "Appeler", done: true }, "Écrire"], goal: 9, createdAt: "2026-11-16T07:00:00Z" },
    ],
    objectives: [{ id: 5, title: "Réécrire la page devis", status: "a-faire", dueDate: "2026-11-14T00:00:00.000Z", proposedBy: "seo-contenu", steps: [{ text: "Plan", minutes: 20, prompt: "p", done: false }], slots: [{ start: "2026-11-13T09:00:00Z", end: "2026-11-13T10:00:00Z", link: "https://cal" }] }],
    actions: [{ id: 3, title: "Livrer l'export", who: "dev", team: "tous", status: "prevue", plannedDate: "2026-12-01T12:00:00.000Z", createdAt: "2026-11-01T08:00:00Z" }],
    pendingCreatives: [
      { campaign: 7, createdAt: "2026-11-02T08:00:00Z" },
      { campaign: 7, createdAt: "2026-11-02T08:00:00Z" },
    ],
    proposedActions: [{ id: 5, kind: "budget", campaign: 7, rationale: "CPC en baisse", after: {}, createdAt: "2026-11-12T07:00:00Z" }],
  });
  const byId = (id: string) => tasks.find((t) => t.id === id)!;

  it("une couleur par bureau, et le chef à qui en parler — l'idée d'un agent remonte par son chef", () => {
    expect(byId("r10")).toMatchObject({ category: "sea", form: "question", chief: "chef-sea", from: "Margaux", status: "a-faire" });
    expect(byId("r12")).toMatchObject({ category: "com", chief: "chef-com", from: "Élise · idée de Malo", urgent: true, goal: "5 000 € de MRR", stepsCheckable: true });
    expect(byId("r12").steps.map((s) => s.done)).toEqual([true, false]);
    expect(byId("o5")).toMatchObject({ category: "seo", chief: "chef-seo", due: "2026-11-14", stepsCheckable: true });
    expect(byId("o5").slots).toHaveLength(1);
    expect(byId("a3")).toMatchObject({ category: "tous", chief: null, from: "Développement", due: "2026-12-01" });
  });

  it("« À valider » y est aussi : une tâche par campagne de créas, une par action proposée, qui se décident là-bas", () => {
    expect(byId("v-creas-7")).toMatchObject({ source: "a-valider", title: "Décider de 2 créas — Campagne test", url: "/admin/publicite/a-valider?campagne=7", chief: "chef-sea" });
    expect(byId("v-action-5")).toMatchObject({ source: "a-valider", category: "sea" });
  });

  it("se range en retard, cette semaine (une demande sans date est pour maintenant), plus tard, fait", () => {
    const today = "2026-11-16";
    expect(groupOf(byId("o5"), today)).toBe("retard");
    expect(groupOf(byId("r10"), today)).toBe("semaine");
    expect(groupOf(byId("a3"), today)).toBe("plus-tard");
    expect(groupOf(byId("r11"), today)).toBe("fait");
  });

  it("où j'en suis : les tâches faites depuis lundi face à celles qui restent cette semaine", () => {
    // Faite lundi 16 : r11. Restent cette semaine : r10, r12, o5 (en retard), v-creas-7, v-action-5.
    expect(weekProgress(tasks, "2026-11-16")).toEqual({ done: 1, left: 5, late: 1, pct: 17 });
    expect(weekProgress([], "2026-11-16").pct).toBe(100);
  });
});

describe("cocher les étapes d'une demande", () => {
  it("garde les étapes en objets, et la demande est faite quand tout est coché", () => {
    const req = { kind: "a-faire", status: "ouverte", steps: ["Ouvrir", { text: "Reconnecter", done: true }] };
    expect(checkRequestStep(req, 0, true)).toEqual({ ok: true, status: "faite", steps: [{ text: "Ouvrir", done: true }, { text: "Reconnecter", done: true }] });
    expect(checkRequestStep({ ...req, status: "faite" }, 1, false)).toMatchObject({ ok: true, status: "ouverte" });
  });

  it("refuse une question, une demande retirée, une étape inconnue", () => {
    expect(checkRequestStep({ kind: "question", status: "ouverte", steps: [] }, 0, true)).toMatchObject({ ok: false });
    expect(checkRequestStep({ kind: "a-faire", status: "retiree", steps: ["x"] }, 0, true)).toMatchObject({ ok: false });
    expect(checkRequestStep({ kind: "a-faire", status: "ouverte", steps: ["x"] }, 3, true)).toMatchObject({ ok: false });
  });

  it("un « C'est fait » cliqué trop vite se rouvre ; une question répondue, non", () => {
    expect(closeRequest({ kind: "a-faire", status: "faite" }, "rouvrir", "")).toEqual({ ok: true, status: "ouverte", answer: null });
    expect(closeRequest({ kind: "question", status: "repondue" }, "rouvrir", "")).toMatchObject({ ok: false });
  });
});

describe("les outils pour parler à la direction", () => {
  it("sont donnés aux chefs (orchestratrice, analyste), pas aux sous-agents", () => {
    for (const role of ["orchestrateur", "analyste"] as const) {
      expect(ROLE_TOOLS[role]).toContain("demander_a_la_direction");
      expect(ROLE_TOOLS[role]).toContain("lire_reponses_direction");
    }
    for (const role of ["stratege", "redacteur", "directeur-artistique", "controleur"] as const) expect(ROLE_TOOLS[role]).not.toContain("demander_a_la_direction");
  });
});

describe("les objectifs reportés ne disparaissent pas", () => {
  it("repris cette semaine (même page ou deux mots forts en commun) ou mis de côté", async () => {
    const { takenOverBy } = await import("@/modules/ai-team/lib/my-tasks");
    const now = [
      { title: "Reprendre la page produit pointage : définition en tête", page: "/pointage", createdAt: "2026-11-16T08:00:00Z" },
      { title: "Faire cliquer la grille de salaire BTP 2026 (titre et description)", page: "/grille", createdAt: "2026-11-16T08:00:00Z" },
    ];
    expect(takenOverBy({ title: "Renforcer la page produit pointage chantier", page: "/autre", createdAt: "2026-11-09T08:00:00Z" }, now)).toMatch(/^Reprendre la page produit pointage/);
    expect(takenOverBy({ title: "Faire cliquer la grille de salaire BTP 2026", page: null, createdAt: "2026-11-09T08:00:00Z" }, now)).toMatch(/^Faire cliquer la grille/);
    expect(takenOverBy({ title: "Mettre la calculatrice dans l'article calcul du temps de travail", page: "/calcul", createdAt: "2026-11-09T08:00:00Z" }, now)).toBeNull();
  });
  it("se rangent à part, hors de l'avancement de la semaine", () => {
    const t = { ...({} as Record<string, unknown>), status: "reporte", due: "2026-11-13" } as never;
    expect(groupOf(t, "2026-11-16")).toBe("reportees");
  });
});
