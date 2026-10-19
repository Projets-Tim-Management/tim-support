import { FORMAT_KEYS, type FormatKey } from "@/modules/ads/lib/meta-specs";

/**
 * Les fichiers finis d'une créa (plan Publicité, 19/10/2026) : ce que le brief
 * demande, ce qui a été importé, et ce qu'il manque pour valider. Pure.
 */

export const BRIEF_KINDS = [
  { label: "Une vidéo", value: "video" },
  { label: "Un visuel fixe", value: "image" },
  { label: "Vidéo et visuel fixe", value: "les-deux" },
] as const;
export type BriefKind = (typeof BRIEF_KINDS)[number]["value"];
export type FileKind = "image" | "video";

export type CreativeFile = {
  format: FormatKey | string;
  kind: FileKind | string;
  url: string;
  filename?: string | null;
  pathname?: string | null;
  mime?: string | null;
  bytes?: number | null;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
  warnings?: string[] | null;
  importedAt?: string | null;
};

type WithBrief = { brief?: { kind?: string | null; formats?: string[] | null } | null; files?: CreativeFile[] | null };

/** Les formats attendus : ceux du brief, sinon les trois. Pure. */
export const expectedFormats = (c: WithBrief): FormatKey[] => {
  const asked = (c.brief?.formats ?? []).filter((f): f is FormatKey => (FORMAT_KEYS as string[]).includes(f));
  return asked.length ? asked : FORMAT_KEYS;
};

/** Les natures attendues : une vidéo, un visuel fixe, ou les deux (une vidéo par défaut). Pure. */
export const expectedKinds = (c: WithBrief): FileKind[] => {
  const k = c.brief?.kind;
  return k === "image" ? ["image"] : k === "les-deux" ? ["video", "image"] : ["video"];
};

/** Ce qu'il manque pour qu'une créa parte : « 9:16 vidéo », « 1:1 image »… Pure. */
export function missingFiles(c: WithBrief): string[] {
  const have = new Set((c.files ?? []).map((f) => `${f.format}|${f.kind}`));
  const out: string[] = [];
  for (const kind of expectedKinds(c)) for (const format of expectedFormats(c)) if (!have.has(`${format}|${kind}`)) out.push(`${format.replace("x", ":")} ${kind === "video" ? "vidéo" : "image"}`);
  return out;
}

/** Les fichiers après un import : le nouveau remplace celui du même format et de la même nature. Pure. */
export function withImported(files: CreativeFile[] | null | undefined, added: CreativeFile): { files: CreativeFile[]; replaced: CreativeFile | null } {
  const list = files ?? [];
  const replaced = list.find((f) => f.format === added.format && f.kind === added.kind) ?? null;
  return { files: [...list.filter((f) => f !== replaced), added], replaced };
}

/* ─── Le dépôt des fichiers finis sur le stockage ────────────────────────── */

/** Le dossier des fichiers d'une créa, à part des rushes : « ads/creas/12/ ». */
export const creaPrefix = (creative: number | string) => `ads/creas/${String(creative).replace(/[^0-9]/g, "")}/`;

/** Le nom sur le stockage : « ads/creas/12/C12-9x16.mp4 » (le stockage ajoute un suffixe aléatoire). Pure. */
export function creaPathname(creative: number | string, format: string, filename: string): string {
  const ext = (/\.([a-z0-9]{2,4})$/i.exec(filename)?.[1] ?? "bin").toLowerCase();
  return `${creaPrefix(creative)}C${String(creative).replace(/[^0-9]/g, "")}-${format.replace(/[^0-9x]/g, "")}.${ext}`;
}

/** Un chemin que le jeton de dépôt accepte pour CETTE créa, sans remontée. Pure. */
export const isCreaPathname = (creative: number | string, p: string): boolean => p.startsWith(creaPrefix(creative)) && !p.includes("..") && p.length < 200;

/** L'adresse vient-elle de notre stockage, dans le dossier de CETTE créa ? Pure. */
export function isCreaBlobUrl(creative: number | string, url: unknown): boolean {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".public.blob.vercel-storage.com") && u.pathname.startsWith(`/${creaPrefix(creative)}`);
  } catch {
    return false;
  }
}
