import type { LogoParts } from "@/modules/ads/video/logo";
import { parseLogoDocument } from "@/modules/ads/video/logo";

/**
 * Le logo animable lu côté serveur, au rendu (plan Publicité, §9 sexies, L) :
 * le SVG du Kit de marque, téléchargé puis découpé avec jsdom. Un fichier
 * absent, illisible ou qui n'est pas un SVG ne bloque jamais une vidéo : le
 * logo est alors posé (l'image), comme avant.
 */
export async function loadAnimatedLogo(media: unknown, fetcher: typeof fetch = fetch): Promise<LogoParts | null> {
  const m = media && typeof media === "object" ? (media as { url?: string | null; mimeType?: string | null; filename?: string | null }) : null;
  if (!m?.url) return null;
  if (!(m.mimeType?.includes("svg") || m.filename?.toLowerCase().endsWith(".svg"))) return null;
  try {
    const res = await fetcher(m.url);
    if (!res.ok) return null;
    const { JSDOM } = await import("jsdom");
    const parsed = parseLogoDocument(new JSDOM(await res.text(), { contentType: "image/svg+xml" }).window.document);
    return parsed.ok ? parsed.logo : null;
  } catch {
    return null;
  }
}
