import type { CollectionBeforeDeleteHook, CollectionConfig, Field } from "payload";

import { isAdmin } from "@/core/access";
import { validatePlatform } from "@/modules/ads/lib/platforms";
import { PASSWORD_MASK, encryptPasswordValue } from "@/modules/marketing/lib/credential-secrets";

/**
 * Comptes publicitaires connectés (plan Publicité, §4.1) — un par compte chez
 * une régie (`act_…` chez Meta).
 *
 * DEUX jetons possibles (D11) :
 *  - `token`, le jeton OAuth longue durée. Meta ne donne pas de jeton de
 *    rafraîchissement : il vit ~60 jours (`tokenExpiresAt`), une alerte part à
 *    J-7 et le compte passe « Jeton expiré » à l'échéance. Écrit par la route
 *    OAuth seulement, jamais lisible par l'API, même pour un admin ;
 *  - `systemUserToken`, le jeton d'utilisateur système du Business Manager,
 *    collé à la main. Il n'expire pas, prime sur l'OAuth quand il est posé, et
 *    sera OBLIGATOIRE avant que les agents puissent écrire (phase 2). Chiffré à
 *    l'enregistrement, masqué à la lecture : on voit qu'il est posé, jamais sa
 *    valeur.
 *
 * Accès : admin seul (D1).
 */

/** Jeton écrit par une route serveur : ni lu ni écrit par l'API. */
const serverSecret = (name: string): Field =>
  ({
    name,
    type: "text",
    access: { read: () => false, create: () => false, update: () => false },
    admin: { hidden: true },
  }) as Field;

/**
 * Un compte se supprime AVEC ses campagnes et ses chiffres.
 *
 * Leur champ `account` est requis (colonne NOT NULL) et la clé étrangère est
 * `ON DELETE SET NULL` : sans ce nettoyage, Postgres refuse la suppression (même
 * piège que les fiches client, cf. PartnerClients). `req` transmis = même
 * transaction ; `overrideAccess` car ces collections sont en lecture seule.
 */
const deleteAccountChildren: CollectionBeforeDeleteHook = async ({ req, id }) => {
  for (const collection of ["ad-metrics-daily", "ad-campaigns"] as const) {
    const { errors } = await req.payload.delete({
      collection,
      where: { account: { equals: id } },
      overrideAccess: true,
      req,
    });
    if (errors?.length) {
      throw new Error(`Suppression impossible : ${errors.length} ${collection} n'ont pas pu être supprimés (${errors[0]?.message ?? "raison inconnue"}).`);
    }
  }
};

export const AD_ACCOUNT_STATUSES = [
  { label: "Sans jeton", value: "sans-jeton" },
  { label: "Connecté", value: "connecte" },
  { label: "Jeton expiré", value: "expire" },
  { label: "En erreur", value: "erreur" },
] as const;

export const AdAccounts: CollectionConfig = {
  slug: "ad-accounts",
  labels: { singular: "Compte publicitaire", plural: "Comptes publicitaires" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "platform", "externalId", "status", "lastSyncAt"],
    group: "Publicité",
    description:
      "Les comptes publicitaires dont le support lit les campagnes et les chiffres. Connexion par OAuth, ou par un jeton d'utilisateur système collé ici.",
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  disableDuplicate: true,
  hooks: { beforeDelete: [deleteAccountChildren] },
  // Un compte d'une régie ne se connecte qu'une fois.
  indexes: [{ fields: ["platform", "externalId"], unique: true }],
  fields: [
    {
      type: "row",
      fields: [
        { name: "name", type: "text", label: "Nom", required: true, admin: { width: "50%" } },
        {
          name: "externalId",
          type: "text",
          label: "Identifiant chez la régie",
          required: true,
          index: true,
          admin: { width: "50%", placeholder: "act_1234567890", description: "« act_… » chez Meta." },
        },
      ],
    },
    {
      // Texte validé par le registre des régies (D3) : pas de migration pour en ajouter une.
      name: "platform",
      type: "text",
      label: "Régie",
      required: true,
      defaultValue: "meta",
      index: true,
      validate: validatePlatform,
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "status",
      type: "select",
      label: "État",
      defaultValue: "sans-jeton",
      options: [...AD_ACCOUNT_STATUSES],
      index: true,
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "Constaté par la synchro et par la connexion, jamais saisi.",
      },
    },
    {
      name: "lastError",
      type: "textarea",
      label: "Dernière erreur",
      admin: {
        position: "sidebar",
        readOnly: true,
        condition: (data) => Boolean(data?.lastError),
      },
    },
    {
      name: "lastSyncAt",
      type: "date",
      label: "Dernière synchro réussie",
      admin: {
        position: "sidebar",
        readOnly: true,
        date: { pickerAppearance: "dayAndTime", displayFormat: "dd/MM/yyyy HH:mm" },
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "currency",
          type: "text",
          label: "Devise",
          defaultValue: "EUR",
          admin: { width: "33%", readOnly: true, description: "Lue à la connexion." },
        },
        {
          name: "timezone",
          type: "text",
          label: "Fuseau",
          admin: { width: "33%", readOnly: true, description: "Lu à la connexion : les jours de la régie sont ceux de ce fuseau." },
        },
        {
          name: "monthlyCapEur",
          type: "number",
          label: "Plafond mensuel (€)",
          min: 0,
          admin: {
            width: "34%",
            description: "Dépense publicitaire maximale du mois pour ce compte. Aucun agent ne le fait encore respecter (phase 2).",
          },
        },
      ],
    },
    {
      type: "collapsible",
      label: "Jetons",
      admin: { initCollapsed: false },
      fields: [
        {
          name: "tokenExpiresAt",
          type: "date",
          label: "Jeton OAuth valable jusqu'au",
          admin: {
            readOnly: true,
            date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" },
            description: "Posé à la connexion. Alerte à J-7 ; à l'échéance, il faut reconnecter le compte — ou poser un jeton d'utilisateur système.",
          },
        },
        {
          name: "systemUserToken",
          type: "text",
          label: "Jeton d'utilisateur système",
          hooks: {
            // Chiffré à l'enregistrement ; le masque renvoyé tel quel restitue la valeur stockée.
            beforeChange: [
              ({ value, req, originalDoc }) =>
                encryptPasswordValue(value, {
                  payload: req.payload,
                  id: originalDoc?.id,
                  collection: "ad-accounts",
                  field: "systemUserToken",
                }),
            ],
            // Jamais renvoyé : on sait qu'il est posé, pas ce qu'il vaut.
            afterRead: [({ value }) => (value ? PASSWORD_MASK : value)],
          },
          admin: {
            description:
              "Business Manager › Utilisateurs système › Générer un jeton (droit ads_read). Il n'expire pas et prime sur l'OAuth. Collez-le puis enregistrez : il est chiffré et ne sera plus jamais affiché. Obligatoire avant que les agents puissent écrire.",
          },
        },
      ],
    },
    serverSecret("token"),
    // Alerte J-7 déjà partie pour l'échéance en cours : une seule par échéance.
    { name: "tokenAlertSentAt", type: "date", admin: { hidden: true } },
  ],
};
