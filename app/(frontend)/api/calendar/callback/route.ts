import { NextResponse } from "next/server";

import { readState } from "@/core/lib/secrets";
import { payloadClient } from "@/core/payload-client";
import { getProvider, redirectUri, tokenFields } from "@/modules/marketing/lib/calendar";

/**
 * GET /api/calendar/callback — retour du consentement.
 *
 * Le `state` signé est la seule preuve d'identité de la demande : sans lui, cet
 * endpoint public accepterait n'importe quel code et rattacherait un agenda
 * arbitraire à une fiche arbitraire. Il est vérifié AVANT tout échange.
 *
 * On termine toujours par une redirection vers la fiche partenaire, avec un
 * message en query : l'utilisateur revient là d'où il est parti.
 */
const back = (partnerId: string | undefined, status: string, detail?: string) => {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001").replace(/\/$/, "");
  const target = partnerId
    ? `${base}/admin/collections/partners/${partnerId}`
    : `${base}/admin/collections/partners`;
  const params = new URLSearchParams({ calendar: status, ...(detail ? { detail } : {}) });
  return NextResponse.redirect(`${target}?${params.toString()}`);
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = readState<{ partnerId?: string; provider?: string }>(url.searchParams.get("state"));

  // Refus explicite de l'utilisateur chez le fournisseur.
  if (url.searchParams.get("error")) {
    return back(state?.partnerId, "refused", url.searchParams.get("error") ?? undefined);
  }
  if (!state?.partnerId || !code) return back(state?.partnerId, "invalid_state");

  const provider = getProvider(state.provider);
  if (!provider) return back(state.partnerId, "invalid_state");

  const payload = await payloadClient();

  try {
    const tokens = await provider.exchangeCode(code, redirectUri());
    const calendars = await provider.listCalendars(tokens.accessToken).catch(() => []);

    // Une connexion par (partenaire, compte) : reconnecter le même compte met à
    // jour les jetons au lieu d'empiler des doublons.
    const existing = await payload.find({
      collection: "calendar-connections",
      where: {
        partner: { equals: Number(state.partnerId) },
        provider: { equals: provider.id },
        ...(tokens.accountEmail ? { accountEmail: { equals: tokens.accountEmail } } : {}),
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const previous = existing.docs[0] as { id: number | string; refreshToken?: string } | undefined;

    // Le premier agenda connecté reçoit les rendez-vous par défaut : sans cible,
    // aucun événement ne serait créé et le partenaire ne comprendrait pas pourquoi.
    const isFirst = !previous;
    const rows = calendars.map((c, i) => ({
      calendarId: c.id,
      name: c.name,
      busy: true,
      target: isFirst && (c.primary || i === 0),
    }));

    const identity = {
      partner: Number(state.partnerId),
      provider: provider.id,
      ...tokenFields(tokens, previous?.refreshToken),
    };

    if (previous) {
      // Les agendas déjà paramétrés ne sont PAS réécrits : le partenaire a pu
      // choisir lesquels comptent, une reconnexion ne doit pas l'annuler.
      await payload.update({
        collection: "calendar-connections",
        id: previous.id,
        data: identity,
        overrideAccess: true,
      });
    } else {
      await payload.create({
        collection: "calendar-connections",
        data: { ...identity, calendars: rows },
        overrideAccess: true,
      });
    }

    return back(state.partnerId, "connected");
  } catch (err) {
    payload.logger.error(`[agenda] connexion ${provider.id} échouée : ${err}`);
    return back(state.partnerId, "error", err instanceof Error ? err.message : undefined);
  }
}
