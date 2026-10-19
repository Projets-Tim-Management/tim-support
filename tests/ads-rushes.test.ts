import { describe, expect, it, vi } from "vitest";

import { AdRushes } from "@/modules/ads/collections/AdRushes";
import { isRushBlobUrl, isRushPathname, mediaTypeOf, rushPathname, rushRefusal, RUSH_MAX_BYTES } from "@/modules/ads/lib/rushes";

/**
 * Les rushes (plan Publicité) : ce qui s'importe, où ça se range, et ce que la
 * fiche garantit avant que l'agent ne les désigne dans un brief.
 */

const BLOB = "https://abc123.public.blob.vercel-storage.com/ads/rushes/pointage-AbC.mov";

describe("ce qui s'importe", () => {
  it("vidéos MP4 et MOV de l'iPhone, images PNG, JPEG, WebP — refus dit avant l'envoi", () => {
    expect(rushRefusal({ type: "video/quicktime", size: 80 * 1024 * 1024 })).toBeNull();
    expect(rushRefusal({ type: "image/png", size: 1000 })).toBeNull();
    expect(rushRefusal({ type: "video/x-msvideo", size: 1000 })).toMatch(/Format non pris en charge/);
    expect(rushRefusal({ type: "video/mp4", size: RUSH_MAX_BYTES + 1 })).toMatch(/500 Mo au plus/);
  });

  it("type déduit du fichier", () => {
    expect(mediaTypeOf("video/quicktime")).toBe("video");
    expect(mediaTypeOf("image/webp")).toBe("image");
    expect(mediaTypeOf(undefined)).toBeNull();
  });
});

describe("où ça se range", () => {
  it("dans le dossier des rushes, nom réduit à des caractères sûrs", () => {
    expect(rushPathname("Pointage Été 2.MOV")).toBe("ads/rushes/pointage-ete-2.mov");
    expect(rushPathname("...")).toBe("ads/rushes/rush");
  });

  it("le jeton ne s'accorde que dans le dossier des rushes, sans remontée", () => {
    expect(isRushPathname("ads/rushes/a.mp4")).toBe(true);
    expect(isRushPathname("ads/a.mp4")).toBe(false);
    expect(isRushPathname("ads/rushes/../media/a.mp4")).toBe(false);
  });

  it("la fiche n'accepte que NOTRE stockage, dans le dossier des rushes", () => {
    expect(isRushBlobUrl(BLOB)).toBe(true);
    expect(isRushBlobUrl("https://evil.example.com/ads/rushes/a.mp4")).toBe(false);
    expect(isRushBlobUrl("https://abc.public.blob.vercel-storage.com/media/a.mp4")).toBe(false);
    expect(isRushBlobUrl("http://abc.public.blob.vercel-storage.com/ads/rushes/a.mp4")).toBe(false);
  });
});

describe("la fiche", () => {
  const prepare = AdRushes.hooks!.beforeChange![0] as unknown as (a: unknown) => Record<string, unknown>;
  const original = { url: BLOB, contentType: "video/quicktime", filename: "Pointage.MOV", size: 10 };

  it("refuse une fiche sans fichier déposé sur notre stockage", () => {
    expect(() => prepare({ data: { title: "x", original: { url: "https://ailleurs.fr/a.mp4" } }, operation: "create" })).toThrow(/Déposez d'abord le fichier/);
  });

  it("déduit le type du fichier déposé", () => {
    expect(prepare({ data: { title: "x", original }, operation: "create" })).toMatchObject({ mediaType: "video" });
  });

  it("supprimer la fiche supprime ses fichiers du stockage", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "t");
    const del = vi.fn(async () => {});
    vi.doMock("@vercel/blob", () => ({ del }));
    // Le hook importe le stockage à la demande : le simulacre s'applique.
    const hook = AdRushes.hooks!.afterDelete![0] as unknown as (a: unknown) => Promise<unknown>;
    await hook({ doc: { id: 1, original }, req: { payload: { logger: { warn: vi.fn() } } } });
    expect(del).toHaveBeenCalledWith([BLOB], { token: "t" });
    vi.unstubAllEnvs();
    vi.doUnmock("@vercel/blob");
  });
});
