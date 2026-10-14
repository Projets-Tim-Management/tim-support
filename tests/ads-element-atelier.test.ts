import { describe, expect, it, vi } from "vitest";

import { AdElements } from "@/modules/ads/collections/AdElements";
import { baseElements, decide, parseProposal, proposalPrompt, proposeImprovement, restoreVersion, toDevelopment, type ProposalResult } from "@/modules/ads/lib/element-atelier";
import { previewScore } from "@/modules/ads/lib/element-preview";
import { CLAUDE_CODE_STEPS, claudeCodePrompt } from "@/modules/dev/lib/claude-code-prompt";
import { elementProblems, ELEMENT_TYPES, parseElement } from "@/modules/ads/video/elements";

/**
 * L'atelier des éléments de motion design : améliorer un élément à partir de
 * son fil (idées, propositions de l'IA, décisions), en versions ou en
 * variantes ; ce qui dépasse les réglages part au développement.
 */

const EL = { id: 3, name: "Notification", base: "notification" as const, status: "actif", whenToUse: "Pour montrer qu'une info arrive au bureau.", params: { coche: false }, versions: [{ n: 1, params: {}, at: "2026-10-14T10:00:00Z", by: null, note: "Création" }] };
const usage = { input: 1000, output: 200, cacheRead: 0, cacheWrite: 0 };
const R = (o: Partial<ProposalResult>): ProposalResult => ({ dans_les_reglages: true, explication: "Verre dépoli pour les rushes.", reglages_json: '{"surface":"verre"}', nom_variante: "verre dépoli", quand_l_employer: "", hors_reglages: "", ...o });

function fake(notes: Record<string, unknown>[] = [{ id: 1, kind: "idee", body: "Une version en verre dépoli", createdAt: "2026-10-14T10:00:00Z" }]) {
  const created: { collection: string; data: Record<string, unknown> }[] = [];
  const updates: { collection: string; id: unknown; data: Record<string, unknown> }[] = [];
  const payload = {
    findByID: vi.fn(async ({ collection, id }: { collection: string; id: unknown }) => (collection === "ad-elements" ? EL : notes.find((n) => n.id === Number(id)))),
    find: vi.fn(async ({ collection }: { collection: string }) => (collection === "dev-statuses" ? { docs: [{ id: 2 }] } : { docs: notes })),
    findGlobal: vi.fn(async () => ({ enabled: true })),
    count: vi.fn(async () => ({ totalDocs: 0 })),
    create: vi.fn(async (a: { collection: string; data: Record<string, unknown> }) => (created.push(a), { id: 50 + created.length })),
    update: vi.fn(async (a: { collection: string; id: unknown; data: Record<string, unknown> }) => updates.push(a)),
  };
  return { payload: payload as never, created, updates };
}

describe("les éléments de départ", () => {
  it("un par type, actifs, avec leur mode d'emploi", () => {
    const b = baseElements();
    expect(b.map((e) => e.base)).toEqual([...ELEMENT_TYPES]);
    expect(b.every((e) => e.status === "actif" && e.whenToUse.length > 10)).toBe(true);
  });
});

describe("la proposition de l'IA", () => {
  it("le prompt donne l'élément, les réglages possibles et actuels, et tout le fil", () => {
    const p = proposalPrompt(EL, [{ kind: "idee", body: "Plus de rebond" }, { kind: "proposition", body: "Rebond 2.4", status: "ecartee" }]);
    expect(p.system).toMatch(/que les RÉGLAGES listés/);
    expect(p.user).toMatch(/surface \(Surface\) : clair \| sombre \| accent \| verre/);
    expect(p.user).toMatch(/RÉGLAGES ACTUELS : .*"coche":false/);
    expect(p.user).toMatch(/\[Charlie\] Plus de rebond\n- \[IA, ecartee\] Rebond 2.4/);
  });

  it("des réglages hors contrat sont refusés", () => {
    expect(parseProposal("notification", { reglages_json: '{"surface":"néon"}' }).errors[0]).toMatch(/n'est pas un choix possible/);
    expect(parseProposal("notification", { reglages_json: "{oups" }).errors[0]).toMatch(/JSON lisible/);
    expect(parseProposal("notification", { reglages_json: '{"surface":"verre"}' })).toEqual({ params: { surface: "verre" }, errors: [] });
  });

  it("sans idée dans le fil, rien ne part", async () => {
    await expect(proposeImprovement(fake([]).payload, 3, { call: vi.fn() })).rejects.toThrow(/Écrivez d'abord une idée/);
  });

  it("une proposition valable entre dans le fil, « à décider »", async () => {
    const { payload, created } = fake();
    await proposeImprovement(payload, 3, { call: async () => ({ result: R({}), usage }) });
    expect(created.find((c) => c.collection === "ad-element-notes")?.data).toMatchObject({ kind: "proposition", status: "a-decider", proposal: { params: { surface: "verre" }, name: "verre dépoli" } });
  });

  it("refusée par le code, elle revient une fois à l'IA avec la raison", async () => {
    const { payload, created } = fake();
    const call = vi.fn().mockResolvedValueOnce({ result: R({ reglages_json: '{"surface":"néon"}' }), usage }).mockResolvedValueOnce({ result: R({}), usage });
    await proposeImprovement(payload, 3, { call });
    expect(call.mock.calls[1][0].user).toMatch(/REFUSÉE : Surface : « néon »/);
    expect(created.find((c) => c.collection === "ad-element-notes")?.data).toMatchObject({ status: "a-decider" });
  });

  it("une idée qui dépasse les réglages est marquée « hors réglages », avec ce qu'il faudrait développer", async () => {
    const { payload, created } = fake();
    await proposeImprovement(payload, 3, { call: async () => ({ result: R({ dans_les_reglages: false, reglages_json: "", hors_reglages: "Une notification qui vibre." }), usage }) });
    expect(created.find((c) => c.collection === "ad-element-notes")?.data).toMatchObject({ status: "hors-reglages", proposal: { outside: "Une notification qui vibre." } });
  });
});

describe("les décisions", () => {
  const PROP = { id: 9, element: 3, kind: "proposition", body: "Verre dépoli.", status: "a-decider", proposal: { params: { surface: "verre" }, name: "verre dépoli", whenToUse: "" }, createdAt: "2026-10-14T11:00:00Z" };

  it("appliquer : nouvelle version de l'élément, réglages fusionnés", async () => {
    const { payload, updates } = fake([PROP]);
    await decide(payload, 9, "appliquer", 1);
    expect(updates[0]).toMatchObject({ collection: "ad-elements", id: 3, data: { params: { coche: false, surface: "verre" }, versionNote: expect.stringMatching(/Proposition appliquée/) } });
    expect(updates[1]).toMatchObject({ collection: "ad-element-notes", data: { status: "appliquee" } });
  });

  it("variante : un nouvel élément en brouillon, lié à l'original", async () => {
    const { payload, created } = fake([PROP]);
    const r = await decide(payload, 9, "variante", 1);
    expect(created[0]).toMatchObject({ collection: "ad-elements", data: { name: "Notification · verre dépoli", base: "notification", status: "brouillon", variantOf: 3, params: { coche: false, surface: "verre" } } });
    expect(r.variant).toBe(51);
  });

  it("une proposition déjà décidée ne se redécide pas", async () => {
    await expect(decide(fake([{ ...PROP, status: "appliquee" }]).payload, 9, "appliquer", 1)).rejects.toThrow(/déjà décidée/);
  });

  it("restaurer une version : elle devient la suivante", async () => {
    const { payload, updates } = fake();
    await restoreVersion(payload, 3, 1);
    expect(updates[0]).toMatchObject({ data: { params: {}, versionNote: "Version 1 restaurée" } });
    await expect(restoreVersion(payload, 3, 7)).rejects.toThrow(/Version 7 introuvable/);
  });

  it("transmettre au développement : une fiche « En qualification » avec le fil et le lien vers l'élément", async () => {
    const out = { ...PROP, status: "hors-reglages", proposal: { outside: "Une notification qui vibre." } };
    const { payload, created } = fake([{ id: 1, kind: "idee", body: "Qu'elle vibre", createdAt: "x" }, out]);
    await toDevelopment(payload, 9, 1, "https://support.example");
    expect(created[0]).toMatchObject({
      collection: "developments",
      data: { title: expect.stringMatching(/Élément « Notification » : Une notification qui vibre/), status: 2, type: "feature", links: [{ url: "https://support.example/admin/collections/ad-elements/3" }] },
    });
    expect(String(created[0].data.description)).toMatch(/\[idee\] Qu'elle vibre/);
  });
});

describe("les versions et l'aperçu", () => {
  const hook = AdElements.hooks!.beforeChange![0] as (a: unknown) => Record<string, unknown>;

  it("des réglages changés : une version de plus et l'aperçu relancé ; des réglages hors contrat sont refusés", () => {
    const out = hook({ data: { params: { surface: "verre" } }, originalDoc: EL, req: { user: { name: "Charlie" } }, context: {}, operation: "update" });
    expect((out.versions as unknown[]).length).toBe(2);
    expect(out.preview).toMatchObject({ status: "en-attente" });
    expect(() => hook({ data: { params: { surface: "néon" } }, originalDoc: EL, req: {}, context: {} })).toThrow(/Réglages refusés/);
  });

  it("à la création : la version 1, même avec les réglages par défaut", () => {
    const out = hook({ data: { base: "badge", params: {}, versionNote: "Élément de départ" }, req: {}, context: {}, operation: "create" });
    expect(out.versions).toEqual([expect.objectContaining({ n: 1, note: "Élément de départ" })]);
    expect(out).not.toHaveProperty("versionNote");
  });

  it("l'aperçu écrit par le cron ne crée pas de version", () => {
    expect(hook({ data: { preview: { status: "pret" } }, originalDoc: EL, req: {}, context: { previewOnly: true } })).toEqual({ preview: { status: "pret" } });
  });

  it("l'aperçu : l'exemple de l'élément sur le fond du style, puis sur un rush flouté", () => {
    const sc = previewScore("badge", 3, 1, null);
    expect(sc.shots.map((s) => (s.kind === "compo" ? s.fond.type : s.kind))).toEqual(["style", "rush"]);
    expect(sc.shots[0]).toMatchObject({ elements: [{ type: "badge", variante: 3 }] });
  });
});

describe("dans les vidéos", () => {
  const ctx = (status: string, type = "badge") => ({ seconds: 3, facts: new Set<number>(), allowed: new Set<number>(), forbidden: [], rush: null, variants: new Map([[7, { type, status }]]) });
  const e = parseElement({ type: "badge", variante: 7, data: { texte: "Validé" }, x: 0.5, y: 0.5, debut: 0 });

  it("une variante active du bon type passe ; brouillon, autre type ou inconnue, non", () => {
    expect(elementProblems([e], { type: "style" }, ctx("actif"))).toEqual([]);
    expect(elementProblems([e], { type: "style" }, ctx("brouillon")).join(" ")).toMatch(/n'est pas active/);
    expect(elementProblems([e], { type: "style" }, ctx("actif", "liste")).join(" ")).toMatch(/est un élément « liste »/);
    expect(elementProblems([{ ...e, variante: 99 }], { type: "style" }, ctx("actif")).join(" ")).toMatch(/introuvable/);
  });
});

describe("la consigne pour Claude Code", () => {
  it("dit la demande et quoi faire ; la marche à suivre passe par le dossier ouvert dans VS Code", () => {
    expect(claudeCodePrompt({ id: 12, title: "Élément « Notification » : vibrer" })).toMatch(/^Demande de développement n°12 : « Élément « Notification » : vibrer »\..*Ne pousse rien sans mon accord\.$/);
    expect(CLAUDE_CODE_STEPS).toMatch(/dossier tim-support dans VS Code/);
  });
});
