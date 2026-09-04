import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { readState } from "@/core/lib/secrets";
import { exchangeMailboxCode } from "@/modules/partner/lib/mailbox/gmail-auth";

/**
 * Retour de Google après consentement.
 *
 * Une connexion est identifiée par L'ADRESSE du compte, pas par la personne :
 * reconnecter la même boîte doit remplacer les jetons existants, sans créer une
 * seconde ligne qui lirait la même boîte deux fois.
 */
export const dynamic = "force-dynamic";

const ADMIN = "/admin/collections/mailbox-connections";

const back = (base: string, params: Record<string, string>) =>
  NextResponse.redirect(`${base}${ADMIN}?${new URLSearchParams(params).toString()}`);

export async function GET(req: Request) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001").replace(/\/$/, "");
  const url = new URL(req.url);

  // Refus de l'utilisateur sur l'écran Google : ce n'est pas une erreur.
  if (url.searchParams.get("error")) return back(base, { mailbox: "annule" });

  const code = url.searchParams.get("code");
  const state = readState<{ userId?: string | number; since?: string }>(url.searchParams.get("state"));
  if (!code || !state?.userId) return back(base, { mailbox: "etat_invalide" });

  try {
    const tokens = await exchangeMailboxCode(code);
    const email = tokens.accountEmail?.trim().toLowerCase();
    if (!email) return back(base, { mailbox: "compte_inconnu" });

    /**
     * Sans refresh token, la connexion meurt dans l'heure sans rien dire. Mieux
     * vaut refuser tout de suite : Google ne le renvoie qu'au PREMIER
     * consentement, et une reconnexion sans révocation préalable n'en donne pas.
     */
    if (!tokens.refreshToken) return back(base, { mailbox: "sans_jeton_durable" });

    const payload = await payloadClient();
    const existing = (
      await payload.find({
        collection: "mailbox-connections",
        where: { accountEmail: { equals: email } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
    ).docs[0] as { id: number | string } | undefined;

    const data = {
      accountEmail: email,
      user: state.userId,
      provider: "google",
      status: "active",
      lastError: null,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(tokens.expiresAt).toISOString(),
      /**
       * Les deux curseurs partent d'AUJOURD'HUI, et pas de `syncSince`.
       *
       * Sans ça, le premier passage tenterait de lire une année entière d'un
       * coup. Le présent est à jour par définition à l'instant où l'on connecte
       * la boîte ; le passé se rattrape ensuite, par tranches.
       */
      ...(existing
        ? {}
        : {
            syncSince: state.since,
            syncedUpTo: new Date().toISOString(),
            backfillBefore: new Date().toISOString(),
            capturedCount: 0,
          }),
    };

    if (existing) {
      await payload.update({
        collection: "mailbox-connections",
        id: existing.id,
        data: data as never,
        overrideAccess: true,
      });
    } else {
      await payload.create({
        collection: "mailbox-connections",
        data: data as never,
        overrideAccess: true,
      });
    }

    payload.logger.info(`[boîte mail] ${email} connectée.`);
    return back(base, { mailbox: "connectee" });
  } catch (err) {
    console.error("[boîte mail] connexion échouée :", err);
    return back(base, { mailbox: "echec" });
  }
}
