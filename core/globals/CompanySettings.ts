import type { GlobalConfig, Payload } from "payload";

import { isAdmin } from "@/core/access";
import { DEFAULT_PROVIDER } from "@/modules/partner/lib/contract-template.default";

/**
 * Système → « Entreprise » : l'identité de la société qui édite TIM (LC DEV).
 *
 * Une page à part, et non un onglet du contrat : ces informations servent
 * partout où la société se présente — l'en-tête et l'Annexe 2 du contrat
 * aujourd'hui, les factures ou les mentions des e-mails demain. Les saisir une
 * fois, ici, évite qu'elles divergent d'un document à l'autre.
 *
 * Réservée à TIM. Semée au démarrage avec l'identité du modèle de contrat,
 * jamais écrasée ensuite.
 */
export const CompanySettings: GlobalConfig = {
  slug: "company-settings",
  label: "Entreprise",
  admin: {
    group: "Système",
    description:
      "L'identité de la société qui édite TIM : elle figure en tête du contrat (le « Prestataire ») et dans ses conditions de paiement. Réservé à TIM.",
  },
  access: { read: isAdmin, update: isAdmin },
  fields: [
    {
      type: "collapsible",
      label: "Identité juridique",
      fields: [
        {
          type: "row",
          fields: [
            { name: "denomination", type: "text", label: "Dénomination", admin: { width: "50%" } },
            {
              name: "formeSociale",
              type: "text",
              label: "Forme sociale (en toutes lettres)",
              admin: { width: "50%", placeholder: "Société par actions simplifiée" },
            },
          ],
        },
        { name: "adresse", type: "text", label: "Siège social" },
        {
          type: "row",
          fields: [
            { name: "siren", type: "text", label: "SIREN", admin: { width: "33%" } },
            { name: "villeRcs", type: "text", label: "Ville du RCS", admin: { width: "33%" } },
            { name: "numeroRcs", type: "text", label: "Numéro RCS", admin: { width: "34%" } },
          ],
        },
        {
          type: "row",
          fields: [
            { name: "vatNumber", type: "text", label: "N° de TVA intracommunautaire", admin: { width: "50%" } },
            {
              name: "tribunal",
              type: "text",
              label: "Tribunal compétent (ville)",
              admin: { width: "50%", description: "Juridiction citée à l'article 14 du contrat." },
            },
          ],
        },
      ],
    },
    {
      type: "collapsible",
      label: "Représentant légal",
      fields: [
        {
          type: "row",
          fields: [
            {
              name: "representant",
              type: "text",
              label: "Représentant",
              admin: { width: "50%", placeholder: "Monsieur Charlie PIANCATELLI" },
            },
            { name: "qualite", type: "text", label: "Qualité", admin: { width: "50%", placeholder: "Directeur Général" } },
          ],
        },
      ],
    },
    {
      type: "collapsible",
      label: "Coordonnées bancaires",
      admin: { description: "Citées dans les conditions tarifaires du contrat (Annexe 2)." },
      fields: [
        {
          type: "row",
          fields: [
            { name: "iban", type: "text", label: "IBAN", admin: { width: "65%" } },
            { name: "bic", type: "text", label: "BIC", admin: { width: "35%" } },
          ],
        },
      ],
    },
    {
      type: "collapsible",
      label: "Contact",
      fields: [
        {
          type: "row",
          fields: [
            { name: "email", type: "email", label: "E-mail", admin: { width: "34%" } },
            { name: "phone", type: "text", label: "Téléphone", admin: { width: "33%" } },
            { name: "website", type: "text", label: "Site web", admin: { width: "33%" } },
          ],
        },
      ],
    },
  ],
};

/** Sème l'identité livrée avec le code si la page est vide. Jamais d'écrasement. */
export async function seedCompanySettings(payload: Payload): Promise<void> {
  try {
    const current = (await payload.findGlobal({ slug: "company-settings", depth: 0, overrideAccess: true })) as {
      denomination?: string | null;
    };
    if (current?.denomination) return;
    await payload.updateGlobal({
      slug: "company-settings",
      overrideAccess: true,
      data: { ...DEFAULT_PROVIDER, siren: "892316035" } as never,
    });
    payload.logger.info("[entreprise] identité de la société semée.");
  } catch (err) {
    payload.logger.error(`[entreprise] seed de l'identité échoué : ${err}`);
  }
}
