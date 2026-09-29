import type { Access, CollectionBeforeChangeHook, CollectionConfig, FieldAccess } from "payload";

import { isAdmin } from "@/core/access";
import { CTA_OPTIONS } from "@/modules/ads/lib/cta";
import { DEFAULT_TONE, TONES } from "@/modules/ads/lib/dimensions";
import { validatePlatform } from "@/modules/ads/lib/platforms";

/**
 * Campagnes (plan Publicité, §4.2 et §9 ter).
 *
 * Deux natures sur un seul enregistrement :
 *  - le MIROIR de la régie (état, budget, chiffres), écrit par la synchro
 *    seule. Ces champs sont verrouillés un par un : un budget modifiable ici
 *    sans être envoyé chez la régie ferait croire à une action qui n'a pas lieu ;
 *  - le BRIEF, qui est à nous : cible, douleur, offre, promesse, preuves,
 *    interdits, page d'arrivée, bouton, ton. Il se rédige AVANT que la campagne
 *    existe chez Meta — d'où la campagne `brouillon`, créée dans le support sans
 *    identifiant chez la régie (décision du 29/09/2026). En phase 3b, la
 *    publication posera l'identifiant sur ce même enregistrement : pas de
 *    doublon, et le brief reste attaché à ses chiffres.
 */

export const OBJECTIVES = [
  { label: "Leads", value: "leads" },
  { label: "Trafic", value: "trafic" },
  { label: "Notoriété", value: "notoriete" },
  { label: "Autre", value: "autre" },
] as const;

export const CAMPAIGN_STATUSES = [
  { label: "Brouillon", value: "brouillon" },
  { label: "Active", value: "active" },
  { label: "En pause", value: "en-pause" },
  { label: "Terminée", value: "terminee" },
] as const;

/** Champ du miroir : jamais écrit par l'API, seulement par la synchro (overrideAccess). */
const mirror = { create: () => false, update: () => false };

/** Modifiable à la création et tant que la campagne est un brouillon : ensuite, c'est la régie qui fait foi. */
const whileDraft: FieldAccess = ({ doc }) => !doc || doc.status === "brouillon";

/** Seul un brouillon se supprime : une campagne lue chez la régie porte des chiffres. */
const deleteDraftsOnly: Access = ({ req: { user } }) =>
  isAdmin({ req: { user } } as never) ? { status: { equals: "brouillon" } } : false;

/**
 * Une campagne créée dans le support est un brouillon, sans identifiant chez la
 * régie. La synchro, elle, crée toujours avec un identifiant : elle n'est pas
 * concernée.
 */
const draftOnCreate: CollectionBeforeChangeHook = ({ data, operation }) =>
  operation === "create" && !data?.externalId ? { ...data, status: "brouillon", platform: data?.platform || "meta" } : data;

const LANDING = /^https:\/\/[^\s/]+\.[^\s]+$/i;

export const AdCampaigns: CollectionConfig = {
  slug: "ad-campaigns",
  labels: { singular: "Campagne", plural: "Campagnes" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "status", "account", "kpis", "dailyBudget", "lastSyncAt"],
    group: "Publicité",
    description:
      "Les campagnes : celles lues chez les régies (mises à jour chaque nuit, chiffres en lecture seule) et les brouillons préparés ici, avec leur brief.",
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: deleteDraftsOnly },
  disableDuplicate: true,
  defaultSort: "-updatedAt",
  hooks: { beforeChange: [draftOnCreate] },
  indexes: [{ fields: ["platform", "externalId"], unique: true }],
  fields: [
    { name: "name", type: "text", label: "Nom", required: true, access: { update: whileDraft } },
    {
      type: "tabs",
      tabs: [
        {
          label: "Brief",
          description: "Ce que la génération de créas lit. À nous, modifiable à tout moment.",
          fields: [
            {
              name: "generate",
              type: "ui",
              admin: { components: { Field: "/modules/ads/admin/GenerateCreatives#GenerateCreatives" } },
            },
            {
              name: "brief",
              type: "group",
              label: false,
              fields: [
                { name: "audience", type: "textarea", label: "Cible", admin: { placeholder: "Conducteurs de travaux et gérants de PME du BTP, 11 à 100 salariés, France" } },
                { name: "pain", type: "textarea", label: "Douleur", admin: { placeholder: "Dans les mots du client : « le pointage papier me coûte 2 h par semaine »" } },
                { name: "offer", type: "textarea", label: "Offre", admin: { placeholder: "Démo de 30 minutes, sans engagement", description: "Les chiffres écrits ici (durées, prix) sont autorisés dans les textes." } },
                { name: "promise", type: "textarea", label: "Promesse", admin: { description: "Ce qui change après — vérifiable." } },
                {
                  name: "proofs",
                  type: "relationship",
                  relationTo: "ad-facts",
                  hasMany: true,
                  label: "Preuves autorisées",
                  filterOptions: { active: { equals: true } },
                  admin: { description: "Les seuls chiffres que les textes pourront citer, avec l'offre." },
                },
                { name: "forbidden", type: "textarea", label: "Interdits de cette campagne", admin: { description: "Un par ligne. S'ajoutent à ceux du kit de marque." } },
                {
                  type: "row",
                  fields: [
                    {
                      name: "landingUrl",
                      type: "text",
                      label: "Page d'arrivée",
                      validate: (v: unknown) => (!v || LANDING.test(String(v).trim()) ? true : "Une adresse complète en https://"),
                      admin: {
                        width: "60%",
                        placeholder: "https://tim-management.co/…",
                        description: "Les paramètres d'URL obligatoires sont ajoutés au téléchargement (plan, §4.8).",
                      },
                    },
                    { name: "cta", type: "select", label: "Bouton d'action", options: CTA_OPTIONS, defaultValue: "en-savoir-plus", admin: { width: "20%" } },
                    {
                      name: "tone",
                      type: "select",
                      label: "Ton",
                      options: [...TONES],
                      defaultValue: DEFAULT_TONE,
                      admin: { width: "20%", description: "Le tutoiement : en test étiqueté seulement." },
                    },
                  ],
                },
                {
                  name: "angles",
                  type: "array",
                  label: "Angles souhaités",
                  labels: { singular: "Angle", plural: "Angles" },
                  admin: { description: "Facultatif. Vide, trois angles sont proposés." },
                  fields: [{ name: "angle", type: "text", required: true }],
                },
              ],
            },
          ],
        },
        {
          label: "Chez la régie",
          description: "Lu chez la régie par la synchro. Ne se modifie pas ici.",
          fields: [
            {
              type: "row",
              fields: [
                { name: "account", type: "relationship", relationTo: "ad-accounts", label: "Compte", index: true, access: { update: whileDraft }, admin: { width: "50%" } },
                { name: "externalId", type: "text", label: "Identifiant chez la régie", index: true, access: mirror, admin: { width: "50%", readOnly: true } },
              ],
            },
            {
              type: "row",
              fields: [
                { name: "status", type: "select", label: "État", options: [...CAMPAIGN_STATUSES], defaultValue: "brouillon", index: true, access: mirror, admin: { width: "33%", readOnly: true } },
                { name: "objective", type: "select", label: "Objectif", options: [...OBJECTIVES], access: { update: whileDraft }, admin: { width: "33%" } },
                {
                  name: "dailyBudget",
                  type: "number",
                  label: "Budget quotidien",
                  access: mirror,
                  admin: { width: "34%", readOnly: true, description: "En devise du compte, lu chez la régie." },
                },
              ],
            },
            { name: "externalStatus", type: "text", label: "État chez la régie (brut)", access: mirror, admin: { readOnly: true } },
            {
              name: "lastSyncAt",
              type: "date",
              label: "Dernière synchro",
              access: mirror,
              admin: { readOnly: true, date: { pickerAppearance: "dayAndTime", displayFormat: "dd/MM/yyyy HH:mm" } },
            },
          ],
        },
      ],
    },
    {
      // Copie de la régie du compte : une clé d'unicité ne traverse pas une relation.
      name: "platform",
      type: "text",
      label: "Régie",
      required: true,
      defaultValue: "meta",
      index: true,
      validate: validatePlatform,
      // Posée à la création (défaut « meta », ou par la synchro), jamais changée ensuite.
      access: { update: () => false },
      admin: { position: "sidebar", readOnly: true },
    },
    // Derniers chiffres consolidés par la synchro : la colonne « 7 derniers jours »
    // de la liste. Absent du formulaire (un bloc de JSON n'y apprendrait rien).
    {
      name: "kpis",
      type: "json",
      label: "7 derniers jours",
      access: mirror,
      admin: { condition: () => false, components: { Cell: "/modules/ads/admin/CampaignKpisCell#CampaignKpisCell" } },
    },
  ],
};
