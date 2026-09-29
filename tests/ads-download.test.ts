import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { META_URL_PARAMS, buildZip, folderOf, textsCsv, textsTxt, zipFileName, type DownloadCreative } from "@/modules/ads/lib/download";

const campaign = { id: 4, name: "Pointage BTP", brief: { landingUrl: "https://tim-management.co/demo", cta: "reserver" } };
const crea = (over: Partial<DownloadCreative> = {}): DownloadCreative => ({
  id: 1,
  angle: "Le pointage papier coûte cher",
  tone: "vous",
  tests: [],
  texts: [
    { kind: "principal", text: "Gagnez 2 h; chaque semaine", status: "ok", chars: 26 },
    { kind: "principal", text: "Un outil révolutionnaire", status: "rejete" },
    { kind: "titre", text: "Le pointage sans papier", status: "ok" },
  ],
  assets: [
    { format: "1x1", type: "image", media: { url: "https://blob.test/a.jpg" } },
    { format: "9x16", type: "image", media: { url: "https://blob.test/b.jpg" } },
  ],
  ...over,
});

describe("paquet téléchargeable", () => {
  it("le fichier de textes porte l'URL et les paramètres d'URL obligatoires", () => {
    const txt = textsTxt(campaign, [crea()], { advertiser: "LC DEV" });
    expect(txt).toContain("URL du site web : https://tim-management.co/demo");
    expect(txt).toContain(META_URL_PARAMS);
    expect(META_URL_PARAMS).toBe("utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_content={{ad.id}}");
    expect(txt).toContain("Bouton d'action : Réserver");
    expect(txt).toContain("Annonceur : LC DEV");
  });

  it("n'emporte que les textes passés par les garde-fous", () => {
    expect(textsTxt(campaign, [crea()], {})).not.toContain("révolutionnaire");
    expect(textsCsv(campaign, [crea()])).not.toContain("révolutionnaire");
  });

  it("CSV pour Excel en français : BOM, point-virgule, cellules protégées", () => {
    const csv = textsCsv(campaign, [crea()]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Gagnez 2 h; chaque semaine"');
    expect(csv.split("\r\n")[0]).toBe("﻿Dossier;Angle;Ton;Test;Champ Meta;Texte;Caractères");
  });

  it("étiquette les variantes de test dans le nom du dossier et dans les textes", () => {
    const tu = crea({ tone: "tu", tests: [{ dimension: "ton", value: "tu" }] });
    expect(folderOf(tu, 1)).toBe("02-le-pointage-papier-coute-cher__test-de-ton-tu");
    expect(textsTxt(campaign, [tu], {})).toMatch(/Tutoiement — test de ton \(tu\), à mesurer à part/);
  });

  it("le ZIP range les images par créa, et les textes à la racine", async () => {
    const zip = await buildZip(campaign, [crea()], {}, async () => ({ data: Buffer.from("jpeg") }));
    const files = unzipSync(zip);
    expect(Object.keys(files).filter((k) => !k.endsWith("/")).sort()).toEqual([
      "01-le-pointage-papier-coute-cher/tim_pointage-btp_le-pointage-papier-coute-cher_1x1.jpg",
      "01-le-pointage-papier-coute-cher/tim_pointage-btp_le-pointage-papier-coute-cher_9x16.jpg",
      "textes.csv",
      "textes.txt",
    ]);
    expect(strFromU8(files["textes.txt"])).toContain("CAMPAGNE : Pointage BTP");
    expect(zipFileName(campaign)).toBe("tim_pointage-btp_creas.zip");
  });
});
