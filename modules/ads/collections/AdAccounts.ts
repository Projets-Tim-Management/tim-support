import type { CollectionBeforeChangeHook, CollectionBeforeDeleteHook, CollectionBeforeValidateHook, CollectionConfig, Field } from "payload";

import { isAdmin } from "@/core/access";
import { PURGE_CONTEXT, statusFromTokens } from "@/modules/ads/lib/accounts";
import { isAllowedAccount, refusal } from "@/modules/ads/lib/allowlist";
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
 * Un compte ne se supprime pas, il s'ARCHIVE (menu 3-points) : plus de synchro,
 * campagnes et chiffres conservés — on le reconnectera, et les agents auront
 * besoin de son historique. La suppression définitive est réservée au
 * super-admin, par une route qui annonce d'abord le nombre de lignes effacées ;
 * la suppression native est fermée à tous, liste comprise.
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
 * Suppression : seulement par la route de purge (contexte PURGE_CONTEXT), et
 * alors AVEC les campagnes et les chiffres du compte.
 *
 * Le refus ici est une deuxième barrière, derrière `access.delete` fermé : un
 * script ou un appel en `overrideAccess` qui supprimerait un compte effacerait
 * son historique sans que personne n'ait vu ce qu'il emportait.
 *
 * La cascade est nécessaire : `account` est requis (colonne NOT NULL) et la clé
 * étrangère est `ON DELETE SET NULL` — sans elle Postgres refuse (même piège que
 * les fiches client, cf. PartnerClients). `req` transmis = même transaction.
 */
const guardAndCascadeDelete: CollectionBeforeDeleteHook = async ({ req, id }) => {
  if (!req.context?.[PURGE_CONTEXT]) {
    throw new Error(
      "Un compte publicitaire s'archive, il ne se supprime pas : son historique sert à la reconnexion et aux agents. Suppression définitive : super-admin, menu « Supprimer définitivement ».",
    );
  }
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

/**
 * Un compte hors de META_ALLOWED_AD_ACCOUNTS n'entre pas — quel que soit le
 * chemin (OAuth, jeton système, API, script en overrideAccess).
 *
 * Seulement quand l'identifiant est POSÉ ou CHANGÉ : archiver un compte déjà
 * présent (le simulé, en production) doit rester possible, même hors liste.
 */
const enforceAllowlist: CollectionBeforeValidateHook = ({ data, originalDoc, operation }) => {
  const next = data?.externalId as string | undefined;
  const changes = operation === "create" || (next !== undefined && next !== originalDoc?.externalId);
  if (changes && !isAllowedAccount(next ?? originalDoc?.externalId)) throw new Error(refusal(next ?? originalDoc?.externalId));
  return data;
};

/**
 * Coller un jeton d'utilisateur système, c'est RECONNECTER le compte : il sort
 * de l'archive et l'état se recalcule d'après ses jetons (la synchro suivante
 * confirme). Le masque renvoyé tel quel n'est pas un nouveau jeton.
 */
const reconnectOnSystemToken: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const v = data?.systemUserToken;
  const fresh = typeof v === "string" && v.trim() !== "" && v !== PASSWORD_MASK;
  if (!fresh) return data;
  return {
    ...data,
    status: statusFromTokens({ systemUserToken: v, token: originalDoc?.token }, new Date()),
    lastError: null,
  };
};

export const AD_ACCOUNT_STATUSES = [
  { label: "Sans jeton", value: "sans-jeton" },
  { label: "Connecté", value: "connecte" },
  { label: "Jeton expiré", value: "expire" },
  { label: "En erreur", value: "erreur" },
  // Un geste humain, pas un constat : seul l'état que la synchro ne réécrit pas.
  { label: "Archivé", value: "archive" },
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
    components: {
      // Brancher un compte (OAuth ou jeton système) et choisir parmi ceux qu'ouvre le jeton.
      beforeListTable: ["/modules/ads/admin/ConnectMetaPanel#ConnectMetaPanel"],
      edit: {
        // Monté en permanence : un modal ouvert depuis le menu disparaîtrait avec lui.
        beforeDocumentControls: ["/modules/ads/admin/PurgeAccountModal#PurgeAccountModal"],
        editMenuItems: ["/modules/ads/admin/AdAccountEditMenu#AdAccountEditMenu"],
      },
    },
  },
  // Suppression fermée à tous : elle passe par la route de purge (super-admin).
  // Création : jamais par le formulaire natif, qui enregistrerait un compte sans
  // rien vérifier. Elle passe par « Connecter avec un jeton d'utilisateur
  // système » (Meta confirme que le jeton ouvre le compte) ou par l'OAuth.
  // Suppression : route de purge, super-admin.
  access: { read: isAdmin, create: () => false, update: isAdmin, delete: () => false },
  disableDuplicate: true,
  hooks: { beforeValidate: [enforceAllowlist], beforeChange: [reconnectOnSystemToken], beforeDelete: [guardAndCascadeDelete] },
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
          // L'identité du compte : posée à la connexion, jamais modifiée ensuite.
          admin: { width: "50%", readOnly: true, description: "« act_… » chez Meta. Posé à la connexion." },
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
        description: "Constaté par la synchro et par la connexion, jamais saisi. « Archivé » se pose et se retire par le menu ⋯.",
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
