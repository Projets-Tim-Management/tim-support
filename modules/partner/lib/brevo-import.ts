import type { PayloadRequest } from "payload";

import type { PartnerClient } from "@/payload-types";

import { payloadClient } from "@/core/payload-client";
import { vitrinePartnerEmail, vitrinePartnerId } from "@/modules/partner/lib/vitrine-partner";
import {
  buildLead,
  fetchCompany,
  fetchContact,
  fetchDeals,
  fetchStageNames,
  statusForStage,
  type BrevoLead,
} from "@/modules/partner/lib/brevo-deals";

/**
 * Fait entrer les leads du site vitrine (opportunités Brevo) dans les
 * Opportunités TIM. Voir `brevo-deals.ts` pour les règles de mapping.
 *
 * Ce module ne fait qu'ÉCRIRE côté TIM : une fiche par lead, dans la colonne de
 * son étape Brevo, rattachée au partenaire du site vitrine — et un contact avec
 * le nom et le téléphone de la personne, sans quoi le lead n'est qu'un nom
 * d'entreprise qu'on ne sait pas rappeler.
 */

type Payload = Awaited<ReturnType<typeof payloadClient>>;

const frDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : null;

/** Trace lisible de ce que le lead a demandé, telle qu'elle s'affiche sur la fiche. */
export function leadNotes(lead: BrevoLead): string {
  const lines = [`Lead du site vitrine${frDate(lead.createdAt) ? ` reçu le ${frDate(lead.createdAt)}` : ""}.`];
  if (lead.besoins.length) lines.push(`Besoins exprimés : ${lead.besoins.join(", ")}.`);
  const who = [lead.contactName.firstName, lead.contactName.lastName].filter(Boolean).join(" ");
  if (who || lead.phone) lines.push(`Contact : ${[who, lead.phone].filter(Boolean).join(" · ")}.`);
  return lines.join("\n");
}

export interface SyncSummary {
  ok: boolean;
  dry: boolean;
  /** Opportunités Brevo examinées. */
  deals: number;
  created: string[];
  /** Fiches déjà saisies à la main, rattachées à leur opportunité Brevo. */
  linked: string[];
  /** Raison → nombre, pour tout ce qui n'a pas été importé. */
  skipped: Record<string, number>;
  failed: string[];
  reason?: string;
}

/**
 * @param since  Date ISO : n'examine que les opportunités modifiées depuis.
 *               Omise = tout l'historique (reprise initiale).
 * @param dry    Ne rien écrire ; renvoyer ce qui serait créé.
 */
export async function syncBrevoLeads(
  payload: Payload,
  { since, dry = false, max = 500, req }: { since?: string; dry?: boolean; max?: number; req?: PayloadRequest } = {},
): Promise<SyncSummary> {
  const empty: SyncSummary = { ok: false, dry, deals: 0, created: [], linked: [], skipped: {}, failed: [] };
  if (!process.env.BREVO_API_KEY) return { ...empty, reason: "brevo_non_configure" };

  const partner = await vitrinePartnerId(payload);
  if (partner == null) {
    // Sans partenaire apporteur, une opportunité ne peut pas exister (champ
    // requis) : on s'arrête AVANT d'appeler Brevo, en le disant.
    return { ...empty, reason: `partenaire_introuvable:${vitrinePartnerEmail()}` };
  }

  // Une panne côté Brevo (clé expirée, throttling, incident) doit se VOIR : le
  // cron renvoie alors 503 et le résumé porte la raison, au lieu d'un « 0 lead
  // importé » indiscernable d'une nuit sans nouveau prospect.
  let stages: Map<string, string>;
  let deals: Awaited<ReturnType<typeof fetchDeals>>;
  try {
    [stages, deals] = await Promise.all([fetchStageNames(), fetchDeals(since, max)]);
  } catch (e) {
    payload.logger.error(`[brevo] import interrompu : ${(e as Error).message}`);
    return { ...empty, reason: `brevo_injoignable: ${(e as Error).message}` };
  }

  const created: string[] = [];
  const linked: string[] = [];
  const failed: string[] = [];
  const skipped: Record<string, number> = {};
  const note = (reason: string) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };

  for (const deal of deals) {
    // Filtre d'étape AVANT toute autre lecture : inutile d'aller chercher le
    // contact et la société d'une affaire gagnée qu'on n'importe pas.
    const stageName = stages.get(deal.attributes?.deal_stage ?? "");
    if (!statusForStage(stageName)) {
      note(stageName ? `etape:${stageName}` : "etape_inconnue");
      continue;
    }

    // Déjà importé → on ne touche à rien. TIM est maître après l'entrée.
    const already = await payload.find({
      collection: "partner-clients",
      where: { brevoDealId: { equals: deal.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    });
    if (already.docs.length) {
      note("deja_importe");
      continue;
    }

    const [contact, company] = await Promise.all([
      deal.linkedContactsIds?.length ? fetchContact(deal.linkedContactsIds[0]) : null,
      deal.linkedCompaniesIds?.length ? fetchCompany(deal.linkedCompaniesIds[0]) : null,
    ]);

    const built = buildLead(deal, stageName, contact, company);
    if ("skip" in built) {
      note(built.skip);
      continue;
    }
    const lead = built.lead;

    // Rattrapage : la fiche existe peut-être déjà, saisie à la main avant que le
    // lead ne remonte. On lui pose l'identifiant Brevo — et RIEN d'autre : son
    // statut et ses données sont le travail de quelqu'un, pas un doublon à écraser.
    if (lead.email) {
      const same = await payload.find({
        collection: "partner-clients",
        where: {
          and: [
            { email: { equals: lead.email } },
            { partner: { equals: partner } },
            // Fiches ENCORE LIBRES seulement. Deux opportunités Brevo partageant
            // une adresse (un même contact recontacté) se disputaient sinon la
            // même fiche : chaque passage du cron réécrivait `brevoDealId` avec
            // l'autre identifiant, indéfiniment.
            { brevoDealId: { exists: false } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req,
      });
      const existing = same.docs[0] as { id: number | string; companyName?: string } | undefined;
      if (existing) {
        if (!dry) {
          try {
            await payload.update({
              collection: "partner-clients",
              id: existing.id,
              data: { brevoDealId: lead.dealId },
              overrideAccess: true,
              req,
            });
          } catch (e) {
            // Le rattachement est un confort : une contrainte d'unicité ou une
            // fiche verrouillée ne doit pas interrompre l'import des suivants.
            failed.push(`rattachement ${existing.companyName ?? existing.id} (${(e as Error).message})`);
            continue;
          }
        }
        linked.push(`${existing.companyName ?? existing.id} ← ${lead.dealId}`);
        continue;
      }
    }

    if (dry) {
      created.push(`${lead.companyName} (${lead.clientStatus})`);
      continue;
    }

    try {
      const data = {
        companyName: lead.companyName,
        phone: lead.phone,
        partner: partner as PartnerClient["partner"],
        // Le statut vient d'une table de correspondance (IMPORTED_STAGES) : il
        // est bien l'une des valeurs du champ, mais TypeScript ne peut pas le
        // déduire d'un `Record<string, string>`.
        clientStatus: lead.clientStatus as PartnerClient["clientStatus"],
        source: "site-vitrine" as const,
        brevoDealId: lead.dealId,
        leadNotes: leadNotes(lead),
      };
      // Sans adresse e-mail, la fiche ne peut pas être publiée (champ requis pour
      // la facturation) : elle entre en BROUILLON plutôt que d'être perdue — le
      // lead existe, il lui manque juste de quoi le facturer.
      const doc = lead.email
        ? await payload.create({
            collection: "partner-clients",
            data: { ...data, email: lead.email },
            overrideAccess: true,
            req,
          })
        : await payload.create({
            collection: "partner-clients",
            data,
            draft: true,
            overrideAccess: true,
            req,
          });
      created.push(`${lead.companyName} (${lead.clientStatus})`);

      // La personne à rappeler. Une fiche sans contact oblige à rouvrir Brevo
      // pour retrouver un numéro qu'on vient de lire.
      const { firstName, lastName } = lead.contactName;
      if (firstName || lastName || lead.phone || lead.email) {
        await payload
          .create({
            collection: "client-contacts",
            data: {
              client: doc.id,
              firstName,
              lastName,
              email: lead.email,
              phone: lead.phone,
              role: "Contact du site vitrine",
            },
            overrideAccess: true,
            req,
          })
          .catch((e) => {
            // Le contact est un plus : son échec ne doit pas faire perdre le lead.
            failed.push(`contact ${lead.companyName} (${(e as Error).message})`);
          });
      }
    } catch (e) {
      failed.push(`${lead.companyName} (${(e as Error).message})`);
    }
  }

  return { ok: true, dry, deals: deals.length, created, linked, skipped, failed };
}
