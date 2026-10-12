import type { Payload } from "payload";

import type { AnnounceTexts } from "@/modules/dev/lib/announce-email";

/**
 * Les réglages de l'e-mail « C'est disponible » (global `dev-announce-email`).
 *
 * Silencieux par construction : une lecture qui échoue (table absente avant la
 * migration, base indisponible) renvoie « rien de repris », et le message part
 * avec ses textes d'origine — jamais bloqué par un réglage facultatif.
 */
export async function readAnnounceSettings(
  payload: Payload,
): Promise<{ texts: AnnounceTexts | null; heroImageUrl: string | null }> {
  try {
    const g = (await payload.findGlobal({ slug: "dev-announce-email", depth: 1, overrideAccess: true })) as
      | (AnnounceTexts & { image?: { url?: string | null } | number | null })
      | null;
    const url = g?.image && typeof g.image === "object" ? (g.image.url ?? "").trim() : "";
    // Une URL relative ne s'affiche pas dans une messagerie : mieux vaut la
    // fusée par défaut qu'un cadre cassé.
    return { texts: g ?? null, heroImageUrl: url.startsWith("http") ? url : null };
  } catch {
    return { texts: null, heroImageUrl: null };
  }
}
