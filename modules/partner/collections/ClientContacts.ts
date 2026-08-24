import { PASSWORD_MASK, encryptPasswordValue } from "@/modules/marketing/lib/credential-secrets";
import { LICENCE_PROFILE_OPTIONS } from "@/modules/marketing/lib/onboarding";
import type { CollectionBeforeChangeHook, CollectionConfig } from "payload";

import { metierOwnedAccess } from "@/core/access";
import { enforcePartnerField } from "@/core/hooks/enforcePartner";
import { validatePhone } from "@/core/lib/validators";

/**
 * Contacts d'un client apporté (personnes de l'entreprise cliente : dirigeant,
 * comptabilité, chantier…).
 *
 * Gérés DEPUIS la fiche client via un champ `join` (onglet « Contact ») : tableau
 * de lignes cliquables → drawer d'édition/création. Jamais dans le menu latéral
 * (`admin.hidden`). Périmètre : un partenaire-métier ne voit/gère que les contacts
 * de SES clients (scoping par `partner`, dérivé du client puis verrouillé par
 * `enforcePartnerField`). L'admin voit tout.
 */

/** Renseigne `partner` (clé de scoping) à partir du client rattaché — tous rôles. */
const setPartnerFromClient: CollectionBeforeChangeHook = async ({ data, req }) => {
  const clientRef = data?.client;
  if (clientRef == null) return data;
  const clientId = typeof clientRef === "object" ? (clientRef as { id: unknown }).id : clientRef;
  try {
    const client = await req.payload.findByID({
      collection: "partner-clients",
      id: clientId as string | number,
      depth: 0,
      overrideAccess: true,
    });
    const p = (client as { partner?: unknown })?.partner;
    data.partner = p != null && typeof p === "object" ? (p as { id: unknown }).id : p;
  } catch {
    /* client introuvable → laissé tel quel (le `required` remontera l'erreur) */
  }
  return data;
};

/** Titre lisible (drawer + colonnes) : prénom + nom, repli e-mail / rôle. */
const setDisplayName: CollectionBeforeChangeHook = ({ data }) => {
  const full = [data?.firstName, data?.lastName].filter(Boolean).join(" ").trim();
  data.displayName = full || data?.email || data?.role || "Contact";
  return data;
};

export const ClientContacts: CollectionConfig = {
  slug: "client-contacts",
  labels: { singular: "Contact", plural: "Contacts" },
  admin: {
    useAsTitle: "displayName",
    defaultColumns: ["firstName", "lastName", "role", "email", "phone"],
    // Géré via le champ `join` de la fiche client → jamais dans le menu latéral.
    hidden: true,
  },
  // Pas de « Dupliquer » dans le menu 3-points (propriété de collection).
  disableDuplicate: true,
  // Métier = CRUD scopé à ses clients (par `partner`) ; admin = tout.
  // Métier = CRUD complet sur SES contacts (y compris SUPPRESSION : contrairement
  // aux clients, un contact est un élément mineur que le partenaire peut retirer).
  access: metierOwnedAccess,
  hooks: {
    // partner dérivé du client (tous rôles), puis forcé sur SA fiche pour un rôle
    // partenaire (anti-usurpation) ; displayName calculé pour le titre.
    beforeChange: [setPartnerFromClient, enforcePartnerField(), setDisplayName],
  },
  fields: [
    {
      name: "client",
      type: "relationship",
      relationTo: "partner-clients",
      label: "Client",
      required: true,
      index: true,
      // Défini automatiquement par le drawer du champ `join` (contexte du client).
      // Verrouillé : un contact ne change pas d'entreprise cliente.
      admin: { readOnly: true },
    },
    {
      type: "row",
      fields: [
        {
          name: "firstName",
          type: "text",
          label: "Prénom",
          admin: { width: "50%", placeholder: "Saisissez le prénom" },
        },
        {
          name: "lastName",
          type: "text",
          label: "Nom",
          admin: { width: "50%", placeholder: "Saisissez le nom" },
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          // Profil de licence : c'est LUI qui décide du compte à créer et de la
          // ligne du devis. Une liste fermée, reprise de la grille tarifaire —
          // le dossier et la facturation ne peuvent donc pas diverger.
          name: "licenceProfile",
          type: "select",
          label: "Profil de licence",
          options: LICENCE_PROFILE_OPTIONS,
          admin: { description: "Décide du compte TIM créé pour cette personne." },
        },
        {
          // ── Accès au logiciel TIM ──────────────────────────────────────
          // Les comptes sont créés DANS TIM, pas ici : on ne stocke que ce que
          // le client doit pouvoir relire et imprimer pour ses équipes.
          // L'identifiant de connexion est l'adresse e-mail ci-dessus.
          name: "timPassword",
          type: "text",
          label: "Mot de passe TIM",
          hooks: {
            // Chiffré à l'écriture, masqué à la lecture — comme les accès de
            // test. Le masque doit revenir intact à l'écriture suivante, sinon
            // enregistrer la fiche sans y toucher remplacerait le mot de passe
            // par des points.
            beforeChange: [
              ({ value, originalDoc, req }) =>
                encryptPasswordValue(value, {
                  payload: req.payload,
                  id: originalDoc?.id,
                  // La cible est explicite : sans elle, le masque serait relu
                  // dans les accès de test et le mot de passe effacé.
                  collection: "client-contacts",
                  field: "timPassword",
                }),
            ],
            afterRead: [({ value }) => (value ? PASSWORD_MASK : value)],
          },
          admin: {
            readOnly: true,
            description:
              "Généré une fois puis FIGÉ : le client l'a distribué à ses équipes, le changer casserait des connexions.",
          },
        },
        {
          name: "role",
          type: "text",
          label: "Rôle",
          admin: { width: "50%", placeholder: "Saisissez le rôle" },
        },
        {
          name: "email",
          type: "email",
          label: "Adresse e-mail",
          admin: { width: "50%", placeholder: "Saisissez l'adresse e-mail" },
        },
      ],
    },
    {
      name: "phone",
      type: "text",
      label: "Numéro de téléphone",
      validate: validatePhone,
      admin: { placeholder: "+33 6 12 34 56 78" },
    },
    // Clé de scoping partenaire — dérivée du client, non éditable en UI.
    {
      name: "partner",
      type: "relationship",
      relationTo: "partners",
      admin: { hidden: true },
    },
    // Titre calculé (useAsTitle) — non éditable en UI.
    { name: "displayName", type: "text", admin: { hidden: true } },
  ],
};
