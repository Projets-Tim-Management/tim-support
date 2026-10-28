import type { Payload } from "payload";

import { hasAdminRole, isPartnerMetier, partnerIdOf } from "@/core/access";
import { payloadClient } from "@/core/payload-client";

/**
 * Qui peut agir sur une fiche client depuis les routes de l'onglet « Signature »
 * et des relances : un admin, ou le partenaire MÉTIER qui suit la fiche.
 *
 * Une seule copie de la règle : recopiée route par route, une version qui
 * diverge laisserait un partenaire agir sur le client d'un autre.
 */
export type ClientAccess<C> =
  | { payload: Payload; client: C; user: { id: number | string; email?: string | null } }
  | { payload: Payload; error: 400 | 403 | 404 };

export async function authorizeClient<C extends { id: number | string; partner?: unknown }>(
  req: Request,
  clientId: unknown,
): Promise<ClientAccess<C>> {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (clientId == null || clientId === "") return { payload, error: 400 };

  const client = (await payload
    .findByID({ collection: "partner-clients", id: clientId as number, depth: 0, overrideAccess: true })
    .catch(() => null)) as C | null;
  if (!client) return { payload, error: 404 };

  const partnerId =
    client.partner && typeof client.partner === "object"
      ? (client.partner as { id?: unknown }).id
      : client.partner;
  const allowed =
    hasAdminRole(user) ||
    (isPartnerMetier(user) && partnerIdOf(user) != null && String(partnerIdOf(user)) === String(partnerId));
  if (!allowed || !user) return { payload, error: 403 };

  return { payload, client, user: user as { id: number | string; email?: string | null } };
}
