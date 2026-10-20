import { slugify } from "@/core/lib/slug";
import { strToU8, zipSync, type Zippable } from "fflate";

import { ctaLabel } from "@/modules/ads/lib/cta";
import { testLabel, toneLabel, type TestDimension } from "@/modules/ads/lib/dimensions";

/**
 * Le paquet téléchargeable des créas validées (plan Publicité, §9 ter, point 7).
 *
 * Tout ce qu'il faut pour publier à la main dans le Gestionnaire de publicités,
 * sans rien retaper : les fichiers finis importés depuis Claude Design (images
 * et vidéos, aux formats du brief), nommés pour qu'on sache ce qu'on dépose, et un fichier de textes — textes principaux, titres,
 * descriptions, bouton, URL de destination et PARAMÈTRES D'URL obligatoires
 * (plan, §4.8), sans lesquels les leads tomberaient dans le mauvais canal.
 *
 * Seuls les textes passés par les garde-fous y figurent.
 */

/** Les paramètres d'URL obligatoires sur toute annonce Meta de TIM (§4.8). */
export const META_URL_PARAMS = "utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_content={{ad.id}}";

export type DownloadCreative = {
  id: number | string;
  angle: string;
  tone: string;
  cta?: string | null;
  tests?: { dimension: TestDimension; value: string }[] | null;
  copy?: { kind: string; text: string; status: string; chars?: number | null }[] | null;
  /** Les fichiers finis, importés depuis Claude Design. */
  files?: { format: string; kind: string; url: string; filename?: string | null }[] | null;
};
export type DownloadCampaign = { id: number | string; name: string; brief?: { landingUrl?: string | null; cta?: string | null } | null };
export type DownloadKit = { advertiser?: string | null; legalNotice?: string | null };

/** Nom de fichier : l'angle en entier ferait une phrase. */
const slug = (s: string) => slugify(s, { max: 40 });

const KIND_LABEL: Record<string, string> = { principal: "Texte principal", titre: "Titre", description: "Description" };

/** Le dossier d'une créa : son rang, son angle, et l'étiquette de test s'il y en a une. */
export const folderOf = (c: DownloadCreative, i: number) => {
  const test = (c.tests ?? []).map((t) => slug(testLabel(t.dimension)) + "-" + slug(t.value)).join("_");
  return `${String(i + 1).padStart(2, "0")}-${slug(c.angle)}${test ? `__${test}` : ""}`;
};

/** L'extension d'un fichier importé, d'après son nom (jpg pour une image, mp4 pour une vidéo par défaut). Pure. */
const extOf = (f: { kind: string; filename?: string | null }) => {
  const m = /\.([a-z0-9]{2,4})$/i.exec(f.filename ?? "");
  return m ? m[1].toLowerCase() : f.kind === "video" ? "mp4" : "jpg";
};

export const assetName = (campaign: DownloadCampaign, c: DownloadCreative, format: string, ext = "jpg") => `tim_${slug(campaign.name)}_${slug(c.angle)}_${format}.${ext}`;

const okTexts = (c: DownloadCreative) => (c.copy ?? []).filter((t) => t.status === "ok");

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Le fichier de textes, pour Excel en français : UTF-8 avec BOM, séparateur point-virgule. */
export function textsCsv(campaign: DownloadCampaign, creatives: DownloadCreative[]): string {
  const rows: (string | number)[][] = [["Dossier", "Angle", "Ton", "Test", "Champ Meta", "Texte", "Caractères"]];
  creatives.forEach((c, i) => {
    const test = (c.tests ?? []).map((t) => `${testLabel(t.dimension)} : ${t.value}`).join(", ");
    for (const t of okTexts(c)) rows.push([folderOf(c, i), c.angle, toneLabel(c.tone), test, KIND_LABEL[t.kind] ?? t.kind, t.text, t.chars ?? [...t.text].length]);
  });
  return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

/** La même chose, lisible : ce qu'on a sous les yeux en remplissant le Gestionnaire de publicités. */
export function textsTxt(campaign: DownloadCampaign, creatives: DownloadCreative[], kit: DownloadKit): string {
  const cta = ctaLabel(campaign.brief?.cta) ?? "En savoir plus";
  const out = [
    `CAMPAGNE : ${campaign.name}`,
    "",
    `URL du site web : ${campaign.brief?.landingUrl ?? "(à renseigner dans le brief)"}`,
    `Paramètres d'URL (OBLIGATOIRES, à coller tels quels) : ${META_URL_PARAMS}`,
    `Bouton d'action : ${cta}`,
    kit.advertiser ? `Annonceur : ${kit.advertiser}` : "",
    kit.legalNotice ? `Mentions : ${kit.legalNotice}` : "",
    "",
  ];
  creatives.forEach((c, i) => {
    const test = (c.tests ?? []).map((t) => `${testLabel(t.dimension)} (${t.value})`).join(", ");
    out.push(`── ${folderOf(c, i)} ──`, `Angle : ${c.angle}`, `Ton : ${toneLabel(c.tone)}${test ? ` — ${test}, à mesurer à part` : ""}`);
    for (const kind of ["principal", "titre", "description"]) {
      const list = okTexts(c).filter((t) => t.kind === kind);
      if (!list.length) continue;
      out.push("", `${KIND_LABEL[kind]}s :`, ...list.map((t, n) => `  ${n + 1}. ${t.text}`));
    }
    out.push("");
  });
  return out.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

export type Loader = (url: string) => Promise<{ data: Buffer }>;

/** Téléchargements simultanés au plus : assez pour ne pas attendre fichier après fichier, sans saturer le stockage. */
export const ZIP_CONCURRENCY = 5;

/** `fn` sur chaque élément, `limit` à la fois ; les résultats dans l'ordre des éléments. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Le ZIP : un dossier par créa (ses fichiers), et les deux fichiers de textes à la racine. */
export async function buildZip(campaign: DownloadCampaign, creatives: DownloadCreative[], kit: DownloadKit, load: Loader): Promise<Uint8Array> {
  // D'abord la liste des fichiers, dans l'ordre du ZIP ; puis les téléchargements, en parallèle.
  const wanted: { folder: string; name: string; url: string }[] = [];
  for (const [i, c] of creatives.entries()) {
    const folder = folderOf(c, i);
    for (const f of c.files ?? []) {
      if (f.url) wanted.push({ folder, name: assetName(campaign, c, f.format, extOf(f)), url: f.url });
    }
  }
  const data = await mapLimit(wanted, ZIP_CONCURRENCY, async (w) => new Uint8Array((await load(w.url)).data));

  const files: Zippable = {};
  for (const [i, c] of creatives.entries()) files[folderOf(c, i)] = {};
  wanted.forEach((w, n) => {
    (files[w.folder] as Zippable)[w.name] = data[n];
  });
  files["textes.csv"] = strToU8(textsCsv(campaign, creatives));
  files["textes.txt"] = strToU8(textsTxt(campaign, creatives, kit));
  // Les JPEG et les MP4 sont déjà compressés : on les range, on ne les recompresse pas.
  return zipSync(files, { level: 0 });
}

export const zipFileName = (campaign: DownloadCampaign, suffix = "") => `tim_${slug(campaign.name)}${suffix ? `_${slug(suffix)}` : ""}_creas.zip`;
