import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";

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

const BASE = process.env.INSEE_API_BASE || "https://api.insee.fr/api-sirene/3.11";
const KEY = process.env.INSEE_API_KEY;
const KEY_HEADER = process.env.INSEE_API_KEY_HEADER || "X-INSEE-Api-Key-Integration";

type InseeAddress = {
  numeroVoieEtablissement?: string;
  typeVoieEtablissement?: string;
  libelleVoieEtablissement?: string;
  codePostalEtablissement?: string;
  libelleCommuneEtablissement?: string;
};
type InseeUnite = {
  denominationUniteLegale?: string;
  nomUniteLegale?: string;
  prenom1UniteLegale?: string;
};
type InseeEtab = {
  siret?: string;
  siren?: string;
  uniteLegale?: InseeUnite;
  adresseEtablissement?: InseeAddress;
};

function normalize(e: InseeEtab) {
  const u = e.uniteLegale ?? {};
  const a = e.adresseEtablissement ?? {};
  const denomination =
    u.denominationUniteLegale ||
    [u.prenom1UniteLegale, u.nomUniteLegale].filter(Boolean).join(" ") ||
    "—";
  const voie = [a.numeroVoieEtablissement, a.typeVoieEtablissement, a.libelleVoieEtablissement]
    .filter(Boolean)
    .join(" ");
  const ville = [a.codePostalEtablissement, a.libelleCommuneEtablissement].filter(Boolean).join(" ");
  const adresse = [voie, ville].filter(Boolean).join(", ");
  return {
    siret: e.siret ?? null,
    siren: e.siren ?? e.siret?.slice(0, 9) ?? null,
    denomination,
    adresse,
    codePostal: a.codePostalEtablissement ?? null,
    ville: a.libelleCommuneEtablissement ?? null,
  };
}

/** Construit la requête INSEE selon la saisie (SIRET / SIREN / dénomination). */
function buildUrl(q: string): string {
  const digits = q.replace(/\s/g, "");
  if (/^\d{14}$/.test(digits)) return `${BASE}/siret/${digits}`;
  if (/^\d{9}$/.test(digits)) {
    return `${BASE}/siret?q=${encodeURIComponent(`siren:${digits} AND etablissementSiege:true`)}&nombre=10`;
  }
  // Recherche par dénomination : un seul mot → préfixe (wildcard) ; plusieurs
  // mots → phrase exacte (l'INSEE n'est pas un moteur de recherche "fuzzy").
  const name = q.toUpperCase().replace(/["\\()]/g, " ").trim();
  const tokens = name.split(/\s+/).filter(Boolean);
  const term = tokens.length > 1 ? `"${name}"` : `${name}*`;
  return `${BASE}/siret?q=${encodeURIComponent(
    `denominationUniteLegale:${term} AND etablissementSiege:true`,
  )}&nombre=10`;
}

export async function GET(req: Request) {
  // Réservé aux utilisateurs connectés du back-office.
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!KEY) {
    return NextResponse.json(
      { error: "insee_not_configured", message: "Clé API INSEE absente (voir INSEE_API_KEY)." },
      { status: 501 },
    );
  }

  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length < 3) return NextResponse.json({ results: [] });

  try {
    const res = await fetch(buildUrl(q), {
      headers: { [KEY_HEADER]: KEY, Accept: "application/json" },
    });
    if (res.status === 404) return NextResponse.json({ results: [] });
    if (!res.ok) {
      return NextResponse.json({ error: "insee_error", status: res.status }, { status: 502 });
    }
    const data = (await res.json()) as { etablissements?: InseeEtab[]; etablissement?: InseeEtab };
    const list = data.etablissements ?? (data.etablissement ? [data.etablissement] : []);
    return NextResponse.json({ results: list.map(normalize) });
  } catch {
    return NextResponse.json({ error: "insee_unreachable" }, { status: 502 });
  }
}
