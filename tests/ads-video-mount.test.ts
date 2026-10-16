import { describe, expect, it, vi } from "vitest";

import { BASE_V1_EXAMPLES } from "@/modules/ads/video/base-v1";
import { mountVideo, rushForAgent, styleSettings, variantCopyOf } from "@/modules/ads/video/mount";

/**
 * La vidéo vue par l'agent (plan Publicité, §9 sexies, D4) : ce qu'il lit d'un
 * rush, la copie d'une créa pour un test de style, et le montage dans 1 à 3
 * styles — tout vérifié avant d'écrire.
 */

describe("un rush, tel que l'agent le lit", () => {
  const base = { id: 3, title: "Pointage du matin", source: "app-mobile", features: ["pointage"], description: "Un chef pointe 3 compagnons.", mediaType: "video", working: { meta: { width: 732, height: 1510, durationSec: 12 } } };

  it("la description de l'IA n'est lue que validée, avec ses plans repérés", () => {
    expect(rushForAgent({ ...base, ai: { status: "proposee", proposal: "Détail", timeline: [{ t: 1 }] } })).toMatchObject({ descriptionValidee: null, plans: null });
    expect(rushForAgent({ ...base, ai: { status: "validee", proposal: "Détail", timeline: [{ t: 1 }] } })).toMatchObject({ descriptionValidee: "Détail", plans: [{ t: 1 }] });
  });

  it("dit sa durée, ses dimensions et son recadrage", () => {
    const r = rushForAgent({ ...base, framing: { crop: { x: 0, y: 0.1, w: 1, h: 0.8 }, protect: { x: 0.1, y: 0.3, w: 0.8, h: 0.3 } } });
    expect(r).toMatchObject({ nom: "Pointage du matin", dureeSec: 12, dimensions: "732×1510", recadrage: { zoneUtile: { y: 0.1 }, zoneProtegee: { y: 0.3 } } });
    expect(rushForAgent(base).recadrage).toBeNull();
  });
});

describe("la copie d'une créa pour un test de style", () => {
  const creative = {
    id: 9,
    campaign: 4,
    angle: "Pointage",
    status: "a-valider",
    decidedBy: 2,
    style: 1,
    video: { status: "prete" },
    tests: [{ id: "t1", dimension: "ton", value: "tu" }, { id: "t2", dimension: "style", value: "A" }],
    copy: [{ id: "c1", kind: "titre", text: "T", status: "ok" }],
    generation: { model: "opus", costEur: 0.12 },
  };

  it("reprend textes et visuels, sans identité, décision, vidéo ni style ; repart en brouillon", () => {
    const c = variantCopyOf(creative, "style", "B · Le chantier d'abord");
    expect(c).not.toHaveProperty("id");
    expect(c).not.toHaveProperty("decidedBy");
    expect(c).not.toHaveProperty("video");
    expect(c).not.toHaveProperty("style");
    expect(c).toMatchObject({ campaign: 4, angle: "Pointage", status: "brouillon", copy: [{ kind: "titre", text: "T" }] });
    expect((c.copy as object[])[0]).not.toHaveProperty("id");
  });

  it("étiquetée « test de style » (un seul), les autres tests gardés ; le coût des textes reste sur l'origine", () => {
    const c = variantCopyOf(creative, "style", "B · Le chantier d'abord");
    expect(c.tests).toEqual([{ dimension: "ton", value: "tu" }, { dimension: "style", value: "B · Le chantier d'abord" }]);
    expect(c.generation).toEqual({ model: "opus", costEur: 0 });
  });
});

describe("le montage dans 1 à 3 styles", () => {
  // L'exemple « pointage » de la Base V1, sans preuve (pas de fait dans ce brief) ni variante (pas d'atelier ici).
  const SCORE = (() => {
    const raw = JSON.parse(JSON.stringify(BASE_V1_EXAMPLES[1].partition)) as { base: "v1"; shots: Record<string, unknown>[] };
    raw.shots = raw.shots.filter((x) => x.role !== "preuve");
    for (const x of raw.shots) for (const e of (x.elements as Record<string, unknown>[] | undefined) ?? []) delete e.variante;
    // Sans la variante « Confirmation en grand », la conséquence se fait en cascade de notifications.
    const consequence = raw.shots.find((x) => x.role === "consequence")!;
    const els = consequence.elements as Record<string, unknown>[];
    els.push({ ...els[0], y: 0.62, debut: 0.6 });
    return raw;
  })();

  const MUSICS = [
    { id: 20, kind: "musique", alt: "Énergique", active: true, url: "https://cdn/e.mp3", beat: { bpm: 120, bestStartSec: 12 } },
    { id: 21, kind: "musique", filename: "pose.mp3", active: true, url: "https://cdn/p.mp3", beat: { bpm: 90 } },
    { id: 22, kind: "musique", alt: "Vieille", active: false, url: "https://cdn/v.mp3" },
    { id: 23, kind: "photo", url: "https://cdn/x.jpg" },
  ];
  function fake({ used = 0, styles = [{ id: 1, name: "A", active: true }, { id: 2, name: "B", active: true }, { id: 3, name: "C", active: false }] } = {}) {
    const created: Record<string, unknown>[] = [];
    const updates: { id: unknown; data: Record<string, unknown> }[] = [];
    const docs: Record<string, Record<string, unknown>> = {
      "ad-creatives": { id: 9, campaign: 4, angle: "Pointage", hook: "Fini la ressaisie", cta: "en-savoir-plus", status: "brouillon", copy: [], tests: [] },
      "ad-campaigns": { id: 4, name: "Démos", status: "brouillon", brief: { audience: "BTP", pain: "Papier", offer: "essai gratuit de 30 jours", proofs: [], angles: [] } },
    };
    const payload = {
      findByID: vi.fn(async ({ collection, id }: { collection: string; id: unknown }) =>
        collection === "ad-styles" ? styles.find((s) => s.id === Number(id)) : collection === "ad-media" ? MUSICS.find((m) => m.id === Number(id)) : docs[collection],
      ),
      findGlobal: vi.fn(async ({ slug }: { slug: string }) => (slug === "ads-brand-kit" ? { forbidden: [] } : slug === "ads-settings" ? { creativesPerCampaignPerWeek: 6 } : {})),
      find: vi.fn(async ({ collection, where }: { collection: string; where?: { id?: { in: number[] } } }) =>
        collection === "ad-styles"
          ? { docs: styles.filter((s) => where?.id?.in.includes(s.id)) }
          : collection === "ad-media"
            ? { docs: MUSICS.filter((m) => where?.id?.in.includes(m.id)) }
            : collection === "ad-rushes"
              ? { docs: [{ id: 1, features: ["pointage"], processing: { status: "pret" }, working: { url: "u", meta: { width: 732, height: 1510, durationSec: 12 } } }] }
              : { docs: [] },
      ),
      count: vi.fn(async () => ({ totalDocs: used })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: 100 + created.length };
      }),
      update: vi.fn(async ({ id, data }: { id: unknown; data: Record<string, unknown> }) => updates.push({ id, data })),
    };
    return { payload: payload as never, created, updates };
  }
  const NOW = new Date("2026-10-14T10:00:00Z");

  it("un style : la vidéo de la créa elle-même, en file", async () => {
    const { payload, created, updates } = fake();
    expect(await mountVideo(payload, 4, 9, { styles: [1], score: SCORE }, NOW)).toEqual({ creas: [{ crea: 9, style: 1, styleNom: "A", musique: null, musiqueNom: null, test: false }], ecartes: [] });
    expect(created).toHaveLength(0);
    expect(updates[0]).toMatchObject({ id: 9, data: { style: 1, video: { status: "en-attente", score: { shots: expect.any(Array) } } } });
  });

  it("deux styles : la créa, et une copie « test de style » en file dans le second", async () => {
    const { payload, created, updates } = fake();
    const r = await mountVideo(payload, 4, 9, { styles: [1, 2], score: SCORE }, NOW);
    expect(r.creas).toEqual([
      { crea: 9, style: 1, styleNom: "A", musique: null, musiqueNom: null, test: false },
      { crea: 101, style: 2, styleNom: "B", musique: null, musiqueNom: null, test: true },
    ]);
    expect(created[0]).toMatchObject({ tests: [{ dimension: "style", value: "B" }], status: "brouillon" });
    expect(updates.map((u) => u.id)).toEqual([9, 101]);
  });

  it("au-delà du quota de la semaine, le style est écarté avec la raison", async () => {
    const { payload, created } = fake({ used: 6 });
    const r = await mountVideo(payload, 4, 9, { styles: [1, 2], score: SCORE }, NOW);
    expect(created).toHaveLength(0);
    expect(r.ecartes).toEqual([{ variante: "B", raison: expect.stringMatching(/Quota/) }]);
  });

  it("un style désactivé ou inconnu, ou une partition refusée : rien ne s'écrit", async () => {
    for (const styles of [[1, 3], [1, 7]]) {
      const { payload, created, updates } = fake();
      await expect(mountVideo(payload, 4, 9, { styles, score: SCORE }, NOW)).rejects.toThrow(/désactivé|introuvable/);
      expect(created.length + updates.length).toBe(0);
    }
    const { payload, created, updates } = fake();
    const bad = JSON.parse(JSON.stringify(SCORE)) as typeof SCORE;
    ((bad.shots[0].elements as Record<string, unknown>[])[0].data as Record<string, unknown>).texte = "Gagnez 3 heures";
    await expect(mountVideo(payload, 4, 9, { styles: [1, 2], score: bad }, NOW)).rejects.toThrow(/Chiffre non sourcé : 3/);
    expect(created.length + updates.length).toBe(0);
  });

  it("au plus trois styles, au moins un, et une partition", async () => {
    const { payload } = fake();
    await expect(mountVideo(payload, 4, 9, { styles: [], score: SCORE }, NOW)).rejects.toThrow(/au moins un style/);
    await expect(mountVideo(payload, 4, 9, { styles: [1, 2, 3, 4], score: SCORE }, NOW)).rejects.toThrow(/3 vidéos au plus/);
    await expect(mountVideo(payload, 4, 9, { styles: [1], score: null }, NOW)).rejects.toThrow(/partition/);
  });

  it("une musique : la vidéo de la créa porte cette musique", async () => {
    const { payload, updates } = fake();
    const r = await mountVideo(payload, 4, 9, { styles: [1], musics: [20], score: SCORE }, NOW);
    expect(r.creas).toEqual([{ crea: 9, style: 1, styleNom: "A", musique: 20, musiqueNom: "Énergique", test: false }]);
    expect(updates[0]).toMatchObject({ data: { video: { music: 20 } } });
  });

  it("un style sur deux musiques : une copie « test de musique »", async () => {
    const { payload, created, updates } = fake();
    const r = await mountVideo(payload, 4, 9, { styles: [1], musics: [20, 21], score: SCORE }, NOW);
    expect(r.creas.map((c) => [c.crea, c.style, c.musique, c.musiqueNom, c.test])).toEqual([
      [9, 1, 20, "Énergique", false],
      [101, 1, 21, "pose", true],
    ]);
    expect(created[0]).toMatchObject({ tests: [{ dimension: "musique", value: "pose" }] });
    expect(updates[1]).toMatchObject({ id: 101, data: { video: { music: 21 } } });
  });

  it("styles ET musiques à la fois : refusé, une seule chose à la fois", async () => {
    const { payload, created, updates } = fake();
    await expect(mountVideo(payload, 4, 9, { styles: [1, 2], musics: [20, 21], score: SCORE }, NOW)).rejects.toThrow(/qu'une chose à la fois/);
    expect(created.length + updates.length).toBe(0);
  });

  it("une musique désactivée, absente ou qui n'en est pas une : rien ne s'écrit", async () => {
    for (const [musics, why] of [[[20, 22], /désactivée/], [[99], /introuvable/], [[23], /introuvable/]] as const) {
      const { payload, created, updates } = fake();
      await expect(mountVideo(payload, 4, 9, { styles: [1], musics: [...musics], score: SCORE }, NOW)).rejects.toThrow(why);
      expect(created.length + updates.length).toBe(0);
    }
  });

  it("trois vidéos au plus, musiques comprises", async () => {
    const { payload } = fake();
    await expect(mountVideo(payload, 4, 9, { styles: [1], musics: [20, 21, 24, 25], score: SCORE }, NOW)).rejects.toThrow(/3 vidéos au plus/);
  });
});

describe("ce que l'agent sait d'un style", () => {
  it("dit si un zoom ou un sous-titre écrit dans la partition sera suivi", () => {
    expect(styleSettings({ opening: "titre-mot-a-mot", zoomOnGesture: true, subtitles: "mot-a-mot", pace: "rapide" })).toMatch(/titre qui arrive mot à mot.*zoom sur le geste appliqué.*sous-titres mot à mot.*rythme rapide/);
    expect(styleSettings({ zoomOnGesture: false, subtitles: "aucun" })).toMatch(/PAS de zoom.*aucun sous-titre/);
    expect(styleSettings({ titleFont: "kit", logoAnimation: "construction" })).toMatch(/police du Kit de marque.*logo construit élément par élément/);
  });
});
