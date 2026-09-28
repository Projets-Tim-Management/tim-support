import type { CollectionConfig, Field } from "payload";

import { isAdmin, metierScoped } from "@/core/access";
import { clientField, partnerField, setPartnerFromClient } from "@/modules/marketing/collections/clientOwned";

/**
 * Signatures électroniques du devis et du contrat — le DOSSIER DE PREUVE.
 *
 * Une ligne par tentative : elle naît « en attente » quand le client demande
 * son code, passe « signée » quand il le saisit. Tout ce qui fonde la valeur
 * d'une signature simple (règlement eIDAS, Code civil art. 1366-1367) est
 * ici : qui (nom, fonction, e-mail), quoi (empreinte SHA-256 du document
 * exact), comment (code à usage unique envoyé à cette adresse, consentement
 * explicite), quand et d'où (horodatage, IP, navigateur), et le PDF signé
 * produit, avec sa propre empreinte.
 *
 * Personne n'écrit ici par l'API — ni client, ni partenaire, ni admin : seules
 * les routes de signature le font, en `overrideAccess`. Une preuve qu'on peut
 * retoucher n'en est plus une. Le partenaire LIT celles de ses clients (fiche,
 * onglet « Signature »).
 */

/** Champs de sécurité : jamais lus ni écrits par l'API (voir ClientPortalAccounts). */
const secret = (name: string, type: "text" | "number" | "date"): Field =>
  ({
    name,
    type,
    access: { read: () => false, create: () => false, update: () => false },
    admin: { hidden: true },
  }) as Field;

export const SIGNATURE_KINDS = [
  { label: "Devis", value: "devis" },
  { label: "Contrat", value: "contrat" },
] as const;

export const ElectronicSignatures: CollectionConfig = {
  slug: "electronic-signatures",
  labels: { singular: "Signature électronique", plural: "Signatures électroniques" },
  admin: {
    useAsTitle: "displayName",
    defaultColumns: ["kind", "status", "signerLastName", "signedAt"],
    // Consultées depuis la fiche client (onglet « Signature »), pas du menu.
    hidden: true,
  },
  disableDuplicate: true,
  access: {
    read: metierScoped(),
    create: () => false,
    update: () => false,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [
      setPartnerFromClient,
      // Les mises à jour partielles (essais, expiration) n'apportent que le
      // champ modifié : le reste vient du document existant.
      ({ data, originalDoc }) => {
        const pick = (k: string) => (data?.[k] !== undefined ? data[k] : originalDoc?.[k]);
        const who = [pick("signerFirstName"), pick("signerLastName")].filter(Boolean).join(" ");
        const kind = SIGNATURE_KINDS.find((k) => k.value === pick("kind"))?.label ?? "Document";
        return { ...data, displayName: `${kind} — ${who || "signataire"}` };
      },
    ],
  },
  fields: [
    clientField,
    partnerField,
    { name: "displayName", type: "text", admin: { hidden: true } },
    {
      type: "row",
      fields: [
        { name: "kind", type: "select", label: "Document", options: [...SIGNATURE_KINDS], required: true, admin: { width: "50%" } },
        {
          name: "status",
          type: "select",
          label: "État",
          defaultValue: "en-attente",
          options: [
            { label: "En attente du code", value: "en-attente" },
            { label: "Signé", value: "signe" },
            { label: "Expiré", value: "expire" },
          ],
          admin: { width: "50%" },
        },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "signerFirstName", type: "text", label: "Prénom", admin: { width: "33%" } },
        { name: "signerLastName", type: "text", label: "Nom", admin: { width: "33%" } },
        { name: "signerRole", type: "text", label: "Fonction", admin: { width: "34%" } },
      ],
    },
    { name: "signerEmail", type: "email", label: "E-mail du signataire (code envoyé à)" },
    { name: "consentText", type: "textarea", label: "Consentement affiché et accepté" },
    { name: "documentOriginal", type: "upload", relationTo: "media", label: "Document présenté" },
    { name: "documentHash", type: "text", label: "Empreinte SHA-256 du document présenté" },
    {
      // Chaque page confirmée une à une par le signataire (paraphe, et
      // signature sur les pages qui la portent), horodatée par son navigateur.
      name: "pageConfirmations",
      type: "json",
      label: "Pages paraphées",
    },
    {
      type: "row",
      fields: [
        { name: "codeSentAt", type: "date", label: "Code envoyé le", admin: { width: "50%", date: { pickerAppearance: "dayAndTime" } } },
        { name: "signedAt", type: "date", label: "Signé le", admin: { width: "50%", date: { pickerAppearance: "dayAndTime" } } },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "ip", type: "text", label: "Adresse IP", admin: { width: "40%" } },
        { name: "userAgent", type: "text", label: "Navigateur", admin: { width: "60%" } },
      ],
    },
    { name: "signedDocument", type: "upload", relationTo: "media", label: "PDF signé (avec certificat)" },
    { name: "signedHash", type: "text", label: "Empreinte SHA-256 du PDF signé" },
    secret("codeHash", "text"),
    secret("codeExpiresAt", "date"),
    secret("attempts", "number"),
  ],
};
