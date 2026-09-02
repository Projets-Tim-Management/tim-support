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
import { isValidPlate, normalizePlate } from "@/modules/marketing/lib/onboarding";

/**
 * Véhicules d'un client — section « Véhicules » du dossier de démarrage.
 * Section facultative : tous les clients ne suivent pas leur flotte dans TIM.
 */

const setDisplayName: CollectionBeforeChangeHook = ({ data }) => {
  // Normalisation de la plaque à l'enregistrement : « ab123cd », « AB 123 CD »
  // et « AB-123-CD » désignent le même véhicule. Sans ça, les doublons passent.
  if (data?.plate) data.plate = normalizePlate(data.plate);
  data.displayName = [data?.brand, data?.plate].filter(Boolean).join(" · ") || "Véhicule";
  return data;
};

export const ClientVehicles: CollectionConfig = {
  slug: "client-vehicles",
  labels: { singular: "Véhicule", plural: "Véhicules" },
  admin: {
    useAsTitle: "displayName",
    defaultColumns: ["brand", "year", "plate", "insuranceDate", "licenseTypes"],
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
          label: "Marque du véhicule",
          required: true,
          admin: { width: "50%", placeholder: "Renault Master" },
        },
        yearField("Année"),
        {
          name: "plate",
          type: "text",
          label: "Immatriculation",
          required: true,
          index: true,
          validate: (value: unknown) =>
            isValidPlate(value as string) ? true : "Format attendu : AB-123-CD.",
          admin: { width: "25%", placeholder: "AB-123-CD" },
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
          /**
           * Texte LIBRE, et non plus une liste fermée.
           *
           * La liste couvrait les permis routiers français (B, C1E, CE…). Elle
           * laissait donc dehors tout ce qui existe à côté : permis étrangers,
           * autorisations de conduite internes, mentions particulières. Un
           * client qui ne trouvait pas son cas ne pouvait pas passer outre — le
           * champ étant obligatoire, c'est le dossier de démarrage entier qui
           * restait bloqué (signalé par un client le 27/08/2026).
           *
           * Ce champ décrit la réalité du client, pas une nomenclature que nous
           * lui imposons.
           */
          name: "licenseTypes",
          type: "text",
          label: "Type de permis",
          required: true,
          admin: {
            width: "25%",
            placeholder: "B, C1E",
            description: "Permis nécessaires pour conduire ce véhicule.",
          },
        },
      ],
    },
    partnerField,
    displayNameField,
  ],
};
