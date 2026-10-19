/**
 * Les rushes de la publicité (plan Publicité) : les enregistrements d'écran de
 * l'app, et les images de chantier ou de bureau, que l'agent désigne dans ses
 * briefs et que Charlie joint dans Claude Design (décision du 19/10/2026). Ici,
 * les règles pures : ce qui s'importe, où le fichier est rangé.
 *
 * Le fichier d'origine est conservé tel quel : c'est lui qu'on télécharge.
 */

export const RUSH_SOURCES = [
  { label: "Écran de l'app mobile", value: "app-mobile" },
  { label: "Écran de l'app web", value: "app-web" },
  { label: "Chantier", value: "chantier" },
  { label: "Bureau / équipe", value: "bureau" },
  { label: "Autre", value: "autre" },
] as const;

/** Ce qu'un rush montre du logiciel : la clé par laquelle un agent le retrouve. */
export const RUSH_FEATURES = [
  { label: "Pointage", value: "pointage" },
  { label: "Planning", value: "planning" },
  { label: "Feuilles d'heures", value: "feuilles-heures" },
  { label: "Congés et absences", value: "conges" },
  { label: "Suivi de chantier", value: "suivi-chantier" },
  { label: "Véhicules et matériel", value: "vehicules" },
  { label: "Documents", value: "documents" },
  { label: "Paie et export", value: "paie" },
  { label: "Autre", value: "autre" },
] as const;

/** Ce qui s'importe. Les MOV de l'iPhone (HEVC compris) entrent tels quels. */
export const RUSH_CONTENT_TYPES = ["video/mp4", "video/quicktime", "video/x-m4v", "image/png", "image/jpeg", "image/webp"] as const;

/** 500 Mo : une minute de 4K iPhone tient dedans ; au-delà, c'est un film, pas un rush. */
export const RUSH_MAX_BYTES = 500 * 1024 * 1024;

/** Le dossier des rushes sur le stockage, à part des fichiers des créas. */
export const RUSH_PREFIX = "ads/rushes/";

export const isAppSource = (s: unknown): boolean => s === "app-mobile" || s === "app-web";

export const mediaTypeOf = (contentType: unknown): "video" | "image" | null =>
  typeof contentType !== "string" ? null : contentType.startsWith("video/") ? "video" : contentType.startsWith("image/") ? "image" : null;

/** Le refus d'un fichier AVANT l'envoi (type, taille), ou `null`. Pure. */
export function rushRefusal(file: { type: string; size: number }): string | null {
  if (!(RUSH_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    return `Format non pris en charge (${file.type || "inconnu"}) : vidéos MP4 ou MOV, images PNG, JPEG ou WebP.`;
  }
  if (file.size > RUSH_MAX_BYTES) return `Fichier trop lourd : ${Math.round(file.size / 1024 / 1024)} Mo, pour 500 Mo au plus.`;
  return null;
}

/**
 * Le nom sur le stockage : le dossier des rushes, puis le nom du fichier
 * réduit à des caractères sûrs (« Pointage Été.MOV » → « pointage-ete.mov »).
 * Le stockage ajoute un suffixe aléatoire : deux rushes au même nom ne
 * s'écrasent jamais. Pure.
 */
export function rushPathname(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const ext = dot > 0 ? filename.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const base = (dot > 0 ? filename.slice(0, dot) : filename)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${RUSH_PREFIX}${base || "rush"}${ext ? `.${ext}` : ""}`;
}

/** Un chemin que le jeton de dépôt accepte : dans le dossier des rushes, sans remontée. Pure. */
export const isRushPathname = (p: string): boolean => p.startsWith(RUSH_PREFIX) && !p.includes("..") && p.length < 200;

/**
 * L'adresse vient-elle de NOTRE stockage ? La fiche reçoit l'adresse du
 * navigateur : on n'accepte que le stockage public de Vercel Blob et le
 * dossier des rushes. Pure.
 */
export function isRushBlobUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".public.blob.vercel-storage.com") && u.pathname.startsWith(`/${RUSH_PREFIX}`);
  } catch {
    return false;
  }
}
