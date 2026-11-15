import { NextResponse } from "next/server";
import type { Payload } from "payload";

import { isDirection } from "@/core/access";
import { adminRequest } from "@/modules/ads/lib/route-auth";

/**
 * « Le faire maintenant » depuis une fiche d'agent (POST, direction seule) : un seul gabarit pour les routes du bureau
 * commercial et de Lou (relecture du 15/11/2026, elles étaient recopiées). En pause ou déjà en cours : 409 ; échec
 * après avoir travaillé : 502 ; sinon le résultat. `dynamic` et `maxDuration` restent écrits dans chaque route : Next
 * les lit dans le fichier.
 */
export function runNowRoute(run: (payload: Payload) => Promise<{ status: string; message?: string }>, what: string) {
  return async function POST(req: Request) {
    const auth = await adminRequest(req, isDirection, "reserve-direction");
    if ("response" in auth) return auth.response;
    const r = await run(auth.payload);
    if (r.status === "pause" || r.status === "deja-fait" || r.status === "deja-faite") return NextResponse.json({ error: r.message }, { status: 409 });
    if (r.status === "echec") return NextResponse.json({ error: `${what} n'a pas abouti : ${r.message ?? "incident technique"}.` }, { status: 502 });
    return NextResponse.json(r);
  };
}
