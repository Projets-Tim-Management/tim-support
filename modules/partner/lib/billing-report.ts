import type { Payload } from "payload";

import { buildBillingReport, type BillingReport, type ClientCheck, type SupportClientFacts } from "./billing-check";
import { loadPennylane } from "./pennylane";

/**
 * Le rapport de contrôle de facturation, prêt à afficher : les fiches clients
 * du support d'un côté, l'instantané Pennylane de l'autre.
 *
 * Deux entrées : l'écran global (toutes les fiches) et la fiche d'un client
 * (la sienne seulement — mais l'instantané Pennylane est le même, en cache).
 */

const SELECT = {
  companyName: true,
  siren: true,
  raisonSociale: true,
  clientStatus: true,
  paymentMethod: true,
  paymentTerms: true,
  billingPeriod: true,
  licences: true,
} as const;

type ClientDoc = {
  id: number | string;
  companyName?: string | null;
  siren?: string | null;
  raisonSociale?: string | null;
  clientStatus?: string | null;
  paymentMethod?: string | null;
  paymentTerms?: string | null;
  billingPeriod?: string | null;
  licences?: Record<string, number | null | undefined> | null;
};

const toFacts = (d: ClientDoc): SupportClientFacts => ({
  id: d.id,
  name: d.companyName ?? "—",
  siren: d.siren,
  raisonSociale: d.raisonSociale,
  clientStatus: d.clientStatus,
  paymentMethod: d.paymentMethod,
  paymentTerms: d.paymentTerms,
  billingPeriod: d.billingPeriod,
  licences: d.licences,
});

/** Rapport complet — toutes les fiches (les prospects sans abonnement sont écartés par le rapport). */
export async function loadBillingReport(payload: Payload, opts: { refresh?: boolean } = {}): Promise<BillingReport> {
  const [snap, clients] = await Promise.all([
    loadPennylane(opts),
    payload.find({
      collection: "partner-clients",
      limit: 5000,
      depth: 0,
      draft: true,
      overrideAccess: true,
      select: SELECT as never,
    }),
  ]);
  return buildBillingReport((clients.docs as ClientDoc[]).map(toFacts), snap);
}

/**
 * Contrôle d'UNE fiche. `facts` peut venir du formulaire en cours d'édition
 * (licences pas encore enregistrées) : c'est ce que voit la fiche client, où
 * l'écart se met à jour pendant qu'on saisit.
 */
export async function checkOneClient(
  facts: SupportClientFacts,
  opts: { refresh?: boolean } = {},
): Promise<{ fetchedAt: string; check: ClientCheck | null }> {
  const snap = await loadPennylane(opts);
  // Un prospect sans abonnement ressort `null` : la fiche dit alors qu'il n'y a
  // rien dans Pennylane, ce qui est bien l'information attendue.
  const report = buildBillingReport([facts], snap);
  return { fetchedAt: snap.fetchedAt, check: report.checks[0] ?? null };
}
