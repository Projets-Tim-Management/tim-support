/**
 * Les formats des pubs Meta et ce qu'un fichier doit respecter pour y entrer
 * (plan Publicité) — la source unique : le brief les donne à Claude Design,
 * l'import les vérifie sur les fichiers finis.
 *
 * 9:16 : la zone sûre UNIFIÉE de Meta (mars 2026) pour Stories et Reels,
 * Facebook et Instagram — 14 % en haut, 35 % en bas, 6 % sur les côtés. Tout ce
 * qui compte (accroche, logo, bouton) reste dedans ; le reste peut être couvert
 * par l'interface de l'application.
 * 1:1 et 4:5 : fil d'actualité, une marge de 6 % tout autour — rien n'y est
 * recouvert, mais un texte collé au bord se lit mal.
 */
export type FormatKey = "1x1" | "4x5" | "9x16";

export type Format = {
  key: FormatKey;
  label: string;
  width: number;
  height: number;
  safe: { top: number; bottom: number; left: number; right: number };
};

const pct = (n: number, p: number) => Math.round((n * p) / 100);

export const FORMATS: Record<FormatKey, Format> = {
  "1x1": { key: "1x1", label: "Carré 1:1", width: 1080, height: 1080, safe: { top: pct(1080, 6), bottom: pct(1080, 6), left: pct(1080, 6), right: pct(1080, 6) } },
  "4x5": { key: "4x5", label: "Vertical 4:5", width: 1080, height: 1350, safe: { top: pct(1350, 6), bottom: pct(1350, 6), left: pct(1080, 6), right: pct(1080, 6) } },
  "9x16": { key: "9x16", label: "Plein écran 9:16", width: 1080, height: 1920, safe: { top: pct(1920, 14), bottom: pct(1920, 35), left: pct(1080, 6), right: pct(1080, 6) } },
};

export const FORMAT_KEYS: FormatKey[] = ["1x1", "4x5", "9x16"];

/** La zone où tout ce qui compte doit tenir. */
export const safeBox = (f: Format) => ({
  x: f.safe.left,
  y: f.safe.top,
  width: f.width - f.safe.left - f.safe.right,
  height: f.height - f.safe.top - f.safe.bottom,
});

/** Poids maximal d'une image chez Meta. */
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
/** Poids maximal d'une vidéo accepté à l'import (Meta va jusqu'à 4 Go ; au-delà de 500 Mo, c'est une erreur d'export). */
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
/** Durée d'une vidéo : la Base V1 vise 15 à 20 s ; Meta refuse en dessous d'une seconde. */
export const VIDEO_SECONDS = { min: 1, max: 60, target: [15, 20] as [number, number] };
/** Plus petit côté accepté (Meta : 500 px ; on vise 1080). */
export const MIN_SIDE = 500;

export const IMAGE_TYPES = ["image/png", "image/jpeg"] as const;
export const VIDEO_TYPES = ["video/mp4", "video/quicktime"] as const;

/** Tolérance sur les proportions : un export à 1080×1352 reste un 4:5. */
const RATIO_TOLERANCE = 0.02;

/** Le format d'un fichier d'après ses dimensions, ou null s'il n'en est aucun. Pure. */
export function formatOf(width: number, height: number): FormatKey | null {
  if (!(width > 0 && height > 0)) return null;
  const r = width / height;
  return FORMAT_KEYS.find((k) => Math.abs(r - FORMATS[k].width / FORMATS[k].height) / (FORMATS[k].width / FORMATS[k].height) <= RATIO_TOLERANCE) ?? null;
}

export type FileFacts = { mime: string; bytes: number; width: number; height: number; durationSec?: number | null };
export type SpecCheck = { ok: boolean; format: FormatKey | null; kind: "image" | "video" | null; problems: string[]; warnings: string[] };

/**
 * Ce que Meta refusera d'un fichier, et ce qui mérite un coup d'œil. `expected` :
 * le format annoncé (par le nom du fichier) — il doit correspondre aux dimensions. Pure.
 */
export function checkFile(f: FileFacts, expected?: FormatKey | null): SpecCheck {
  const problems: string[] = [];
  const warnings: string[] = [];
  const kind = (IMAGE_TYPES as readonly string[]).includes(f.mime) ? "image" : (VIDEO_TYPES as readonly string[]).includes(f.mime) ? "video" : null;
  if (!kind) problems.push(`Type de fichier non accepté (${f.mime || "inconnu"}) : PNG, JPEG, MP4 ou MOV.`);
  const format = formatOf(f.width, f.height);
  if (!format) problems.push(`Proportions ${f.width}×${f.height} : ni 1:1, ni 4:5, ni 9:16.`);
  else if (expected && format !== expected) problems.push(`Le nom annonce ${FORMATS[expected].label}, le fichier est en ${FORMATS[format].label}.`);
  if (Math.min(f.width, f.height) < MIN_SIDE) problems.push(`Trop petit (${f.width}×${f.height}) : au moins ${MIN_SIDE} px de côté.`);
  else if (format && f.width < FORMATS[format].width) warnings.push(`${f.width}×${f.height} : en dessous de ${FORMATS[format].width}×${FORMATS[format].height}, l'image sera moins nette.`);
  if (kind === "image" && f.bytes > MAX_IMAGE_BYTES) problems.push("Image de plus de 30 Mo.");
  if (kind === "video") {
    if (f.bytes > MAX_VIDEO_BYTES) problems.push("Vidéo de plus de 500 Mo.");
    const d = f.durationSec;
    if (d == null) warnings.push("Durée inconnue.");
    else if (d < VIDEO_SECONDS.min || d > VIDEO_SECONDS.max) problems.push(`Durée de ${Math.round(d)} s : entre ${VIDEO_SECONDS.min} et ${VIDEO_SECONDS.max} s.`);
    else if (d < VIDEO_SECONDS.target[0] || d > VIDEO_SECONDS.target[1] + 1) warnings.push(`Durée de ${Math.round(d)} s : la Base V1 vise ${VIDEO_SECONDS.target[0]} à ${VIDEO_SECONDS.target[1]} s.`);
  }
  return { ok: problems.length === 0, format, kind, problems, warnings };
}

/**
 * Ce que dit le nom d'un fichier exporté : le code de la créa et le format
 * (« C12-9x16.mp4 », « c12_4x5.png », « C12 1x1 v2.png »). Pure.
 */
export function parseFileName(name: string): { creative: number | null; format: FormatKey | null } {
  const base = name.toLowerCase();
  const c = /(?:^|[^a-z0-9])c(\d{1,7})(?=[^0-9]|$)/.exec(base);
  const f = /(1x1|4x5|9x16)/.exec(base.replace(/[:×]/g, "x"));
  return { creative: c ? Number(c[1]) : null, format: (f?.[1] as FormatKey) ?? null };
}
