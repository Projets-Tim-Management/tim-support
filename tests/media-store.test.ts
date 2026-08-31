import { afterEach, describe, expect, it } from "vitest";

import { TYPES_ANIMES, baseDuMagasin, estTypeAnime, storeIdDepuisJeton, urlDuFichier } from "@/core/lib/media-store";

/**
 * L'adresse à laquelle le serveur relit un fichier déposé par le navigateur.
 *
 * Deux choses en dépendent, et elles échouent toutes les deux en silence :
 * une base mal dérivée donne une image en ligne mais introuvable ; une URL
 * acceptée depuis le client ferait émettre au serveur la requête de son choix.
 * D'où une construction à partir du NOM seul, et ces tests.
 */

const JETON = "vercel_blob_rw_ytlg8jezeqmgptjq_aBcD1234";
const BASE = "https://ytlg8jezeqmgptjq.public.blob.vercel-storage.com";

afterEach(() => delete process.env.STORAGE_VERCEL_BLOB_BASE_URL);

describe("magasin déduit du jeton", () => {
  it("retrouve l'identifiant, en minuscules", () => {
    expect(storeIdDepuisJeton(JETON)).toBe("ytlg8jezeqmgptjq");
    expect(storeIdDepuisJeton("vercel_blob_rw_ABC123_xyz")).toBe("abc123");
  });

  it("refuse un jeton d'une autre forme plutôt que d'inventer une base", () => {
    for (const mauvais of [undefined, null, "", "pas-un-jeton", "vercel_blob_rw_incomplet"]) {
      expect(storeIdDepuisJeton(mauvais), String(mauvais)).toBeNull();
      expect(baseDuMagasin(mauvais)).toBeNull();
    }
  });

  it("compose la base publique du magasin", () => {
    expect(baseDuMagasin(JETON)).toBe(BASE);
  });

  it("laisse l'émulateur prendre la main, sans barre finale en trop", () => {
    process.env.STORAGE_VERCEL_BLOB_BASE_URL = "http://localhost:9999/";
    expect(baseDuMagasin(JETON)).toBe("http://localhost:9999");
  });
});

describe("URL d'un fichier", () => {
  it("se construit à partir du nom", () => {
    expect(urlDuFichier(JETON, "demo.gif")).toBe(`${BASE}/demo.gif`);
  });

  it("encode ce qui doit l'être, sans casser le nom", () => {
    // Les noms à espaces et accents existent déjà en base (« Selfi_mail 2.png »).
    expect(urlDuFichier(JETON, "Selfi_mail 2.png")).toBe(`${BASE}/Selfi_mail%202.png`);
    expect(urlDuFichier(JETON, "écran.gif")).toContain("%C3%A9cran.gif");
  });

  it("ne sort jamais du magasin, quoi qu'on lui donne", () => {
    // Le nom arrive assaini, mais la garantie doit tenir seule : c'est cette
    // URL que le serveur appellera.
    for (const nom of ["../../etc/passwd", "http://169.254.169.254/latest/meta-data", "a/b.png"]) {
      expect(urlDuFichier(JETON, nom)?.startsWith(`${BASE}/`), nom).toBe(true);
    }
  });

  it("renonce quand le stockage n'est pas configuré", () => {
    expect(urlDuFichier(null, "demo.gif")).toBeNull();
    expect(urlDuFichier(JETON, "")).toBeNull();
  });
});

describe("types animés", () => {
  it("reconnaît ceux que Payload ré-encode image par image", () => {
    // La liste doit être LA SIENNE, ni plus ni moins : un type en trop ferait
    // sonder un chemin qu'il ne prend pas, un type manquant laisserait passer
    // l'échec qu'on cherche à expliquer.
    expect(TYPES_ANIMES).toEqual(["image/avif", "image/gif", "image/webp"]);
    expect(estTypeAnime("image/gif")).toBe(true);
    expect(estTypeAnime("IMAGE/GIF")).toBe(true);
  });

  it("laisse les images fixes de côté", () => {
    // Elles ne passent pas par le même chemin : les sonder autrement dirait
    // « tout va bien » là où Payload, lui, échoue.
    expect(estTypeAnime("image/png")).toBe(false);
    expect(estTypeAnime("application/pdf")).toBe(false);
    expect(estTypeAnime(undefined)).toBe(false);
    expect(estTypeAnime(null)).toBe(false);
  });
});
