import type { Payload } from "payload";

import { hasAdminRole, isPartnerMetier, partnerIdOf } from "@/core/access";
import { trainingRefId } from "@/modules/training/collections/trainingOwned";

/**
 * Qui voit les envois d'une formation : TIM, et le partenaire-métier du client
 * (en lecture). Seul TIM règle ou déclenche un envoi.
 */
export async function trainingAccess(
  payload: Payload,
  headers: Headers,
  trainingId: number | string,
): Promise<{ ok: false; status: number } | { ok: true; admin: boolean }> {
  const { user } = await payload.auth({ headers });
  if (!user) return { ok: false, status: 401 };
  if (hasAdminRole(user)) return { ok: true, admin: true };
  if (!isPartnerMetier(user)) return { ok: false, status: 403 };
  const training = (await payload
    .findByID({ collection: "trainings", id: trainingId, depth: 0, overrideAccess: true })
    .catch(() => null)) as { partner?: unknown } | null;
  const owner = trainingRefId(training?.partner);
  return training && String(owner) === String(partnerIdOf(user)) ? { ok: true, admin: false } : { ok: false, status: 403 };
}
