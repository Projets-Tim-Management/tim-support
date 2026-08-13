import type { CollectionBeforeChangeHook, CollectionConfig } from "payload";

import { isAdmin, metierScoped } from "@/core/access";
import {
  clientField,
  displayNameField,
  partnerField,
  setPartnerFromClient,
} from "@/modules/marketing/collections/clientOwned";
import { LICENCE_PROFILE_OPTIONS } from "@/modules/marketing/lib/onboarding";

/**
 * Identifiants applicatifs de test — les comptes TIM créés par l'admin pour les
 * utilisateurs du client, que le CLIENT distribue lui-même à ses équipes.
 *
 * ⚠️ Ces identifiants sont stockés en clair : ils doivent être RELUS et remis en
 * main propre par le client (beaucoup de compagnons n'ont pas d'e-mail). C'est
 * une contrainte du besoin, pas un oubli — d'où le cloisonnement serré :
 *  - création/modification réservées aux admins ;
 *  - lecture limitée aux admins et au partenaire du client (scoping `partner`) ;
 *  - côté espace client, la lecture passe par une route dédiée qui filtre sur la
 *    session du client — jamais par l'API Payload publique.
 *
 * Ils ne sont valables que le temps du test.
 */

const setDisplayName: CollectionBeforeChangeHook = ({ data }) => {
  const who = [data?.firstName, data?.lastName].filter(Boolean).join(" ").trim();
  data.displayName = who || data?.username || "Accès";
  return data;
};

export const ClientCredentials: CollectionConfig = {
  slug: "client-credentials",
  labels: { singular: "Accès de test", plural: "Accès de test" },
  admin: {
    useAsTitle: "displayName",
    defaultColumns: ["firstName", "lastName", "licenceProfile", "username", "deliveredAt"],
    hidden: true,
  },
  disableDuplicate: true,
  access: {
    read: metierScoped(),
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: { beforeChange: [setPartnerFromClient, setDisplayName] },
  fields: [
    clientField,
    {
      type: "row",
      fields: [
        { name: "firstName", type: "text", label: "Prénom", required: true, admin: { width: "35%" } },
        { name: "lastName", type: "text", label: "Nom", required: true, admin: { width: "35%" } },
        {
          name: "licenceProfile",
          type: "select",
          label: "Priorité",
          options: LICENCE_PROFILE_OPTIONS,
          required: true,
          admin: { width: "30%" },
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "username",
          type: "text",
          label: "Identifiant",
          required: true,
          admin: { width: "50%", description: "Tel qu'il a été créé dans TIM." },
        },
        {
          name: "password",
          type: "text",
          label: "Mot de passe",
          required: true,
          admin: { width: "50%", description: "Remis au client, qui le distribue à son équipe." },
        },
      ],
    },
    {
      name: "employee",
      type: "relationship",
      relationTo: "client-employees",
      label: "Salarié concerné",
      admin: {
        allowCreate: false,
        description: "Facultatif — relie l'accès à la ligne du dossier de démarrage.",
      },
    },
    {
      name: "deliveredAt",
      type: "date",
      label: "Remis le",
      admin: {
        date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" },
        description: "Renseigné par le client quand il a remis l'accès à la personne.",
      },
    },
    partnerField,
    displayNameField,
  ],
};
