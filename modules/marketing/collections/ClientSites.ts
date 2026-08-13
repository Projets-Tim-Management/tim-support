import type { CollectionBeforeChangeHook, CollectionConfig } from "payload";

import { metierOwnedAccess } from "@/core/access";
import { enforcePartnerField } from "@/core/hooks/enforcePartner";
import {
  clientField,
  displayNameField,
  partnerField,
  setPartnerFromClient,
} from "@/modules/marketing/collections/clientOwned";

/**
 * Chantiers d'un client — section « Chantiers » du dossier de démarrage.
 *
 * Ce sont les chantiers ouverts sur la période de test : sans eux, aucun
 * pointage n'est possible et le test tourne à vide. D'où la section obligatoire.
 */

const setDisplayName: CollectionBeforeChangeHook = ({ data }) => {
  // Le code en tête : c'est par lui que les équipes désignent un chantier.
  const parts = [data?.code?.trim(), data?.name?.trim()].filter(Boolean);
  data.displayName = parts.join(" · ") || data?.address?.trim() || "Chantier";
  return data;
};

export const ClientSites: CollectionConfig = {
  slug: "client-sites",
  labels: { singular: "Chantier", plural: "Chantiers" },
  admin: {
    useAsTitle: "displayName",
    defaultColumns: ["code", "name", "address", "startDate", "endDate", "zone"],
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
          name: "name",
          type: "text",
          label: "Nom du chantier",
          required: true,
          admin: { width: "65%" },
        },
        {
          name: "code",
          type: "text",
          label: "Code chantier",
          required: true,
          index: true,
          admin: { width: "35%", description: "La référence interne du client." },
        },
      ],
    },
    { name: "address", type: "text", label: "Adresse du chantier", required: true },
    {
      type: "row",
      fields: [
        {
          name: "startDate",
          type: "date",
          label: "Date de début",
          required: true,
          admin: {
            width: "50%",
            date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" },
          },
        },
        {
          name: "endDate",
          type: "date",
          label: "Date de fin",
          required: true,
          validate: (value: unknown, { siblingData }: { siblingData?: { startDate?: string } }) => {
            const start = siblingData?.startDate;
            if (value && start && Date.parse(value as string) < Date.parse(start)) {
              return "La fin ne peut pas précéder le début.";
            }
            return true;
          },
          admin: {
            width: "50%",
            date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" },
            description: "Fin prévisionnelle si la date exacte n'est pas connue.",
          },
        },
      ],
    },
    {
      name: "zone",
      type: "text",
      label: "Zone de chantier",
      admin: {
        // ⚠️ Définition à confirmer côté métier (secteur géographique ? périmètre
        // de pointage géolocalisé ?). Laissé en texte libre tant que la réponse
        // n'est pas tranchée — un champ typé trop tôt serait à re-migrer.
        description: "Secteur ou périmètre du chantier.",
      },
    },
    partnerField,
    displayNameField,
  ],
};
