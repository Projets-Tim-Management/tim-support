import { readFile } from "node:fs/promises";
import { join } from "node:path";

import satori from "satori";
import sharp from "sharp";

import { FORMATS, MAX_IMAGE_BYTES, type FormatKey } from "@/modules/ads/lib/render/formats";
import { renderTemplate, type TemplateKey, type VisualInput } from "@/modules/ads/lib/render/templates";

/**
 * Rendu d'un visuel : gabarit → SVG (Satori) → JPEG sRGB (sharp).
 *
 * Environ une seconde par image, dans la fonction, sans navigateur ni service
 * externe. Chaque rendu est VÉRIFIÉ : dimensions exactes du format, poids sous
 * la limite de Meta. Un visuel hors normes lève une erreur au lieu de partir
 * dans une créa.
 */

export type FontSpec = { name: "Titre" | "Texte"; data: Buffer | ArrayBuffer; weight: 400 | 700; style: "normal" };

/** Lato (la police du contrat, déjà embarquée dans les fonctions) : le repli tant que le kit n'a pas ses polices. */
export async function fallbackFonts(): Promise<FontSpec[]> {
  const dir = join(process.cwd(), "assets", "fonts", "contract");
  const [regular, bold] = await Promise.all([readFile(join(dir, "Lato-Regular.ttf")), readFile(join(dir, "Lato-Bold.ttf"))]);
  return [
    { name: "Titre", data: bold, weight: 700, style: "normal" },
    { name: "Texte", data: regular, weight: 400, style: "normal" },
    { name: "Texte", data: bold, weight: 700, style: "normal" },
  ];
}

export async function renderVisual(template: TemplateKey, format: FormatKey, input: VisualInput, fonts: FontSpec[]): Promise<Buffer> {
  const f = FORMATS[format];
  const svg = await satori(renderTemplate(template, f, input), { width: f.width, height: f.height, fonts });
  const jpeg = await sharp(Buffer.from(svg)).flatten({ background: "#ffffff" }).toColorspace("srgb").jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
  const meta = await sharp(jpeg).metadata();
  if (meta.width !== f.width || meta.height !== f.height) {
    throw new Error(`Visuel ${template} ${format} : ${meta.width}×${meta.height} au lieu de ${f.width}×${f.height}.`);
  }
  if (jpeg.length > MAX_IMAGE_BYTES) throw new Error(`Visuel ${template} ${format} : ${jpeg.length} octets, au-delà de la limite de Meta.`);
  return jpeg;
}

/** Un fichier en data URI, pour que le rendu n'aille rien chercher sur le réseau. */
export const toDataUri = (data: Buffer | ArrayBuffer, mime: string): string => `data:${mime};base64,${Buffer.from(data as ArrayBuffer).toString("base64")}`;
