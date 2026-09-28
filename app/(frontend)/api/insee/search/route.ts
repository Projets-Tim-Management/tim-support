import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { inseeSearch, isInseeConfigured } from "@/modules/partner/lib/insee";

/**
 * Proxy serveur vers l'API Sirene de l'INSEE (portail-api.insee.fr, v3.11).
 *
 * Pourquoi un proxy : la clé API INSEE reste côté serveur (jamais exposée au
 * navigateur), on évite les soucis CORS, et on réserve l'accès aux utilisateurs
 * connectés du back-office (pas d'usage anonyme de notre quota — 30 req/min).
 *
 * Config via .env.local :
 *   INSEE_API_KEY          = clé de l'application (obligatoire)
 *   INSEE_API_BASE         = base URL (défaut api-sirene 3.11)
 *   INSEE_API_KEY_HEADER   = nom du header de clé (défaut X-INSEE-Api-Key-Integration)
 *
 * GET /api/insee/search?q=<raison sociale | SIREN(9) | SIRET(14)>
 *   → { results: [{ siret, siren, denomination, adresse, codePostal, ville }] }
 */

export async function GET(req: Request) {
  // Réservé aux utilisateurs connectés du back-office.
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isInseeConfigured()) {
    return NextResponse.json(
      { error: "insee_not_configured", message: "Clé API INSEE absente (voir INSEE_API_KEY)." },
      { status: 501 },
    );
  }

  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length < 3) return NextResponse.json({ results: [] });

  // Recherche partagée avec l'espace client (voir lib/insee).
  const results = await inseeSearch(q);
  if (!results) return NextResponse.json({ error: "insee_unreachable" }, { status: 502 });
  return NextResponse.json({ results });
}
