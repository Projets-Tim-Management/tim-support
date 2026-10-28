import { slugify } from "@/core/lib/slug";
import type { LoopFormat } from "@/core/lib/video-loop";

/**
 * Le nom d'un visuel de feature, tiré de la feature elle-même :
 * « pointer-plusieurs-cdc-partie-2-mobile-k3f9a.mp4 ».
 *
 * Les captures arrivaient sous leur nom d'origine (« RPReplay_Final1698….mp4 »,
 * « Enregistrement de l'écran 2026-10-26 à 14.02.11.mov ») : impossible, dans la
 * médiathèque, de savoir à quoi un fichier servait sans l'ouvrir.
 *
 * La courte marque finale n'est pas décorative. Un fichier déposé sous un nom
 * DÉJÀ pris REMPLACE l'ancien à la même adresse (voir /api/media/enregistrer) :
 * le CDN et les navigateurs, qui gardent les médias en cache, continueraient
 * alors de montrer l'ancienne capture. Une adresse neuve à chaque dépôt l'évite.
 *
 * Module pur : testé, et lu par le champ de dépôt.
 */

const slug = (s: string): string => slugify(s, { max: 60, fallback: "" });

/** Où se trouve le champ dans la fiche : « doc.1.mediaDoc.0.image » → partie 2. */
export function mediaPlace(path: string): string {
  const part = /(?:^|\.)doc\.(\d+)\.mediaDoc\.(\d+)/.exec(path);
  if (part) {
    const n = Number(part[1]) + 1;
    const m = Number(part[2]);
    // Plusieurs médias dans une même partie : on les distingue, le premier garde le nom court.
    return `partie-${n}${m > 0 ? `-media-${m + 1}` : ""}`;
  }
  if (/(?:^|\.)thumbnail$/.test(path)) return "vignette";
  return "visuel";
}

export function featureMediaName(args: {
  /** Slug de la feature, à défaut son titre. */
  slug?: string | null;
  title?: string | null;
  path: string;
  /** Extension de sortie, sans le point. */
  ext: string;
  /** Format de la capture, quand on le connaît (vidéo convertie). */
  format?: LoopFormat | null;
  /** Rang dans un dépôt multiple (galerie), à partir de 1. */
  index?: number | null;
  now?: number;
}): string {
  const base = slug(args.slug || "") || slug(args.title || "") || "feature";
  const stamp = (args.now ?? Date.now()).toString(36).slice(-5);
  const parts = [
    base,
    mediaPlace(args.path),
    args.index && args.index > 1 ? String(args.index) : null,
    args.format ?? null,
    stamp,
  ].filter(Boolean);
  const ext = args.ext.replace(/^\./, "").toLowerCase() || "bin";
  return `${parts.join("-")}.${ext}`;
}

/** L'extension d'un nom de fichier, sans le point ; vide s'il n'en a pas. */
export const extOf = (name: string): string => /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";
