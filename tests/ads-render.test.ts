import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { BRAND_DEFAULTS } from "@/core/lib/brand";
import { FORMATS, FORMAT_KEYS, fit, hookFontSize, safeBox } from "@/modules/ads/lib/render/formats";
import { fallbackFonts, renderVisual, toDataUri } from "@/modules/ads/lib/render/render";
import { TEMPLATES } from "@/modules/ads/lib/render/templates";
import { pickTemplate, renderCreativeVisuals, templateAvailable } from "@/modules/ads/lib/render/visuals";

const colors = { primary: BRAND_DEFAULTS.brandPrimary, secondary: BRAND_DEFAULTS.brandSecondary, red: BRAND_DEFAULTS.brandRed, other: BRAND_DEFAULTS.brandOther };
const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#e8ebf2" } }).png().toBuffer();

describe("formats et zone sûre", () => {
  it("9:16 : la zone sûre unifiée de Meta (14 % haut, 35 % bas, 6 % côtés)", () => {
    expect(FORMATS["9x16"].safe).toEqual({ top: 269, bottom: 672, left: 65, right: 65 });
    expect(safeBox(FORMATS["9x16"])).toEqual({ x: 65, y: 269, width: 950, height: 979 });
  });
  it("l'accroche garde sa taille jusqu'à 40 caractères, jamais sous 60 %", () => {
    const f = FORMATS["4x5"];
    expect(hookFontSize(f, "x".repeat(40))).toBe(f.hookSize);
    expect(hookFontSize(f, "x".repeat(200))).toBe(Math.round(f.hookSize * 0.6));
  });
  it("cadre une image sans la déformer", () => {
    expect(fit({ width: 900, height: 1600 }, { width: 950, height: 500 })).toEqual({ width: 281, height: 500 });
  });
});

describe("rendu réel (Satori + sharp)", () => {
  it("chaque gabarit, dans chaque format, aux dimensions exactes, en JPEG sRGB", async () => {
    const fonts = await fallbackFonts();
    const shot = await png(900, 1600);
    for (const t of TEMPLATES) {
      for (const k of FORMAT_KEYS) {
        const jpg = await renderVisual(t.key, k, {
          hook: "Finie la feuille de temps papier",
          cta: "Réserver",
          colors,
          image: toDataUri(shot, "image/png"),
          imageSize: { width: 900, height: 1600 },
          fact: { statement: "Nos clients gagnent 2 h par semaine", source: "Enquête, mars 2026" },
        }, fonts);
        const m = await sharp(jpg).metadata();
        expect([t.key, k, m.width, m.height, m.format, m.space]).toEqual([t.key, k, FORMATS[k].width, FORMATS[k].height, "jpeg", "srgb"]);
      }
    }
  }, 60_000);
});

describe("choix du gabarit", () => {
  it("le plus parlant parmi ceux dont on a la matière", () => {
    expect(pickTemplate({ capture: true, fact: true, photo: true })).toBe("capture");
    expect(pickTemplate({ capture: false, fact: true, photo: true })).toBe("chiffre");
    expect(pickTemplate({ capture: false, fact: false, photo: true })).toBe("photo");
    expect(pickTemplate({ capture: false, fact: false, photo: false })).toBe("texte");
  });
  it("refuse un gabarit demandé sans sa matière", () => {
    expect(templateAvailable("capture", { capture: false, fact: true, photo: true })).toBe(false);
    expect(templateAvailable("texte", { capture: false, fact: false, photo: false })).toBe(true);
  });
});

describe("visuels d'une créa", () => {
  function memory(creative: Record<string, unknown>, opts: { capture?: boolean } = {}) {
    const created: { collection: string; data: Record<string, unknown>; file?: { name: string; size: number } }[] = [];
    const updates: Record<string, unknown>[] = [];
    const payload = {
      findByID: async () => creative,
      findGlobal: async ({ slug }: { slug: string }) => (slug === "appearance" ? { companyLogo: null } : { logoOnDark: null, fonts: [] }),
      find: async ({ where }: { where: { and?: [{ kind: { equals: string } }] ; kind?: { equals: string } } }) => {
        const kind = where.and?.[0].kind.equals ?? where.kind?.equals;
        return { docs: kind === "capture" && opts.capture ? [{ id: 50, url: "https://blob.test/capture.png", mimeType: "image/png" }] : [] };
      },
      create: async (a: { collection: string; data: Record<string, unknown>; file?: { name: string; size: number } }) => (created.push(a), { id: 100 + created.length }),
      update: async ({ data }: { data: Record<string, unknown> }) => (updates.push(data), data),
    };
    return { payload: payload as never, created, updates };
  }
  const base = {
    id: 9,
    angle: "Le pointage papier coûte cher",
    hook: "Finie la feuille de temps",
    cta: "reserver",
    campaign: { id: 4, name: "Pointage BTP" },
    facts: [],
    status: "brouillon",
    copy: [
      { kind: "principal", text: "Gagnez du temps.", status: "ok" },
      { kind: "titre", text: "Le pointage sans papier", status: "ok" },
    ],
  };

  it("rend les trois formats avec la capture, les range dans les médias publicitaires, et passe la créa « À valider »", async () => {
    const shot = await png(1200, 800);
    const { payload, created, updates } = memory(base, { capture: true });
    const r = await renderCreativeVisuals(payload, 9, { load: async () => ({ data: shot, mime: "image/png" }) });
    expect(r).toEqual({ template: "capture", assets: 3, status: "a-valider" });
    expect(created.map((c) => [c.collection, c.data.kind])).toEqual([["ad-media", "crea"], ["ad-media", "crea"], ["ad-media", "crea"]]);
    expect(created[0].file!.name).toBe("tim_pointage-btp_le-pointage-papier-coute-cher_1x1_capture.jpg");
    expect((updates[0].assets as { format: string }[]).map((a) => a.format)).toEqual(["1x1", "4x5", "9x16"]);
  }, 30_000);

  it("sans texte principal passé, la créa reste en brouillon", async () => {
    const { payload } = memory({ ...base, copy: [{ kind: "titre", text: "T", status: "ok" }] });
    const r = await renderCreativeVisuals(payload, 9, { load: async () => { throw new Error("rien à charger"); } });
    expect(r).toMatchObject({ template: "texte", status: "brouillon" });
  }, 30_000);

  it("une créa déjà validée ne revient pas en arrière", async () => {
    const { payload } = memory({ ...base, status: "validee" });
    const r = await renderCreativeVisuals(payload, 9, { template: "texte", load: async () => { throw new Error("x"); } });
    expect(r.status).toBe("validee");
  }, 30_000);
});
