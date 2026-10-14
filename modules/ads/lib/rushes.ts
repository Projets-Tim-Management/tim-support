/**
 * Les rushes de la publicité (plan Publicité, §9 sexies) : la matière première
 * — vidéos et images de l'app, du chantier, du bureau — que les agents
 * retravaillent en motion design. Ici, les règles pures : ce qui s'importe,
 * où le fichier est rangé, ce qu'une fiche doit dire avant d'être utilisable.
 *
 * Le fichier d'origine n'est JAMAIS modifié : la conversion produit à côté une
 * version de travail, une vignette et des images clés.
 */

export const RUSH_SOURCES = [
  { label: "Écran de l'app mobile", value: "app-mobile" },
  { label: "Écran de l'app web", value: "app-web" },
  { label: "Chantier", value: "chantier" },
  { label: "Bureau / équipe", value: "bureau" },
  { label: "Autre", value: "autre" },
] as const;
export type RushSource = (typeof RUSH_SOURCES)[number]["value"];

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

export const RUSH_STATUSES = [
  { label: "En attente de conversion", value: "en-attente" },
  { label: "Conversion en cours", value: "en-cours" },
  { label: "Prêt", value: "pret" },
  { label: "Échec", value: "echec" },
] as const;
export type RushStatus = (typeof RUSH_STATUSES)[number]["value"];

/**
 * Ce qui s'importe. Les MOV de l'iPhone (HEVC compris) entrent tels quels : la
 * conversion les ramène au format de travail commun.
 */
export const RUSH_CONTENT_TYPES = ["video/mp4", "video/quicktime", "video/x-m4v", "image/png", "image/jpeg", "image/webp"] as const;

/** 500 Mo : une minute de 4K iPhone tient dedans ; au-delà, c'est un film, pas un rush. */
export const RUSH_MAX_BYTES = 500 * 1024 * 1024;

/** Le dossier des rushes sur le stockage, à part des créas rendues. */
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
 * navigateur ; la conversion ira la chercher — on n'accepte que le stockage
 * public de Vercel Blob et le dossier des rushes. Pure.
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

/**
 * Où en est un rush, en une étiquette et une couleur (liste et fiche) : la
 * conversion et la description de l'IA réunies, parce que c'est la question
 * qu'on se pose — « est-ce que les agents peuvent s'en servir ? ». Pure.
 *
 * - gris : en attente, ou description écartée (l'agent lit seulement celle de Charlie) ;
 * - bleu : conversion en cours ;
 * - orange : une action de Charlie est attendue (description à valider ou à proposer) ;
 * - vert : prêt, description validée — l'agent lit tout ;
 * - rouge : échec, la raison est sur la fiche.
 */
export type RushTone = "gris" | "bleu" | "orange" | "vert" | "rouge";
export type RushStage = { key: string; label: string; tone: RushTone };

export function rushStage(doc: { processing?: { status?: string | null } | null; ai?: { status?: string | null; proposal?: string | null } | null } | null | undefined): RushStage {
  const status = doc?.processing?.status ?? "en-attente";
  if (status === "en-cours") return { key: "conversion", label: "Conversion en cours", tone: "bleu" };
  if (status === "echec") return { key: "echec", label: "Échec — voir la fiche", tone: "rouge" };
  if (status !== "pret") return { key: "attente", label: "En attente de conversion", tone: "gris" };
  const ai = doc?.ai?.status;
  if (ai === "validee") return { key: "valide", label: "Prêt — lu par les agents", tone: "vert" };
  if (ai === "ecartee") return { key: "ecarte", label: "Prêt — description IA écartée", tone: "gris" };
  if (doc?.ai?.proposal) return { key: "a-valider", label: "Description à valider", tone: "orange" };
  return { key: "a-proposer", label: "Description à proposer", tone: "orange" };
}
