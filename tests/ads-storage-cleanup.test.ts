import { describe, expect, it, vi } from "vitest";

import { cleanupAdsStorage, normUrl, plan, urlsIn, type Blob } from "@/modules/ads/lib/storage-cleanup";

/** Le ménage du stockage des pubs : ce qui ne sert plus part, ce qui sert reste — même écrit autrement. */

const NOW = new Date("2026-10-30T03:30:00Z");
const B = "https://abc.public.blob.vercel-storage.com/";
const blob = (pathname: string, daysAgo: number, size = 1000): Blob => ({ url: B + encodeURI(pathname), pathname, size, uploadedAt: new Date(NOW.getTime() - daysAgo * 86_400_000) });

describe("les adresses", () => {
  it("trouvées dans une ligne de base, et comparées sous une même forme (accents, espaces)", () => {
    const enBase = `{"url":"${B}ads/rushes/Capture%20d%E2%80%99e%CC%81cran%20a%CC%80%2012.png","x":1}`;
    expect(urlsIn(enBase)).toHaveLength(1);
    expect(normUrl(B + "ads/rushes/Capture d’écran à 12.png")).toBe(urlsIn(enBase)[0]);
  });
});

describe("le plan du ménage", () => {
  const used = blob("ads/creas/videos/9/a-9x16.mp4", 30);
  const ref = new Set([normUrl(used.url)]);

  it("garde ce qui sert, et ce qui a moins de 7 jours ; retire les orphelins anciens", () => {
    const old = blob("ads/elements/1/apercu-ancien.mp4", 10);
    const fresh = blob("ads/elements/1/apercu-neuf.mp4", 2);
    expect(plan([used, old, fresh], ref, NOW).orphans).toEqual([old]);
  });

  it("les ZIP partent au bout de 24 h, même cités", () => {
    const zip = blob("ads/zips/tim_demos.zip", 2);
    const today = blob("ads/zips/tim_jour.zip", 0.2);
    expect(plan([zip, today], new Set([normUrl(zip.url)]), NOW).zips).toEqual([zip]);
  });
});

describe("le ménage", () => {
  // Les fichiers des affiches sont sur le stockage, sous « ads/ » : ils comptent dans le total.
  const AFFICHES = [blob("ads/affiche-old.jpg", 10), blob("ads/affiche-citee.jpg", 10)];
  function fake(retouches = "[]") {
    const deleted: unknown[] = [];
    const reads: string[] = [];
    const payload = {
      db: {
        drizzle: {
          // On reconnaît la requête à son texte : les affiches remplacées, les retouches, ou une autre table de références.
          execute: vi.fn(async (q: { queryChunks: unknown }) => {
            const text = JSON.stringify(q.queryChunks);
            reads.push(text);
            if (text.includes('\\"ad_media\\" m')) return { rows: [{ id: 5, url: B + "ads/affiche-old.jpg" }, { id: 6, url: B + "ads/affiche-citee.jpg" }] };
            if (text.includes("ad_retouches")) return { rows: [{ j: `{"before":{"assets":[{"url":"${B}ads/affiche-citee.jpg"}]}}` + retouches }] };
            // Les fiches « Créa rendue » pointent sur leurs fichiers, comme en base.
            return { rows: [{ j: `{"url":"${B}ads/creas/videos/9/a-9x16.mp4","affiches":["${B}ads/affiche-old.jpg","${B}ads/affiche-citee.jpg"]}` }] };
          }),
        },
      },
      delete: vi.fn(async (a: unknown) => deleted.push(a)),
    };
    return { payload: payload as never, deleted, reads };
  }

  it("retire les affiches remplacées, sauf celles qu'une retouche cite ; puis les orphelins", async () => {
    const { payload, deleted } = fake();
    const del = vi.fn(async () => {});
    const r = await cleanupAdsStorage(payload, { now: () => NOW, list: async () => [blob("ads/creas/videos/9/a-9x16.mp4", 30), blob("ads/elements/1/apercu-ancien.mp4", 10, 5000), ...AFFICHES], del });
    expect(deleted).toEqual([expect.objectContaining({ collection: "ad-media", id: 5 })]);
    expect(del).toHaveBeenCalledWith([B + "ads/elements/1/apercu-ancien.mp4"]);
    expect(r).toMatchObject({ affiches: 1, orphelins: 1, octets: 5000, arrete: null });
  });

  it("à blanc : on compte, rien n'est supprimé", async () => {
    const { payload, deleted } = fake();
    const del = vi.fn();
    const r = await cleanupAdsStorage(payload, { now: () => NOW, list: async () => [blob("ads/creas/videos/9/a-9x16.mp4", 30), blob("ads/elements/1/apercu-ancien.mp4", 10), ...AFFICHES], del, dryRun: true });
    expect(deleted).toEqual([]);
    expect(del).not.toHaveBeenCalled();
    expect(r.orphelins).toBe(1);
  });

  it("s'il voulait retirer plus de la moitié des fichiers, il s'arrête sans rien supprimer — ni fichier, ni affiche", async () => {
    const { payload, deleted } = fake();
    const del = vi.fn();
    const r = await cleanupAdsStorage(payload, { now: () => NOW, list: async () => [blob("ads/a.mp4", 10), blob("ads/b.mp4", 10), blob("ads/creas/videos/9/a-9x16.mp4", 30), ...AFFICHES], del });
    expect(del).not.toHaveBeenCalled();
    expect(deleted).toEqual([]);
    // L'affiche remplacée compte avec les deux orphelins.
    expect(r.arrete).toMatch(/Ménage arrêté : 3 fichiers sur 5/);
  });

  it("le garde-fou compte aussi les affiches : sous la moitié des fichiers, elles partent", async () => {
    const { payload, deleted } = fake();
    const del = vi.fn(async () => {});
    const files = [blob("ads/creas/videos/9/a-9x16.mp4", 30), blob("ads/x.mp4", 1), blob("ads/y.mp4", 1), blob("ads/z.mp4", 1), blob("ads/a.mp4", 10), ...AFFICHES];
    const r = await cleanupAdsStorage(payload, { now: () => NOW, list: async () => files, del });
    expect(r.arrete).toBeNull();
    expect(deleted).toHaveLength(1);
    expect(r).toMatchObject({ affiches: 1, orphelins: 1 });
  });

  it("lit chaque table une seule fois (les retouches comprises)", async () => {
    const { payload, reads } = fake();
    await cleanupAdsStorage(payload, { now: () => NOW, list: async () => [], del: vi.fn(), dryRun: true });
    expect(reads.filter((t) => t.includes("ad_retouches"))).toHaveLength(1);
  });
});
