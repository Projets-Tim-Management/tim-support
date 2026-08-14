import type { CollectionBeforeChangeHook, CollectionConfig } from "payload";

import { isAdmin, metierScoped } from "@/core/access";
import { armAutoStep } from "@/modules/marketing/lib/auto-steps";
import {
  clientField,
  displayNameField,
  partnerField,
  setPartnerFromClient,
} from "@/modules/marketing/collections/clientOwned";
import { PASSWORD_MASK, encryptPasswordValue } from "@/modules/marketing/lib/credential-secrets";
import { LICENCE_PROFILE_OPTIONS } from "@/modules/marketing/lib/onboarding";

/**
 * Identifiants applicatifs de test — les comptes TIM créés par l'admin pour les
 * utilisateurs du client, que le CLIENT distribue lui-même à ses équipes.
 *
 * Le mot de passe est CHIFFRÉ au repos (AES-256-GCM, clé dérivée de
 * PAYLOAD_SECRET) et MASQUÉ à la lecture : ce sont de vrais accès au logiciel,
 * et une copie de la base ne doit pas les livrer.
 *
 * Il reste lisible à deux endroits, tous deux légitimes : l'espace client (le
 * client vient chercher ce qu'il distribue à ses équipes, après connexion par
 * code) et le back-office, après confirmation par un code envoyé au demandeur.
 * Beaucoup de compagnons n'ayant pas d'e-mail, la remise en main propre reste la
 * règle — d'où le cloisonnement serré :
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
  hooks: {
    beforeChange: [setPartnerFromClient, setDisplayName],
    // Créer les identifiants EST l'étape « Provisionnement des accès » : c'est
    // le geste attendu, il n'y a rien à cocher en plus. Le premier accès créé
    // suffit — la suite de la liste se remplit dans la foulée.
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation !== "create") return doc;
        await armAutoStep(req.payload, doc?.client, "provisionnement");
        return doc;
      },
    ],
  },
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
          hooks: {
            // Chiffré à l'écriture, masqué à la lecture. Le masque doit revenir
            // intact à l'écriture suivante (voir encryptPasswordValue) : sans
            // ça, enregistrer la fiche sans y toucher remplacerait le mot de
            // passe par des points.
            beforeChange: [
              ({ value, originalDoc, req }) =>
                encryptPasswordValue(value, { payload: req.payload, id: originalDoc?.id }),
            ],
            afterRead: [({ value }) => (value ? PASSWORD_MASK : value)],
          },
          admin: {
            width: "50%",
            description: "Chiffré. Utilisez « Révéler » pour l'afficher, ou consultez l'espace client.",
          },
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
