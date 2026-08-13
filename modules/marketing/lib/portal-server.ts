import { cookies } from "next/headers";

import { payloadClient } from "@/core/payload-client";
import { PORTAL_COOKIE, type PortalSession, readSessionToken } from "@/modules/marketing/lib/portal-auth";

/**
 * Lecture de la session espace client, côté serveur (pages et routes).
 *
 * Le PÉRIMÈTRE de tout ce que le client peut voir vient d'ici, et uniquement
 * d'ici : `session.cid` est l'id de son entreprise, et chaque requête est filtrée
 * dessus. Aucune page du portail ne doit lire un identifiant de client venu de
 * l'URL ou du corps d'une requête — ce serait la faille évidente.
 */

export const getPortalSession = async (): Promise<PortalSession | null> => {
  const store = await cookies();
  return readSessionToken(store.get(PORTAL_COOKIE)?.value);
};

export type PortalClient = {
  id: number | string;
  companyName?: string;
  onboardingStatus?: string;
};

/** Session + entreprise rattachée. Null si non connecté ou client introuvable. */
export const getPortalClient = async (): Promise<{
  session: PortalSession;
  client: PortalClient;
} | null> => {
  const session = await getPortalSession();
  if (!session) return null;

  const payload = await payloadClient();
  try {
    const client = (await payload.findByID({
      collection: "partner-clients",
      id: session.cid,
      depth: 0,
      overrideAccess: true,
    })) as PortalClient;
    return client ? { session, client } : null;
  } catch {
    return null;
  }
};
