import type { CollectionBeforeChangeHook, CollectionConfig } from "payload";

import { metierOwnedAccess } from "@/core/access";
import { enforcePartnerField } from "@/core/hooks/enforcePartner";
import {
  clientField,
  displayNameField,
  insuranceDateField,
  partnerField,
  setPartnerFromClient,
  yearField,
} from "@/modules/marketing/collections/clientOwned";
import { LICENSE_TYPES, isValidPlate, normalizePlate } from "@/modules/marketing/lib/onboarding";

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
        insuranceDateField,
        {
          name: "licenseTypes",
          type: "select",
          hasMany: true,
          label: "Type de permis",
          required: true,
          options: [...LICENSE_TYPES],
          admin: { width: "75%", description: "Permis nécessaires pour conduire ce véhicule." },
        },
      ],
    },
    partnerField,
    displayNameField,
  ],
};
