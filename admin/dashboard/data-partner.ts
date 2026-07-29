import type { PayloadRequest } from "payload";

/**
 * Données du tableau de bord d'un PARTENAIRE connecté — strictement scopées à SA
 * fiche (`partner = partnerId`, dérivé du compte authentifié). 4 requêtes max en
 * parallèle (bien sous le plafond du pooler à 15).
 */
export interface PartnerMetrics {
  isMetier: boolean;
  pointsBalance: number;
  submissions: { pending: number; approved: number; total: number };
  orders: { pending: number; total: number };
  /** Uniquement pour un partenaire-métier (ses clients apportés). */
  clients: { active: number; total: number; caMonthly: number } | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Doc = Record<string, any>;

export async function getPartnerMetrics(
  req: PayloadRequest,
  partnerId: string | number,
  isMetier: boolean,
): Promise<PartnerMetrics> {
  const { payload } = req;
  const where = { partner: { equals: partnerId } };
  const base = { overrideAccess: true as const, depth: 0 as const, req, pagination: false as const };

  const [ptx, subs, orders, clients] = await Promise.all([
    payload
      .find({ ...base, collection: "point-transactions", where, limit: 40000, select: { delta: true } })
      .then((r) => r.docs as Doc[]),
    payload
      .find({ ...base, collection: "mission-submissions", where, limit: 8000, select: { status: true } })
      .then((r) => r.docs as Doc[]),
    payload
      .find({ ...base, collection: "reward-orders", where, limit: 8000, select: { status: true } })
      .then((r) => r.docs as Doc[]),
    isMetier
      ? payload
          .find({
            ...base,
            collection: "partner-clients",
            where,
            limit: 8000,
            select: { clientStatus: true, caPaye: true },
          })
          .then((r) => r.docs as Doc[])
      : Promise.resolve([] as Doc[]),
  ]);

  return {
    isMetier,
    pointsBalance: ptx.reduce((s, t) => s + (Number(t.delta) || 0), 0),
    submissions: {
      pending: subs.filter((s) => s.status === "pending").length,
      approved: subs.filter((s) => s.status === "approved").length,
      total: subs.length,
    },
    orders: {
      pending: orders.filter((o) => o.status === "pending").length,
      total: orders.length,
    },
    clients: isMetier
      ? {
          active: clients.filter((c) => c.clientStatus === "actif").length,
          total: clients.length,
          caMonthly: clients.reduce((s, c) => s + (Number(c.caPaye) || 0), 0),
        }
      : null,
  };
}
