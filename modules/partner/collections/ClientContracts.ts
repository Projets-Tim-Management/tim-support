import type { CollectionConfig } from "payload";

import { metierScoped } from "@/core/access";
import { clientField, partnerField, setPartnerFromClient } from "@/modules/marketing/collections/clientOwned";
// Statuts : module pur (voir contract-status), lu aussi par les routes et l'admin.
import { CONTRACT_STATUSES } from "@/modules/partner/lib/contract-status";

/**
 * Les contrats d'un client — une ligne par VERSION.
 *
 * Cycle de vie :
 *   brouillon → envoyé (PDF figé, déposé dans l'espace client)
 *            → signé client (le client a signé en ligne ou déposé sa version signée)
 *            → signé (contresigné par TIM — étape 4)
 *   remplacé : une version plus récente a été signée ; annulé : abandonné.
 *
 * Tant qu'il est en BROUILLON, le contrat suit le modèle (page Système →
 * Contrat) et les données de la fiche, en direct ; sont stockés sur le contrat
 * ses conditions commerciales (`params`), les informations modifiées pour lui
 * seul (`variables`) et ses sections personnalisées (`overrides`). À l'ENVOI, le PDF
 * est généré une fois pour toutes et son empreinte conservée : c'est ce
 * document-là que le client signe, quoi qu'il arrive ensuite au modèle.
 *
 * Seul TIM crée, modifie et envoie (règle du 28/09/2026) ; le partenaire lit
 * l'historique de ses clients. Les écritures passent par les routes
 * /api/admin/contracts, jamais par l'API directe.
 */
export const ClientContracts: CollectionConfig = {
  slug: "client-contracts",
  labels: { singular: "Contrat client", plural: "Contrats clients" },
  admin: {
    useAsTitle: "reference",
    defaultColumns: ["reference", "status", "sentAt", "clientSignedAt"],
    // Consultés et gérés depuis la fiche client (onglet « Signature »).
    hidden: true,
  },
  disableDuplicate: true,
  // Aucune écriture par l'API directe, même pour un admin : statut, empreintes
  // et contresignature forment la preuve, et ne bougent que par les routes
  // /api/admin/contracts (qui écrivent en `overrideAccess`).
  access: {
    read: metierScoped(),
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  hooks: { beforeChange: [setPartnerFromClient] },
  fields: [
    clientField,
    partnerField,
    {
      type: "row",
      fields: [
        { name: "reference", type: "text", label: "Référence", admin: { width: "34%", readOnly: true } },
        { name: "version", type: "number", label: "Version", admin: { width: "33%", readOnly: true } },
        {
          name: "status",
          type: "select",
          label: "Statut",
          defaultValue: "brouillon",
          options: [...CONTRACT_STATUSES],
          admin: { width: "33%" },
        },
      ],
    },
    {
      name: "templateVersion",
      type: "number",
      label: "Version du modèle",
      admin: { readOnly: true, description: "Version du modèle (Système → Contrat) au moment de l'envoi." },
    },
    {
      // Conditions commerciales de CE contrat (durée d'engagement, tarif
      // préférentiel, frais d'intégration, territoire) — étape « Informations ».
      name: "params",
      type: "json",
      label: "Conditions commerciales",
      admin: { readOnly: true },
    },
    {
      // Valeurs saisies pour ce contrat à la place de celles de la fiche
      // (raison sociale, représentant…). La fiche, elle, ne change pas.
      name: "variables",
      type: "json",
      label: "Informations modifiées pour ce contrat",
      admin: { readOnly: true },
    },
    {
      name: "overrides",
      type: "array",
      label: "Sections personnalisées pour ce client",
      admin: { readOnly: true },
      fields: [
        { name: "key", type: "text", label: "Section" },
        { name: "body", type: "textarea", label: "Texte" },
      ],
    },
    { name: "pdf", type: "upload", relationTo: "media", label: "PDF envoyé", admin: { readOnly: true } },
    { name: "pdfHash", type: "text", label: "Empreinte SHA-256 du PDF envoyé", admin: { readOnly: true } },
    {
      type: "row",
      fields: [
        { name: "sentAt", type: "date", label: "Envoyé le", admin: { width: "50%", readOnly: true, date: { pickerAppearance: "dayAndTime" } } },
        { name: "sentBy", type: "relationship", relationTo: "users", label: "Envoyé par", admin: { width: "50%", readOnly: true } },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "clientSignedAt",
          type: "date",
          label: "Signé par le client le",
          admin: { width: "50%", readOnly: true, date: { pickerAppearance: "dayAndTime" } },
        },
        { name: "signedDocument", type: "upload", relationTo: "media", label: "PDF signé", admin: { width: "50%", readOnly: true } },
      ],
    },
    { name: "clientSignedHash", type: "text", label: "Empreinte SHA-256 du PDF signé par le client", admin: { readOnly: true } },
    {
      // Contresignature TIM : qui, quand, d'où, avec quel code (le code
      // lui-même n'est gardé qu'en empreinte, et effacé une fois utilisé).
      type: "collapsible",
      label: "Contresignature TIM",
      admin: { initCollapsed: true },
      fields: [
        {
          type: "row",
          fields: [
            { name: "countersignerFirstName", type: "text", label: "Prénom", admin: { width: "33%", readOnly: true } },
            { name: "countersignerLastName", type: "text", label: "Nom", admin: { width: "33%", readOnly: true } },
            { name: "countersignerRole", type: "text", label: "Fonction", admin: { width: "34%", readOnly: true } },
          ],
        },
        { name: "countersignerEmail", type: "email", label: "E-mail (code envoyé à)", admin: { readOnly: true } },
        { name: "countersignedBy", type: "relationship", relationTo: "users", label: "Contresigné par", admin: { readOnly: true } },
        { name: "countersignConsent", type: "textarea", label: "Consentement accepté", admin: { readOnly: true } },
        {
          type: "row",
          fields: [
            { name: "countersignCodeSentAt", type: "date", label: "Code envoyé le", admin: { width: "50%", readOnly: true, date: { pickerAppearance: "dayAndTime" } } },
            { name: "countersignedAt", type: "date", label: "Contresigné le", admin: { width: "50%", readOnly: true, date: { pickerAppearance: "dayAndTime" } } },
          ],
        },
        {
          type: "row",
          fields: [
            { name: "countersignIp", type: "text", label: "Adresse IP", admin: { width: "40%", readOnly: true } },
            { name: "countersignUserAgent", type: "text", label: "Navigateur", admin: { width: "60%", readOnly: true } },
          ],
        },
        { name: "countersignedDocument", type: "upload", relationTo: "media", label: "PDF signé par les deux parties", admin: { readOnly: true } },
        { name: "countersignedHash", type: "text", label: "Empreinte SHA-256 du PDF final", admin: { readOnly: true } },
        {
          name: "countersignCodeHash",
          type: "text",
          access: { read: () => false, create: () => false, update: () => false },
          admin: { hidden: true },
        },
        { name: "countersignCodeExpiresAt", type: "date", access: { read: () => false }, admin: { hidden: true } },
        { name: "countersignAttempts", type: "number", access: { read: () => false }, admin: { hidden: true } },
      ],
    },
  ],
};
