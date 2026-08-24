import type { CollectionConfig, Field } from "payload";

import { isAdmin, metierScoped } from "@/core/access";
import { clientField, partnerField, setPartnerFromClient } from "@/modules/marketing/collections/clientOwned";
import { armAutoStep } from "@/modules/marketing/lib/auto-steps";
import { sendJourneyEmailForClient } from "@/modules/marketing/lib/send";

/**
 * Comptes de l'espace client — un par entreprise cliente en phase de test.
 *
 * Créés UNIQUEMENT par un admin (règle métier explicite : c'est TIM qui ouvre
 * les accès de test). Le partenaire les VOIT sur ses clients (il doit savoir si
 * son client peut se connecter) mais ne peut ni en créer, ni en modifier.
 *
 * Aucun mot de passe : la connexion se fait par code à usage unique envoyé par
 * e-mail (voir lib/portal-auth.ts). Les champs de sécurité ci-dessous ne sont
 * lisibles par PERSONNE via l'API — ni admin, ni partenaire : un code, même
 * haché, et un compteur de tentatives n'ont aucune raison de circuler.
 */

/**
 * Champs de sécurité : écrits par les routes d'auth (en `overrideAccess`),
 * jamais lus ni écrits via l'API — ni par un admin, ni par un partenaire. Un
 * code, même haché, et un compteur de tentatives n'ont aucune raison de sortir.
 *
 * Le `as Field` est nécessaire : le type d'un champ Payload est une union
 * discriminée par `type`, qu'un paramètre élargi en `"text" | "number" | "date"`
 * ne peut pas satisfaire.
 */
const secret = (name: string, type: "text" | "number" | "date"): Field =>
  ({
    name,
    type,
    access: { read: () => false, create: () => false, update: () => false },
    admin: { hidden: true },
  }) as Field;

export const ClientPortalAccounts: CollectionConfig = {
  slug: "client-portal-accounts",
  labels: { singular: "Accès espace client", plural: "Accès espace client" },
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "client", "active", "lastLoginAt"],
    // Géré depuis la fiche client (encart dédié) → hors du menu latéral.
    hidden: true,
  },
  disableDuplicate: true,
  access: {
    // Lecture : admin partout, partenaire-métier sur ses propres clients.
    read: metierScoped(),
    // Création/modification/suppression : admins seulement (règle métier).
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [setPartnerFromClient],
    // L'OUVERTURE de l'accès (« Accès actif » qui passe à oui) est l'étape
    // « Création du compte espace client », et elle envoie l'invitation.
    //
    // La ligne, elle, naît AVANT : dès le démarrage de la phase de test, parce
    // qu'elle porte l'adresse à laquelle part toute la séquence (voir
    // buildJourneyContext). Elle est alors inactive — l'adresse est connue, le
    // client n'est pas encore prévenu et ne peut pas demander de code. C'est le
    // Go/No-Go de TIM qui l'active.
    afterChange: [
      async ({ doc, previousDoc, operation, req }) => {
        const client = doc?.client;
        const clientId = (typeof client === "object" ? (client as { id?: unknown })?.id : client) as
          | number
          | string
          | undefined;
        if (clientId == null) return doc;

        // Le fait, c'est l'accès ACTIF : à la création s'il l'est déjà, sinon au
        // moment où on l'active. Une modification d'adresse ou de nom ne
        // réinvite personne.
        const opened =
          doc?.active !== false &&
          (operation === "create" || previousDoc?.active === false);
        if (!opened) return doc;

        await armAutoStep(req.payload, clientId, "compte-espace-client", req);

        // PREMIER message du parcours : sans lui, le client dispose d'un espace
        // dont il ignore l'existence. L'échec est silencieux côté métier — un
        // serveur SMTP qui tousse ne doit pas empêcher l'ouverture de l'accès —
        // mais il est TRACÉ : un accès ouvert dont l'invitation n'est pas partie
        // est le pire des états, tout a l'air fait et le client n'a rien reçu.
        const sent = await sendJourneyEmailForClient(req.payload, clientId, "invitation-espace-client");
        if (!sent.sent) {
          req.payload.logger.warn(
            `[parcours] accès espace client ${doc?.email} ouvert, mais invitation NON envoyée (${sent.reason}).`,
          );
        }
        return doc;
      },
    ],
  },
  fields: [
    clientField,
    {
      name: "email",
      type: "email",
      label: "Adresse e-mail",
      required: true,
      unique: true,
      index: true,
      admin: { description: "C'est l'identifiant : le code de connexion y est envoyé." },
    },
    {
      type: "row",
      fields: [
        { name: "firstName", type: "text", label: "Prénom", admin: { width: "50%" } },
        { name: "lastName", type: "text", label: "Nom", admin: { width: "50%" } },
      ],
    },
    {
      name: "active",
      type: "checkbox",
      label: "Accès actif",
      defaultValue: true,
      admin: {
        description:
          "Décoché = le client ne peut pas demander de code. C'est la case qui OUVRE l'espace : la cocher envoie l'invitation (une seule fois) et coche l'étape du parcours. Elle se coche d'elle-même à la validation du Go/No-Go.",
      },
    },
    {
      name: "lastLoginAt",
      type: "date",
      label: "Dernière connexion",
      admin: {
        readOnly: true,
        date: { pickerAppearance: "dayAndTime", displayFormat: "dd/MM/yyyy HH:mm" },
      },
    },

    // ─── Sécurité (non lisibles par l'API) ───────────────────────────────────
    secret("codeHash", "text"),
    secret("codeExpiresAt", "date"),
    secret("codeAttempts", "number"),
    secret("requestCount", "number"),
    secret("requestWindowStart", "date"),

    partnerField,
  ],
};
