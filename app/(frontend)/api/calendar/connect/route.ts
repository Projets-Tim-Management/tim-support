import { NextResponse } from "next/server";

import { hasAdminRole, isPartnerMetier, partnerIdOf } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { signState } from "@/core/lib/secrets";
import { getProvider, providerConfigured, redirectUri } from "@/modules/marketing/lib/calendar";

/**
 * GET /api/calendar/connect?provider=google|microsoft&partnerId=…
 * → redirige vers l'écran de consentement du fournisseur.
 *
 * Le `partnerId` demandé est VÉRIFIÉ contre l'utilisateur connecté : un
 * partenaire ne peut connecter un agenda que sur SA fiche, un admin sur
 * n'importe laquelle. Sans ce contrôle, l'URL suffirait à rattacher son propre
 * agenda à la fiche d'un autre.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const providerId = url.searchParams.get("provider");
  const partnerId = url.searchParams.get("partnerId");

  const provider = getProvider(providerId);
  if (!provider || !partnerId) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!providerConfigured(provider.id)) {
    return NextResponse.json({ error: "provider_not_configured", provider: provider.id }, { status: 501 });
  }

  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const own = partnerIdOf(user);
  const allowed = hasAdminRole(user) || (isPartnerMetier(user) && String(own) === String(partnerId));
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // State signé et daté (10 min) : il porte l'identité de la demande jusqu'au retour.
  const state = signState({ partnerId, provider: provider.id });
  return NextResponse.redirect(provider.authUrl(state, redirectUri()));
}
