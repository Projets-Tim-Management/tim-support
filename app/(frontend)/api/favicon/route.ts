import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";

/**
 * Le favicon du back-office : l'« icône seule » réglée dans Apparence, à
 * défaut celle livrée avec le code.
 *
 * L'admin est rendu par Payload avec des métadonnées STATIQUES : on ne peut
 * pas y mettre une image choisie en base. On y met donc cette route, qui
 * redirige vers l'image du moment — changer l'icône dans Apparence change
 * l'onglet du navigateur, sans déploiement.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  let url = "/favicon.png";
  try {
    const payload = await payloadClient();
    const appearance = (await payload.findGlobal({ slug: "appearance", depth: 1, overrideAccess: true })) as {
      icon?: { url?: string | null } | null;
    };
    if (appearance?.icon?.url) url = appearance.icon.url;
  } catch {
    /* l'icône livrée avec le code */
  }
  // Les navigateurs gardent un favicon longtemps de toute façon ; on ne rajoute
  // pas de cache par-dessus, pour que le changement finisse par se voir.
  return NextResponse.redirect(new URL(url, process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"), {
    status: 302,
    headers: { "Cache-Control": "no-cache" },
  });
}
