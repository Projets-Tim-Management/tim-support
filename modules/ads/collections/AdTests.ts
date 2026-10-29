import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { TEST_METRICS } from "@/modules/ads/lib/ab-verdict";
import { TEST_DIMENSIONS } from "@/modules/ads/lib/dimensions";

/**
 * Le registre des tests A/B (plan Publicité, §9 quinquies §4 et §9 nonies,
 * étape 4) — un test à la fois par campagne.
 *
 * L'analyste ouvre un test (une hypothèse, une seule dimension, des variantes =
 * des publicités en ligne) ; le CODE le juge à chaque synchro (lib/tests-run.ts)
 * et écrit verdict, probabilité et confiance ; l'analyste l'interprète ensuite.
 * Charlie peut modifier ou abandonner un test à la main.
 */
export const TEST_STATUSES = [
  { label: "En attente de volume", value: "en-attente-de-volume" },
  { label: "En cours", value: "en-cours" },
  { label: "Conclu", value: "conclu" },
  { label: "Sans verdict", value: "sans-verdict" },
  { label: "Abandonné", value: "abandonne" },
] as const;
export const OPEN_TEST_STATUSES = ["en-attente-de-volume", "en-cours"];

export const AdTests: CollectionConfig = {
  slug: "ad-tests",
  labels: { singular: "Test A/B", plural: "Tests A/B" },
  admin: {
    useAsTitle: "hypothesis",
    defaultColumns: ["openedAt", "campaign", "hypothesis", "metric", "status", "winner"],
    group: "Publicité",
    hidden: true,
  },
  access: { read: isAdmin, create: () => false, update: isAdmin, delete: () => false },
  defaultSort: "-openedAt",
  fields: [
    { name: "campaign", type: "relationship", relationTo: "ad-campaigns", label: "Campagne", required: true, index: true },
    { name: "run", type: "relationship", relationTo: "ad-agent-runs", label: "Ouvert par le passage" },
    { name: "hypothesis", type: "textarea", label: "Hypothèse", required: true },
    { name: "dimension", type: "select", label: "Ce qui change entre les variantes", options: [...TEST_DIMENSIONS, { label: "Page d'arrivée", value: "page" }, { label: "Audience", value: "audience" }], required: true },
    { name: "metric", type: "select", label: "Ce qui départage", options: [...TEST_METRICS], required: true },
    {
      name: "variants",
      type: "json",
      label: "Variantes",
      required: true,
      admin: { description: "[{ label, ads: [identifiants Meta], creatives: [identifiants] }]" },
    },
    {
      type: "row",
      fields: [
        { name: "minResults", type: "number", label: "Résultats minimum par variante", admin: { width: "33%" } },
        { name: "minDays", type: "number", label: "Jours minimum", admin: { width: "33%" } },
        { name: "maxDays", type: "number", label: "Jours maximum", admin: { width: "34%" } },
      ],
    },
    { name: "status", type: "select", label: "État", options: [...TEST_STATUSES], defaultValue: "en-attente-de-volume", required: true, index: true },
    { name: "reason", type: "text", label: "Où en est le test", admin: { readOnly: true } },
    { name: "results", type: "json", label: "Chiffres par variante", admin: { readOnly: true } },
    {
      type: "row",
      fields: [
        { name: "winner", type: "text", label: "Gagnant", admin: { width: "34%", readOnly: true } },
        { name: "probability", type: "number", label: "Probabilité qu'il le soit vraiment", admin: { width: "33%", readOnly: true } },
        {
          name: "confidence",
          type: "select",
          label: "Confiance",
          options: [
            { label: "Forte (95 % et plus)", value: "forte" },
            { label: "Moyenne (80 % et plus)", value: "moyenne" },
          ],
          admin: { width: "33%", readOnly: true },
        },
      ],
    },
    { name: "interpretation", type: "textarea", label: "Ce que l'analyste en retient" },
    {
      type: "row",
      fields: [
        { name: "openedAt", type: "date", label: "Ouvert le", required: true, admin: { width: "50%", date: { pickerAppearance: "dayAndTime" } } },
        { name: "closedAt", type: "date", label: "Clos le", admin: { width: "50%", date: { pickerAppearance: "dayAndTime" } } },
      ],
    },
  ],
};
