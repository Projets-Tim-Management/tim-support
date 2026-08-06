import type { CollectionConfig, Condition } from "payload";

import {
  adminOnlyField,
  adminOnlyFieldRead,
  canReadCatalog,
  catalogAccess,
  hasAdminRole,
} from "@/core/access";
import { slugField } from "@/core/fields/slug";

/**
 * Récompenses — catalogue de lots échangeables contre des points
 * (CPT `reward` côté WP).
 */

/**
 * Onglet réservé à TIM : le partenaire ne doit pas voir ce que la récompense
 * nous coûte. Deux verrous, pas un seul —
 *  - `condition` masque l'onglet dans l'interface ;
 *  - le field-level access ci-dessous empêche la valeur de sortir par l'API,
 *    ce qui est la vraie garantie (une condition n'est qu'un affichage).
 */
const adminOnlyTab: Condition = (_data, _siblingData, { user }) => hasAdminRole(user);
export const Rewards: CollectionConfig = {
  slug: "rewards",
  labels: { singular: "Récompense", plural: "Récompenses" },
  // Même ordre que le catalogue partenaire : les plus chères d'abord.
  defaultSort: "-cost",
  admin: {
    useAsTitle: "title",
    // `purchasePrice` n'apparaît que pour les admins : son field-level access
    // écarte la colonne pour les autres rôles.
    defaultColumns: ["title", "cost", "purchasePrice", "stock"],
    group: "Partenaires",
    components: {
      // Catalogue + commande pour le partenaire-utilisateur (l'admin garde le tableau).
      beforeListTable: ["/modules/partner/admin/RewardsCatalog#default"],
    },
  },
  // Catalogue : lecture admins + partenaires-utilisateurs, écriture admins.
  access: catalogAccess(canReadCatalog),
  fields: [
    { name: "title", type: "text", label: "Titre", required: true },
    slugField("title"),
    {
      // Onglets NON nommés : les champs restent au premier niveau du document
      // (aucun changement de structure des données, juste un regroupement d'UI).
      type: "tabs",
      tabs: [
        {
          label: "Récompense",
          fields: [{ name: "description", type: "richText", label: "Description" }],
        },
        {
          label: "Interne (TIM)",
          admin: { condition: adminOnlyTab },
          fields: [
            {
              name: "purchasePrice",
              type: "number",
              label: "Prix d'achat (€ TTC)",
              min: 0,
              admin: {
                description:
                  "Ce que la récompense coûte à TIM. Jamais visible par un partenaire.",
                placeholder: "Ex. 149",
                step: 0.01,
                // Modifiable directement dans le tableau (cellule éditable).
                components: {
                  Cell: {
                    path: "/admin/fields/EditableNumberCell#EditableNumberCell",
                    clientProps: { suffix: "€" },
                  },
                },
              },
              access: { read: adminOnlyFieldRead, update: adminOnlyField },
            },
            {
              name: "supplier",
              type: "text",
              label: "Fournisseur / référence",
              admin: { placeholder: "Où et sous quelle référence l'acheter" },
              access: { read: adminOnlyFieldRead, update: adminOnlyField },
            },
          ],
        },
      ],
    },
    {
      name: "image",
      type: "upload",
      relationTo: "media",
      label: "Visuel",
      admin: { position: "sidebar", components: { Field: "/admin/fields/DirectUpload#default" } },
    },
    {
      name: "cost",
      type: "number",
      label: "Coût (points)",
      required: true,
      min: 0,
      admin: {
        // Modifiable directement dans le tableau (cellule éditable).
        components: {
          Cell: {
            path: "/admin/fields/EditableNumberCell#EditableNumberCell",
            clientProps: { suffix: "pts" },
          },
        },
      },
    },
    {
      name: "stock",
      type: "number",
      label: "Stock",
      defaultValue: -1,
      admin: {
        position: "sidebar",
        description: "-1 = illimité, 0 = épuisé (masqué du catalogue).",
        // Dans la LISTE : cellule éditable (− / + / ∞), pour ajuster un stock
        // sans ouvrir la fiche. La fiche garde le champ nombre standard.
        components: { Cell: "/modules/partner/admin/RewardStockCell#RewardStockCell" },
      },
    },
  ],
};
