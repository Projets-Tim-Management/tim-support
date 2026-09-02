import type { CollectionBeforeChangeHook, CollectionConfig } from "payload";

import { metierOwnedAccess } from "@/core/access";
import { enforcePartnerField } from "@/core/hooks/enforcePartner";
import {
  clientField,
  displayNameField,
  inspectionDateField,
  insuranceDateField,
  partnerField,
  registrationDateField,
  setPartnerFromClient,
  yearField,
} from "@/modules/marketing/collections/clientOwned";

/**
 * Engins d'un client — section « Engins » du dossier de démarrage.
 *
 * Un engin porte un numéro d'immatriculation OU un numéro de série (les engins
 * non routiers n'ont pas de plaque) : d'où un champ libre `serial`, contrairement
 * aux véhicules dont la plaque est normalisée.
 */

const setDisplayName: CollectionBeforeChangeHook = ({ data }) => {
  data.displayName = [data?.brand, data?.serial].filter(Boolean).join(" · ") || "Engin";
  return data;
};

export const ClientMachines: CollectionConfig = {
  slug: "client-machines",
  labels: { singular: "Engin", plural: "Engins" },
  admin: {
    useAsTitle: "displayName",
    defaultColumns: ["brand", "year", "serial", "insuranceDate", "cacesTypes"],
    hidden: true,
  },
  disableDuplicate: true,
  access: metierOwnedAccess,
  hooks: {
    beforeChange: [setPartnerFromClient, enforcePartnerField(), setDisplayName],
  },
  fields: [
    clientField,
    {
      type: "row",
      fields: [
        {
          name: "brand",
          type: "text",
          label: "Marque de l'engin",
          required: true,
          admin: { width: "50%", placeholder: "Caterpillar 320" },
        },
        yearField("Année"),
        {
          name: "serial",
          type: "text",
          label: "Immatriculation / n° de série",
          required: true,
          index: true,
          admin: { width: "25%", description: "Plaque si l'engin en a une, sinon n° de série." },
        },
      ],
    },
    {
      type: "row",
      fields: [
        registrationDateField,
        inspectionDateField,
        insuranceDateField,
        {
          // Texte libre, pour la même raison que les permis : la liste des
          // recommandations CACES ne couvre pas les autorisations de conduite
          // internes ni les certifications étrangères. Voir ClientVehicles.
          name: "cacesTypes",
          type: "text",
          label: "Type de CACES",
          required: true,
          admin: {
            width: "25%",
            placeholder: "R482 B1, R489 3",
            description: "Certification nécessaire pour conduire cet engin.",
          },
        },
      ],
    },
    partnerField,
    displayNameField,
  ],
};
