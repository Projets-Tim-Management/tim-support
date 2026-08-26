import { describe, expect, it } from "vitest";

import { buildTaskDigestEmail, dayKey, groupTasksForDigest } from "@/modules/partner/lib/task-digest";

/**
 * Récapitulatif matinal des rappels.
 *
 * Ce qui se joue ici : la frontière entre « en retard », « aujourd'hui » et « la
 * semaine ». Une tâche rangée du mauvais côté, et le message perd sa raison
 * d'être — on ouvre un récapitulatif pour savoir quoi faire MAINTENANT.
 *
 * Toutes les dates sont exprimées en heure de Paris via un décalage explicite,
 * pour que le test dise la même chose quel que soit le fuseau de la machine.
 */

/** 25 août 2026, 08:00 à Paris (UTC+2 en été). */
const NOW = new Date("2026-08-25T06:00:00.000Z");

const task = (id: number, iso: string, over: Record<string, unknown> = {}) => ({
  id,
  title: `Tâche ${id}`,
  dueDate: iso,
  client: { id: 3, companyName: "KUHN CONSTRUCTION" },
  ...over,
});

describe("découpage par jour", () => {
  it("raisonne en jours de Paris, pas en 24 heures glissantes", () => {
    // 23:30 UTC le 25 = 01:30 le 26 à Paris : c'est déjà demain ici.
    expect(dayKey("2026-08-25T23:30:00.000Z")).toBe("2026-08-26");
    expect(dayKey("2026-08-25T06:00:00.000Z")).toBe("2026-08-25");
  });
});

describe("regroupement des rappels", () => {
  it("sépare retards, jour même et jours à venir", () => {
    const g = groupTasksForDigest(
      [
        task(1, "2026-08-20T07:00:00.000Z"), // il y a 5 jours
        task(2, "2026-08-25T14:00:00.000Z"), // aujourd'hui, 16 h à Paris
        task(3, "2026-08-27T07:00:00.000Z"), // jeudi
        task(4, "2026-09-30T07:00:00.000Z"), // hors horizon
      ],
      NOW,
    );
    expect(g.late.map((t) => t.id)).toEqual([1]);
    expect(g.today.map((t) => t.id)).toEqual([2]);
    expect(g.week.map((d) => d.tasks.map((t) => t.id))).toEqual([[3]]);
    expect(g.total).toBe(3);
  });

  it("compte comme « aujourd'hui » une tâche déjà passée dans la journée", () => {
    // 05:00 UTC = 07:00 à Paris : l'heure est passée, mais c'est bien aujourd'hui.
    const g = groupTasksForDigest([task(1, "2026-08-25T05:00:00.000Z")], NOW);
    expect(g.today).toHaveLength(1);
    expect(g.late).toHaveLength(0);
  });

  it("range les jours à venir dans l'ordre, et chaque jour par heure", () => {
    const g = groupTasksForDigest(
      [
        task(1, "2026-08-28T09:00:00.000Z"),
        task(2, "2026-08-26T15:00:00.000Z"),
        task(3, "2026-08-26T07:00:00.000Z"),
      ],
      NOW,
    );
    expect(g.week.map((d) => d.dayKey)).toEqual(["2026-08-26", "2026-08-28"]);
    expect(g.week[0].tasks.map((t) => t.id)).toEqual([3, 2]);
  });

  it("ignore une tâche sans échéance plutôt que de la dater d'office", () => {
    expect(groupTasksForDigest([task(1, "") as never], NOW).total).toBe(0);
  });

  it("ne remonte rien au-delà de l'horizon demandé", () => {
    const g = groupTasksForDigest([task(1, "2026-09-05T07:00:00.000Z")], NOW, 7);
    expect(g.total).toBe(0);
  });
});

describe("message du matin", () => {
  const groups = (tasks: Parameters<typeof groupTasksForDigest>[0]) =>
    groupTasksForDigest(tasks, NOW);

  it("met les retards en tête de l'objet — c'est ce qui coûte", () => {
    const g = groups([task(1, "2026-08-20T07:00:00.000Z"), task(2, "2026-08-25T14:00:00.000Z")]);
    expect(buildTaskDigestEmail("Charlie", g).subject).toBe("1 rappel en retard, 1 aujourd'hui");
  });

  it("annonce le nombre du jour quand rien n'est en retard", () => {
    const g = groups([task(1, "2026-08-25T14:00:00.000Z"), task(2, "2026-08-27T07:00:00.000Z")]);
    expect(buildTaskDigestEmail(null, g).subject).toBe("1 rappel aujourd'hui — 1 cette semaine");
  });

  it("dit franchement qu'il n'y a rien aujourd'hui", () => {
    const g = groups([task(1, "2026-08-27T07:00:00.000Z")]);
    const { text, html } = buildTaskDigestEmail("Charlie", g);
    expect(text).toContain("Rien à faire aujourd'hui.");
    expect(html).toContain("Rien à faire aujourd'hui.");
  });

  it("signale les priorités hautes et lie chaque ligne à sa fiche", () => {
    const g = groups([task(1, "2026-08-25T07:00:00.000Z", { highPriority: true })]);
    const { text, html } = buildTaskDigestEmail("Charlie", g);
    expect(text).toContain("⚑");
    expect(html).toContain("/admin/collections/partner-clients/3");
    expect(text).toContain("KUHN CONSTRUCTION");
  });

  it("plafonne la liste des retards au lieu d'un mur de lignes", () => {
    const many = Array.from({ length: 14 }, (_, i) => task(i + 1, "2026-08-10T07:00:00.000Z"));
    const { text } = buildTaskDigestEmail("Charlie", groups(many));
    expect(text).toContain("… et 4 autres");
  });

  it("échappe le HTML d'un nom de tâche (saisie libre)", () => {
    const g = groups([task(1, "2026-08-25T07:00:00.000Z", { title: "<img src=x onerror=1>" })]);
    expect(buildTaskDigestEmail("Charlie", g).html).not.toContain("<img");
  });
});
