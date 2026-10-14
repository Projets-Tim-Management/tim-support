import { describe, expect, it, vi } from "vitest";

import { FinalError } from "@/modules/ads/lib/rush-process";
import { guardTexts, normalizeResult, processNextRetouch, requestRetouch, retouchPrompt, scoreFromModel, snapshotOf, withHook, type RetouchResult } from "@/modules/ads/lib/retouch";

/**
 * La retouche ciblée d'une créa (plan Publicité, 14/10/2026) : Charlie demande
 * un changement précis ; l'IA ne change que ça, en tenant compte de toutes ses
 * consignes précédentes ; rien n'est appliqué à moitié.
 */

const CREA = {
  id: 9,
  campaign: 4,
  angle: "Pointage",
  hook: "Fini la ressaisie",
  tone: "vous",
  status: "a-valider",
  copy: [
    { kind: "principal", text: "Le pointage sans papier.", status: "ok" },
    { kind: "titre", text: "Pointez en 2 clics", status: "rejete", reason: "Chiffre non sourcé : 2" },
    { kind: "titre", text: "Le pointage simple", status: "ok" },
  ],
  assets: [{ format: "9x16", type: "image", template: "capture", media: { url: "https://cdn/v.png" } }],
  style: 1,
  video: { status: "prete", score: { shots: [] }, music: 13, renders: [{ format: "9x16", url: "https://cdn/v.mp4" }] },
};
const G = { tone: "vous" as const, forbidden: ["gratuit à vie"], allowed: new Set([30]) };

describe("le prompt", () => {
  const p = retouchPrompt({ brief: ["CAMPAGNE : Démos"], tone: "vous", voice: { voice: "Direct", goodExamples: null, badExamples: null }, forbidden: [], creative: CREA as never, history: ["Accroche plus directe"], instruction: "Prends le rush planning", material: null });

  it("ne change que ce qui est demandé, sans défaire les consignes passées", () => {
    expect(p.system).toMatch(/RIEN d'autre/);
    expect(p.system).toMatch(/n'en défait jamais une autre/);
    expect(p.user).toMatch(/CONSIGNES PRÉCÉDENTES[\s\S]*1\. Accroche plus directe/);
    expect(p.user).toMatch(/MAINTENANT :\nPrends le rush planning$/);
  });

  it("montre la créa telle qu'elle est, textes rejetés compris, et la voix de la marque", () => {
    expect(p.user).toMatch(/\[titre, REJETÉ : Chiffre non sourcé : 2\] Pointez en 2 clics/);
    expect(p.user).toMatch(/Gabarit du visuel : capture/);
    expect(p.system).toMatch(/Voix de la marque : Direct/);
  });
});

describe("les morceaux purs", () => {
  it("les textes repassent les garde-fous, dans les limites de nombre", () => {
    const rows = guardTexts({ principal: ["Essai de 30 jours.", "Testé par 500 chefs."], titre: Array(8).fill("Titre"), description: [""] }, G);
    expect(rows.filter((r) => r.kind === "titre")).toHaveLength(5);
    expect(rows.find((r) => r.text.includes("500"))).toMatchObject({ status: "rejete", reason: expect.stringMatching(/500/) });
    expect(rows.find((r) => r.text.includes("30"))).toMatchObject({ status: "ok" });
    expect(rows.some((r) => r.kind === "description")).toBe(false);
  });

  it("la nouvelle accroche remplace l'ouverture qui reprenait l'ancienne, et seulement elle", () => {
    const sc = { shots: [{ kind: "ouverture", text: "Ancienne" }, { kind: "ouverture", text: "Autre phrase" }] };
    expect(withHook(sc, "Ancienne", "Nouvelle")).toEqual({ shots: [{ kind: "ouverture", text: "Nouvelle" }, { kind: "ouverture", text: "Autre phrase" }] });
    expect(withHook(sc, "Ancienne", null)).toBe(sc);
  });

  it("la réponse du modèle : vide ou 0 = inchangé ; partition en JSON lue, illisible ignorée", () => {
    expect(normalizeResult({ resume: "r", textes: null, accroche: " ", gabarit: "inchange", video: { style: 0, musique: 13, sans_musique: false, partition_json: '{"shots":[{"kind":"fin","seconds":2}]}' } })).toEqual({
      resume: "r",
      textes: null,
      accroche: null,
      gabarit: null,
      video: { style: null, musique: 13, sans_musique: false, partition: { shots: [{ kind: "fin", seconds: 2 }] } },
    });
    expect(normalizeResult({ resume: "r", textes: null, accroche: "Nouvelle", gabarit: "photo", video: { style: 2, musique: 0, sans_musique: true, partition_json: "{oups" } })).toMatchObject({ accroche: "Nouvelle", gabarit: "photo", video: { style: 2, musique: null, partition: null } });
  });

  it("le format reste sous la limite de l'API (16 champs « ou null » au plus)", async () => {
    const { RETOUCH_SCHEMA } = await import("@/modules/ads/lib/retouch");
    const unions = (JSON.stringify(RETOUCH_SCHEMA).match(/"anyOf"|"type":\[/g) ?? []).length;
    expect(unions).toBeLessThanOrEqual(16);
  });

  it("la partition du modèle perd ses champs vides", () => {
    expect(scoreFromModel({ shots: [{ kind: "logo", seconds: 1.5, text: null, rush: null }] })).toEqual({ shots: [{ kind: "logo", seconds: 1.5 }] });
  });

  it("la version gardée : accroche, textes, visuels, vidéo", () => {
    expect(snapshotOf(CREA as never)).toMatchObject({ hook: "Fini la ressaisie", assets: [{ format: "9x16", url: "https://cdn/v.png" }], video: { style: 1, music: 13 } });
  });
});

describe("le traitement", () => {
  const RESULT: RetouchResult = { resume: "Accroche plus directe.", textes: null, accroche: "Plus jamais de ressaisie", gabarit: null, video: null };

  function fake(creative: Record<string, unknown> = CREA, claimed = true) {
    const writes: Record<string, unknown>[] = [];
    const creaUpdates: Record<string, unknown>[] = [];
    const payload = {
      db: { drizzle: { execute: vi.fn(async () => ({ rows: claimed ? [{ id: 3, attempts: 1 }] : [] })) } },
      findByID: vi.fn(async ({ collection }: { collection: string }) =>
        collection === "ad-retouches"
          ? { id: 3, creative: 9, instruction: "Accroche plus directe", createdAt: "2026-10-14T10:00:00Z" }
          : collection === "ad-campaigns"
            ? { id: 4, name: "Démos", status: "brouillon", brief: { audience: "BTP", pain: "Papier", offer: "essai gratuit de 30 jours", proofs: [], angles: [] } }
            : creative,
      ),
      findGlobal: vi.fn(async ({ slug }: { slug: string }) => (slug === "ads-settings" ? { enabled: true, creativesPerCampaignPerWeek: 6 } : { forbidden: [] })),
      find: vi.fn(async () => ({ docs: [] })),
      create: vi.fn(async () => ({ id: 1 })),
      update: vi.fn(async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => (collection === "ad-retouches" ? writes : creaUpdates).push(data)),
      logger: { error: vi.fn() },
    };
    return { payload: payload as never, writes, creaUpdates };
  }
  const usage = { input: 1000, output: 200, cacheRead: 0, cacheWrite: 0 };
  const material = async () => ({ rushes: [], styles: [], inspirations: [], musiques: [], logo: "", elements: {} });

  it("rien en file : rien ne se passe", async () => {
    expect(await processNextRetouch(fake(CREA, false).payload)).toBeNull();
  });

  it("une nouvelle accroche sur une créa montée : vidéo et affiches remontées toutes seules, avec l'accroche à l'ouverture", async () => {
    const score = { shots: [{ kind: "ouverture", seconds: 2, text: "Fini la ressaisie" }, { kind: "fin", seconds: 2 }] };
    const { payload, writes, creaUpdates } = fake({ ...CREA, video: { ...CREA.video, score } });
    const renderVisuals = vi.fn();
    const video = vi.fn(async () => ({ score: { shots: [] }, music: 13 }));
    expect(await processNextRetouch(payload, { call: async () => ({ result: RESULT, usage }), renderVisuals, video, material })).toEqual({ id: 3, outcome: "faite" });
    expect(creaUpdates[0]).toEqual({ hook: "Plus jamais de ressaisie" });
    expect(renderVisuals).not.toHaveBeenCalled();
    expect(video).toHaveBeenCalledWith(payload, 9, { styleId: 1, score: { shots: [{ kind: "ouverture", seconds: 2, text: "Plus jamais de ressaisie" }, { kind: "fin", seconds: 2 }] }, music: 13 });
    expect(writes.at(-1)).toMatchObject({ status: "faite", summary: expect.stringMatching(/^Accroche plus directe\. Vidéo et affiches remontées/), before: { hook: "Fini la ressaisie" }, after: expect.any(Object), costEur: expect.any(Number) });
  });

  it("un premier montage : une créa sans vidéo reçoit sa partition, dans le style donné, avec la musique du kit", async () => {
    const { payload } = fake({ ...CREA, video: null, style: null });
    const partition = { shots: [{ kind: "compo", seconds: 3, fond: { type: "style" }, elements: [] }, { kind: "fin", seconds: 2.5 }] };
    const call = async () => ({ result: { resume: "Premier montage.", textes: null, accroche: null, gabarit: null, video: { style: 2, musique: null, sans_musique: false, partition } }, usage });
    const video = vi.fn(async () => ({ score: { shots: [] }, music: null }));
    expect(await processNextRetouch(payload, { call, video, renderVisuals: vi.fn(), material })).toMatchObject({ outcome: "faite" });
    expect(video).toHaveBeenCalledWith(payload, 9, { styleId: 2, score: partition, music: undefined });
  });

  it("sans vidéo : les visuels sont rendus de nouveau", async () => {
    const { payload } = fake({ ...CREA, video: null });
    const renderVisuals = vi.fn(async () => ({ template: "capture" as const, assets: 3, status: "a-valider" }));
    await processNextRetouch(payload, { call: async () => ({ result: RESULT, usage }), renderVisuals, video: vi.fn(), material });
    expect(renderVisuals).toHaveBeenCalledWith(payload, 9, { template: undefined, keepDraft: true });
  });

  it("un montage refusé revient une fois au modèle avec la raison, puis passe", async () => {
    const { payload, writes } = fake();
    const v = { style: 2, musique: null, sans_musique: true, partition: null };
    const call = vi.fn(async () => ({ result: { ...RESULT, accroche: null, video: v }, usage }));
    const video = vi.fn().mockRejectedValueOnce(new FinalError("Partition refusée : Chiffre non sourcé : 3.")).mockResolvedValueOnce({});
    await processNextRetouch(payload, { call, video, renderVisuals: vi.fn(), material });
    expect(call).toHaveBeenCalledTimes(2);
    expect((call.mock.calls[1] as unknown as [{ user: string }])[0].user).toMatch(/REFUSÉE PAR LE CODE : Partition refusée : Chiffre non sourcé : 3/);
    expect(video).toHaveBeenLastCalledWith(payload, 9, { styleId: 2, score: CREA.video.score, music: null });
    expect(writes.at(-1)).toMatchObject({ status: "faite", summary: expect.stringMatching(/remontée/) });
  });

  it("refusé deux fois : échec avec la raison, rien n'est appliqué", async () => {
    const { payload, writes, creaUpdates } = fake();
    const call = vi.fn(async () => ({ result: { ...RESULT, video: { style: null, musique: null, sans_musique: false, partition: { shots: [] } } }, usage }));
    const video = vi.fn(async () => {
      throw new FinalError("Partition refusée : Une vidéo a au moins deux plans.");
    });
    expect(await processNextRetouch(payload, { call, video, renderVisuals: vi.fn(), material })).toMatchObject({ outcome: "echec", error: expect.stringMatching(/deux plans/) });
    expect(creaUpdates).toHaveLength(0);
    expect(writes.at(-1)).toMatchObject({ status: "echec" });
  });

  it("des textes qui laisseraient la créa sans titre passé : refusé, rien n'est changé", async () => {
    const { payload, creaUpdates, writes } = fake();
    const call = async () => ({ result: { ...RESULT, accroche: null, textes: { principal: ["Texte."], titre: ["Testé par 500 chefs"], description: [] } }, usage });
    expect(await processNextRetouch(payload, { call, renderVisuals: vi.fn(), video: vi.fn(), material })).toMatchObject({ outcome: "echec" });
    expect(creaUpdates).toHaveLength(0);
    expect(writes.at(-1)).toMatchObject({ error: expect.stringMatching(/sans texte principal ni titre/) });
  });
});

describe("la demande", () => {
  function fake(status = "a-valider", pending = 0) {
    const created: { collection: string; data: Record<string, unknown> }[] = [];
    const payload = {
      findByID: vi.fn(async () => ({ ...CREA, status })),
      count: vi.fn(async () => ({ totalDocs: pending })),
      create: vi.fn(async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
        created.push({ collection, data });
        return { id: created.length + 40 };
      }),
    };
    return { payload: payload as never, created };
  }

  it("seulement une créa « À valider », une retouche à la fois, une vraie consigne", async () => {
    await expect(requestRetouch(fake("validee").payload, 9, { instruction: "Plus court", generalize: false, author: 1 })).rejects.toThrow(/À valider/);
    await expect(requestRetouch(fake("a-valider", 1).payload, 9, { instruction: "Plus court", generalize: false, author: 1 })).rejects.toThrow(/déjà en cours/);
    await expect(requestRetouch(fake().payload, 9, { instruction: " ", generalize: false, author: 1 })).rejects.toThrow(/Écrivez/);
  });

  it("« valable aussi pour les prochaines créas » : une consigne active pour la campagne, liée à la retouche", async () => {
    const { payload, created } = fake();
    await requestRetouch(payload, 9, { instruction: "Toujours finir par l'essai gratuit", generalize: true, author: 1 });
    expect(created[0]).toMatchObject({ collection: "ad-instructions", data: { text: "Toujours finir par l'essai gratuit", scope: "campagne", campaign: 4, status: "active", origin: "retouche", sourceCreative: 9, confirmedBy: 1 } });
    expect(created[1]).toMatchObject({ collection: "ad-retouches", data: { creative: 9, status: "en-attente", generalize: true, instructionDoc: 41 } });
  });
});

describe("une créa supprimée", () => {
  it("emporte l'historique de ses retouches", async () => {
    const { AdCreatives } = await import("@/modules/ads/collections/AdCreatives");
    const del = vi.fn(async () => ({}));
    await (AdCreatives.hooks!.beforeDelete![0] as (a: unknown) => Promise<void>)({ id: 9, req: { payload: { delete: del } } });
    expect(del).toHaveBeenCalledWith(expect.objectContaining({ collection: "ad-retouches", where: { creative: { equals: 9 } } }));
  });
});
