import type { Payload, Where } from "payload";
import sharp from "sharp";

import { brandColorsOf } from "@/core/lib/brand";
import { publishable } from "@/modules/ads/lib/copy/generate";
import { ctaLabel } from "@/modules/ads/lib/cta";
import { FORMAT_KEYS } from "@/modules/ads/lib/render/formats";
import { fallbackFonts, renderVisual, toDataUri, type FontSpec } from "@/modules/ads/lib/render/render";
import { TEMPLATES, type TemplateKey, type VisualInput } from "@/modules/ads/lib/render/templates";

/**
 * Les visuels d'une créa : un gabarit, rendu dans les trois formats Meta,
 * enregistré dans les médias publicitaires, attaché à la créa.
 *
 * Le MÊME gabarit pour les trois formats, et par défaut pour toutes les créas
 * d'une génération : si deux angles partaient avec deux visuels différents, on
 * ne saurait plus lequel des deux a fait la différence. Changer de visuel est un
 * test à part (dimension « visuel »).
 *
 * Une créa passe « À valider » quand elle a ses visuels ET au moins un texte
 * principal et un titre passés ; sinon elle reste en brouillon.
 */

type Media = { id: number | string; url?: string | null; mimeType?: string | null; filename?: string | null };
type Fact = { statement: string; source: string };
type Creative = {
  id: number | string;
  angle: string;
  hook?: string | null;
  cta?: string | null;
  campaign?: { id: number | string; name?: string } | number | string | null;
  facts?: (Fact | number)[] | null;
  texts?: { kind: string; text: string; status: string }[] | null;
  status?: string | null;
};

export type FileLoader = (url: string) => Promise<{ data: Buffer; mime: string }>;

/** Charge un fichier servi par le CDN (ou, en local, par Payload). */
export const fetchFile: FileLoader = async (url) => {
  const abs = url.startsWith("/") ? `${(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001").replace(/\/$/, "")}${url}` : url;
  const res = await fetch(abs);
  if (!res.ok) throw new Error(`Fichier illisible (${res.status}) : ${url}`);
  return { data: Buffer.from(await res.arrayBuffer()), mime: res.headers.get("content-type") ?? "application/octet-stream" };
};

/** Le gabarit par défaut : le plus parlant parmi ceux dont on a la matière. Pure. */
export function pickTemplate(have: { capture: boolean; fact: boolean; photo: boolean }): TemplateKey {
  if (have.capture) return "capture";
  if (have.fact) return "chiffre";
  if (have.photo) return "photo";
  return "texte";
}

/** Un gabarit demandé explicitement doit avoir sa matière. Pure. */
export function templateAvailable(key: TemplateKey, have: { capture: boolean; fact: boolean; photo: boolean }): boolean {
  const needs = TEMPLATES.find((t) => t.key === key)?.needs;
  return needs == null || have[needs];
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "x";

async function latest(payload: Payload, kind: "capture" | "photo"): Promise<Media | null> {
  const where: Where = kind === "capture" ? { and: [{ kind: { equals: "capture" } }, { noClientData: { equals: true } }] } : { kind: { equals: "photo" } };
  const r = await payload.find({ collection: "ad-media", where, sort: "-createdAt", limit: 1, depth: 0, overrideAccess: true });
  return (r.docs[0] as Media | undefined) ?? null;
}

async function kitFonts(payload: Payload, load: FileLoader): Promise<FontSpec[]> {
  const kit = (await payload.findGlobal({ slug: "ads-brand-kit", depth: 1, overrideAccess: true })) as { fonts?: { role?: string; weight?: number; file?: Media | null }[] | null };
  const specs: FontSpec[] = [];
  for (const f of kit.fonts ?? []) {
    if (!f.file?.url) continue;
    const { data } = await load(f.file.url);
    specs.push({ name: f.role === "titre" ? "Titre" : "Texte", data, weight: (f.weight ?? 400) >= 600 ? 700 : 400, style: "normal" });
  }
  // Un rôle sans police déposée prend Lato : un gabarit n'échoue pas pour une police manquante.
  const fallback = await fallbackFonts();
  for (const role of ["Titre", "Texte"] as const) if (!specs.some((s) => s.name === role)) specs.push(...fallback.filter((s) => s.name === role));
  return specs;
}

const dataUri = async (m: Media | null | undefined, load: FileLoader) => {
  if (!m?.url) return null;
  const { data, mime } = await load(m.url);
  return toDataUri(data, m.mimeType ?? mime);
};

/** L'image en data URI ET ses dimensions : le gabarit cadre au plus juste. */
const imageOf = async (m: Media | null | undefined, load: FileLoader) => {
  if (!m?.url) return { image: null, imageSize: null };
  const { data, mime } = await load(m.url);
  const meta = await sharp(data).metadata();
  return {
    image: toDataUri(data, m.mimeType ?? mime),
    imageSize: meta.width && meta.height ? { width: meta.width, height: meta.height } : null,
  };
};

export async function renderCreativeVisuals(
  payload: Payload,
  creativeId: number | string,
  opts: { template?: TemplateKey; load?: FileLoader } = {},
): Promise<{ template: TemplateKey; assets: number; status: string }> {
  const load = opts.load ?? fetchFile;
  const [creative, appearance, kit, capture, photo] = await Promise.all([
    payload.findByID({ collection: "ad-creatives", id: creativeId, depth: 1, overrideAccess: true }) as Promise<Creative>,
    payload.findGlobal({ slug: "appearance", depth: 1, overrideAccess: true }).catch(() => null) as Promise<Record<string, unknown> | null>,
    payload.findGlobal({ slug: "ads-brand-kit", depth: 1, overrideAccess: true }) as Promise<{ logoOnDark?: Media | null }>,
    latest(payload, "capture"),
    latest(payload, "photo"),
  ]);

  const fact = (creative.facts ?? []).find((f): f is Fact => typeof f === "object" && f !== null) ?? null;
  const have = { capture: Boolean(capture), fact: Boolean(fact), photo: Boolean(photo) };
  const template = opts.template ?? pickTemplate(have);
  if (!templateAvailable(template, have)) throw new Error(`Le gabarit « ${template} » n'a pas sa matière (capture, fait ou photo manquant).`);

  const hook = creative.hook?.trim() || creative.texts?.find((t) => t.kind === "titre" && t.status === "ok")?.text || creative.angle;
  const input: VisualInput = {
    hook,
    cta: ctaLabel(creative.cta) ?? "En savoir plus",
    colors: brandColorsOf(appearance),
    logo: await dataUri(appearance?.companyLogo as Media | null, load),
    logoOnDark: await dataUri(kit.logoOnDark, load),
    ...(template === "capture" ? await imageOf(capture, load) : template === "photo" ? await imageOf(photo, load) : { image: null, imageSize: null }),
    fact: template === "chiffre" ? fact : null,
  };
  const fonts = await kitFonts(payload, load);

  const campaign = typeof creative.campaign === "object" && creative.campaign ? creative.campaign : null;
  const assets: { format: string; type: "image"; template: string; media: number | string }[] = [];
  for (const format of FORMAT_KEYS) {
    const jpeg = await renderVisual(template, format, input, fonts);
    const media = await payload.create({
      collection: "ad-media",
      data: { kind: "crea", alt: `${creative.angle} — ${format} — ${template}` },
      file: { data: jpeg, mimetype: "image/jpeg", name: `tim_${slug(campaign?.name ?? "campagne")}_${slug(creative.angle)}_${format}_${template}.jpg`, size: jpeg.length },
      overrideAccess: true,
    });
    assets.push({ format, type: "image", template, media: media.id });
  }

  // Publiable : textes ET visuels. Une créa déjà décidée ne revient pas en arrière.
  const undecided = creative.status === "brouillon" || creative.status === "a-valider" || !creative.status;
  const status = undecided ? (publishable(creative.texts ?? []) ? "a-valider" : "brouillon") : (creative.status as string);
  await payload.update({ collection: "ad-creatives", id: creativeId, data: { assets, status } as never, overrideAccess: true });
  return { template, assets: assets.length, status };
}
