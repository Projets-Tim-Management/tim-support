import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { corsHeaders } from "@/modules/forms/lib/cors";
import { toPublicForm } from "@/modules/forms/lib/public-schema";

/**
 * GET /api/forms/<formId> — le schéma que le site vitrine rend.
 *
 * Cache COURT à dessein : corriger un libellé doit rester un geste de
 * back-office. Une heure — le réglage naturel pour une ressource qui bouge peu —
 * aurait annulé le bénéfice sans que ce soit visible.
 *
 * Lecture publique assumée : ce schéma décrit un formulaire déjà affiché sur un
 * site public, il ne contient aucune donnée de personne.
 */

/**
 * Une minute au CDN, puis deux minutes de tolérance pendant la relecture.
 *
 * La vitrine ajoute sa propre revalidation d'une minute : la fraîcheur réelle
 * est la somme des deux. Cinq minutes de tolérance portaient le pire cas à six
 * minutes — trop long pour une correction de libellé qu'on vient de faire et
 * qu'on recharge pour la voir.
 */
const CACHE = "public, max-age=0, s-maxage=60, stale-while-revalidate=120";

export async function GET(req: Request, { params }: { params: Promise<{ formId: string }> }) {
  const cors = corsHeaders(req.headers.get("origin"));
  const formId = (await params).formId?.trim();

  if (!formId) {
    return NextResponse.json({ error: "unknown_form" }, { status: 404, headers: cors });
  }

  try {
    const payload = await payloadClient();
    const res = await payload.find({
      collection: "forms",
      where: { formId: { equals: formId } },
      limit: 1,
      depth: 0,
      // Le schéma est public ; la collection, elle, est réservée aux admins.
      overrideAccess: true,
    });

    // 404 franc plutôt qu'un schéma vide : un formulaire sans question
    // s'afficherait comme un bouton d'envoi solitaire, que rien ne signalerait.
    const form = toPublicForm(res.docs[0] as Parameters<typeof toPublicForm>[0]);
    if (!form) {
      return NextResponse.json({ error: "unknown_form" }, { status: 404, headers: cors });
    }

    return NextResponse.json(form, {
      status: 200,
      headers: { ...cors, "Cache-Control": CACHE },
    });
  } catch (err) {
    // Ne jamais mettre une panne en cache : le site rejouerait l'échec pendant
    // toute la durée du cache, bien après que la base soit revenue.
    console.error(`[formulaires] lecture du schéma « ${formId} » échouée :`, err);
    return NextResponse.json(
      { error: "server_error" },
      { status: 503, headers: { ...cors, "Cache-Control": "no-store" } },
    );
  }
}

/** Pré-vol CORS, pour un `fetch` depuis une page du site vitrine. */
export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}
