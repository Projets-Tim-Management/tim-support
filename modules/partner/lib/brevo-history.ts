import type { Payload } from "payload";

import { vitrinePartnerId } from "@/modules/partner/lib/vitrine-partner";
import {
  IMPORTED_STAGES,
  fallbackCompanyName,
  fetchCompany,
  fetchContact,
  fetchDeals,
  fetchStageNames,
  formatPhone,
  normalizeStage,
  splitName,
  type BrevoDeal,
} from "@/modules/partner/lib/brevo-deals";

/**
 * Reprise de l'historique du CRM Brevo, avant la coupure.
 *
 * Deux gestes ponctuels, distincts de l'import quotidien :
 *  - `auditBrevoLeads` : quelles opportunités Brevo n'ont pas de fiche côté TIM.
 *    Sans ce contrôle, on couperait Brevo sans savoir ce qu'on y laisse ;
 *  - `importLostDeals` : les affaires « Perdue », que l'import courant écarte.
 *    Elles entrent en BROUILLON avec le motif « À qualifier », pour que
 *    l'équipe détermine comment chacune a été perdue.
 *
 * ⚠️ Ce module disparaît avec `brevo-import` et `brevo-deals` à la coupure.
 */

const LOST_STAGE = "perdue";

export interface AuditSummary {
  ok: boolean;
  deals: number;
  /** Par étape : combien ont une fiche, combien n'en ont pas. */
  stages: Record<string, { presentes: number; absentes: number }>;
  /** Absentes ALORS QUE leur étape est importée — les vraies anomalies. */
  manquantes: string[];
  reason?: string;
}

export async function auditBrevoLeads(payload: Payload): Promise<AuditSummary> {
  const empty: AuditSummary = { ok: false, deals: 0, stages: {}, manquantes: [] };
  if (!process.env.BREVO_API_KEY) return { ...empty, reason: "brevo_non_configure" };

  let stageNames: Map<string, string>;
  let deals: BrevoDeal[];
  try {
    [stageNames, deals] = await Promise.all([fetchStageNames(), fetchDeals(undefined, 5000)]);
  } catch (e) {
    return { ...empty, reason: `brevo_injoignable: ${(e as Error).message}` };
  }

  const known = new Set<string>();
  const found = await payload.find({
    collection: "partner-clients",
    where: { brevoDealId: { exists: true } },
    limit: 5000,
    depth: 0,
    // Les fiches en brouillon comptent : elles existent, c'est ce qu'on vérifie.
    draft: true,
    overrideAccess: true,
  });
  for (const d of found.docs) {
    const id = (d as { brevoDealId?: string }).brevoDealId;
    if (id) known.add(id);
  }

  const stages: AuditSummary["stages"] = {};
  const manquantes: string[] = [];
  for (const deal of deals) {
    const name = stageNames.get(deal.attributes?.deal_stage ?? "") ?? "(étape inconnue)";
    stages[name] ??= { presentes: 0, absentes: 0 };
    if (known.has(deal.id)) {
      stages[name].presentes += 1;
      continue;
    }
    stages[name].absentes += 1;
    // Une absence n'est une anomalie que si l'étape est censée être importée.
    if (IMPORTED_STAGES[normalizeStage(name)]) {
      manquantes.push(`${deal.attributes?.deal_name ?? deal.id} (${name})`);
    }
  }

  return { ok: true, deals: deals.length, stages, manquantes };
}

export interface LostImportSummary {
  ok: boolean;
  dry: boolean;
  deals: number;
  created: string[];
  skipped: Record<string, number>;
  failed: string[];
  reason?: string;
}

/**
 * Importe les affaires « Perdue » en brouillon.
 *
 * En brouillon même quand l'e-mail est présent : ces fiches ne décrivent pas un
 * prospect vivant, elles reconstituent un historique. Publier 86 affaires
 * perdues d'un coup dans le Kanban noierait le travail en cours.
 */
export async function importLostDeals(
  payload: Payload,
  { dry = false, max = 5000 }: { dry?: boolean; max?: number } = {},
): Promise<LostImportSummary> {
  const empty: LostImportSummary = { ok: false, dry, deals: 0, created: [], skipped: {}, failed: [] };
  if (!process.env.BREVO_API_KEY) return { ...empty, reason: "brevo_non_configure" };

  const partner = await vitrinePartnerId(payload);
  if (partner == null) return { ...empty, reason: "partenaire_introuvable" };

  let stageNames: Map<string, string>;
  let deals: BrevoDeal[];
  try {
    [stageNames, deals] = await Promise.all([fetchStageNames(), fetchDeals(undefined, max)]);
  } catch (e) {
    return { ...empty, reason: `brevo_injoignable: ${(e as Error).message}` };
  }

  const created: string[] = [];
  const failed: string[] = [];
  const skipped: Record<string, number> = {};
  const note = (r: string) => {
    skipped[r] = (skipped[r] ?? 0) + 1;
  };

  const lost = deals.filter(
    (d) => normalizeStage(stageNames.get(d.attributes?.deal_stage ?? "") ?? "") === LOST_STAGE,
  );

  for (const deal of lost) {
    const already = await payload.find({
      collection: "partner-clients",
      where: { brevoDealId: { equals: deal.id } },
      limit: 1,
      depth: 0,
      draft: true,
      overrideAccess: true,
    });
    if (already.docs.length) {
      note("deja_importe");
      continue;
    }

    const [contact, company] = await Promise.all([
      deal.linkedContactsIds?.length ? fetchContact(deal.linkedContactsIds[0]) : null,
      deal.linkedCompaniesIds?.length ? fetchCompany(deal.linkedCompaniesIds[0]) : null,
    ]);

    const companyName = company?.attributes?.name?.trim() || fallbackCompanyName(contact, deal);
    if (!companyName) {
      note("sans_entreprise");
      continue;
    }

    if (dry) {
      created.push(companyName);
      continue;
    }

    const attrs = (contact?.attributes ?? {}) as Record<string, unknown>;
    const besoins = Array.isArray(attrs.BESOINS) ? (attrs.BESOINS as unknown[]).map(String) : [];
    const { firstName, lastName } = splitName(attrs.NOM);
    const phone = formatPhone(attrs.SMS);
    const email = contact?.email?.trim().toLowerCase();
    const date = deal.attributes?.created_at
      ? new Date(deal.attributes.created_at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })
      : null;

    const notes = [
      `Affaire perdue reprise du CRM Brevo${date ? `, créée le ${date}` : ""}.`,
      besoins.length ? `Besoins exprimés : ${besoins.join(", ")}.` : "",
      "Motif de perte à qualifier : Brevo n'en portait aucun.",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const doc = await payload.create({
        collection: "partner-clients",
        data: {
          companyName,
          email,
          phone,
          partner: partner as never,
          clientStatus: "perdue" as const,
          lossReason: "a-qualifier" as never,
          source: "site-vitrine" as never,
          brevoDealId: deal.id,
          leadNotes: notes,
        },
        draft: true,
        overrideAccess: true,
      });
      created.push(companyName);

      if (firstName || lastName || email || phone) {
        await payload
          .create({
            collection: "client-contacts",
            data: {
              client: doc.id as never,
              firstName,
              lastName,
              email,
              phone,
              role: "Contact du site vitrine",
            },
            overrideAccess: true,
          })
          .catch((e) => payload.logger.error(`[reprise] contact de ${doc.id} non créé : ${e}`));
      }
    } catch (e) {
      failed.push(`${companyName} (${(e as Error).message})`);
    }
  }

  return { ok: true, dry, deals: lost.length, created, skipped, failed };
}
