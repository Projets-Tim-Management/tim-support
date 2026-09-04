import type { Payload } from "payload";

import { logActivity } from "@/modules/partner/lib/journal";
import { vitrinePartnerEmail, vitrinePartnerId } from "@/modules/partner/lib/vitrine-partner";
import type { OpportunityDraft } from "@/modules/forms/lib/to-opportunity";

/**
 * Entrée d'un lead dans le Kanban, dans la foulée de sa soumission.
 *
 * Remplace le cron quotidien qui relisait le CRM Brevo : le lead était visible
 * le lendemain, il l'est désormais dans la seconde.
 *
 * Rien ici ne doit faire échouer la soumission : elle est déjà enregistrée quand
 * on arrive ici. Un échec produit un statut « echec » sur la soumission, pas une
 * erreur au visiteur — le lead est en base, il ne manque que sa fiche, et ça se
 * rattrape à la main.
 */

export type OpportunityOutcome =
  | { status: "opportunite" | "brouillon"; clientId: number | string }
  | { status: "rattachee"; clientId: number | string }
  | { status: "echec"; error: string };

export async function createOpportunity(
  payload: Payload,
  draft: OpportunityDraft,
  submissionId: number | string,
): Promise<OpportunityOutcome> {
  const partner = await vitrinePartnerId(payload);
  if (partner == null) {
    return { status: "echec", error: `Partenaire du site vitrine introuvable (${vitrinePartnerEmail()}).` };
  }

  /**
   * Le prospect est-il déjà connu ? On ne crée pas un doublon : la nouvelle
   * demande est journalisée sur sa fiche, pour que le commercial voie qu'il est
   * revenu et ce qu'il demande cette fois.
   *
   * On ne touche PAS à `formSubmission` de la fiche : ce champ dit quelle
   * soumission l'a CRÉÉE, et il est unique. C'est la soumission qui pointe vers
   * la fiche, jamais l'inverse — sinon un prospect qui revient trois fois se
   * disputerait le même champ.
   *
   * Et surtout, on ne remplace pas la « demande du lead » d'origine : elle est
   * la trace de ce qu'il voulait la première fois.
   */
  if (draft.email) {
    const same = await payload.find({
      collection: "partner-clients",
      where: {
        and: [{ email: { equals: draft.email } }, { partner: { equals: partner } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const existing = same.docs[0] as { id: number | string } | undefined;
    if (existing) {
      await logActivity(payload, {
        client: existing.id,
        title: "Nouvelle demande depuis le site vitrine",
        content: draft.leadNotes,
      }).catch((e) =>
        payload.logger.error(`[formulaires] journal de ${existing.id} échoué : ${e}`),
      );
      return { status: "rattachee", clientId: existing.id };
    }
  }

  const data = {
    companyName: draft.companyName,
    phone: draft.phone,
    partner: partner as never,
    clientStatus: "nouvelle" as const,
    source: draft.source as never,
    collaborateurs: draft.collaborateurs,
    leadNotes: draft.leadNotes,
    formSubmission: submissionId as never,
  };

  /**
   * Sans adresse e-mail, la fiche ne peut pas être publiée (champ requis pour la
   * facturation) : elle entre en BROUILLON plutôt que d'être perdue.
   *
   * `_status` est posé EXPLICITEMENT dans l'autre cas. La collection a les
   * brouillons activés, et une création sans mention laisse la fiche en
   * brouillon : elle n'apparaît alors pas dans le Kanban, et le lead reste
   * invisible pour l'équipe — exactement ce que cette étape doit supprimer.
   */
  const doc = draft.email
    ? await payload.create({
        collection: "partner-clients",
        data: { ...data, email: draft.email, _status: "published" },
        overrideAccess: true,
      })
    : await payload.create({
        collection: "partner-clients",
        data,
        draft: true,
        overrideAccess: true,
      });

  // La personne à rappeler. Une fiche sans contact oblige à rouvrir la soumission
  // pour retrouver un numéro qu'on vient de lire.
  const { firstName, lastName, email, phone, role } = draft.contact;
  if (firstName || lastName || email || phone) {
    await payload
      .create({
        collection: "client-contacts",
        data: { client: doc.id as never, firstName, lastName, email, phone, role },
        overrideAccess: true,
      })
      .catch((e) =>
        // Secondaire : la fiche existe et porte déjà le téléphone. Journalisé,
        // jamais bloquant.
        payload.logger.error(`[formulaires] contact de ${doc.id} non créé : ${e}`),
      );
  }

  return { status: draft.email ? "opportunite" : "brouillon", clientId: doc.id };
}
