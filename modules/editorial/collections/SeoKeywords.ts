import type { CollectionConfig, Endpoint } from "payload";

import { hasAdminRole, isAdmin } from "@/core/access";

/**
 * LES REQUÊTES SUIVIES (Éditorial › Requêtes suivies, 19/11/2026) : ce que Google affiche
 * VRAIMENT sur nos requêtes, relevé par DataForSEO, pour les agents SEO/GEO.
 *
 * - Suivies chaque semaine (case « Suivie ») : notre position dans le top 20, le n° 1, la
 *   réponse IA de Google (affichée ? qui cite-t-elle ? nous ?), et l'historique.
 * - Chaque mois : volume, difficulté, intention ; nos requêtes classées ; nos concurrents
 *   réels ; les OPPORTUNITÉS (requêtes où des concurrents sont dans le top 10 et pas nous).
 * - Pages clés du site : leur requête cible et leur couverture face au top 10 (comparateur).
 * Pré-remplie par le code (articles, pages, opportunités) ; la direction et les agents en
 * ajoutent ou décochent. Coût : budget « seo » (≈ 4 $ par mois).
 */

const SOURCES = [
  { label: "Article", value: "article" },
  { label: "Fiche métier", value: "fiche" },
  { label: "Page du site", value: "page" },
  { label: "Requête où l'on est classé", value: "classee" },
  { label: "Opportunité (concurrents)", value: "opportunite" },
  { label: "Ajoutée à la main", value: "manuel" },
  { label: "Proposée par un agent", value: "agent" },
];

const run = (what: "track" | "monthly"): Endpoint => ({
  path: what === "track" ? "/track" : "/monthly",
  method: "post",
  handler: async (req) => {
    if (!hasAdminRole(req.user)) return Response.json({ error: "Réservé aux administrateurs." }, { status: 403 });
    const m = await import("@/modules/editorial/lib/seo/tracking");
    try {
      return Response.json(what === "track" ? await m.trackDue(req.payload, { limit: 10 }) : await m.runMonthlyLabs(req.payload, { force: true }));
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
  },
});

export const SeoKeywords: CollectionConfig = {
  slug: "seo-keywords",
  labels: { singular: "Requête suivie", plural: "Requêtes suivies" },
  admin: {
    useAsTitle: "keyword",
    defaultColumns: ["keyword", "source", "position", "positionChange", "volume", "difficulty", "aiOverview", "aiCited", "top1Domain", "checkedAt"],
    group: "Éditorial",
    description: "Ce que Google affiche sur nos requêtes : notre position, le n° 1, la réponse IA et ses sources. Relevé chaque semaine (DataForSEO). Les opportunités viennent des requêtes de nos concurrents.",
    listSearchableFields: ["keyword", "targetUrl"],
    components: { beforeListTable: ["/modules/editorial/admin/SeoKeywordsHeader#SeoKeywordsHeader"] },
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  defaultSort: "-volume",
  endpoints: [run("track"), run("monthly")],
  fields: [
    { name: "keyword", type: "text", label: "Requête", required: true },
    { name: "keywordKey", type: "text", unique: true, index: true, admin: { hidden: true } },
    { name: "source", type: "select", label: "Origine", options: SOURCES, defaultValue: "manuel", index: true },
    { name: "tracked", type: "checkbox", label: "Suivie chaque semaine", defaultValue: true, index: true },
    { name: "targetUrl", type: "text", label: "Notre page visée", admin: { description: "La page qui doit se classer sur cette requête." } },
    {
      type: "row",
      fields: [
        { name: "position", type: "number", label: "Position", index: true, admin: { readOnly: true, description: "Dans le top 20 de google.fr ; vide = absent." } },
        { name: "positionChange", type: "number", label: "Évolution", admin: { readOnly: true, description: "Places gagnées (+) ou perdues (−) depuis le relevé précédent." } },
        { name: "bestPosition", type: "number", label: "Meilleure position", admin: { readOnly: true } },
      ],
    },
    { name: "positionUrl", type: "text", label: "Notre page classée", admin: { readOnly: true } },
    {
      type: "row",
      fields: [
        { name: "volume", type: "number", label: "Recherches / mois", index: true, admin: { readOnly: true } },
        { name: "difficulty", type: "number", label: "Difficulté (0-100)", admin: { readOnly: true } },
        { name: "intent", type: "text", label: "Intention", admin: { readOnly: true } },
        { name: "cpc", type: "number", label: "CPC ($)", admin: { readOnly: true } },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "top1Domain", type: "text", label: "N° 1", admin: { readOnly: true } },
        { name: "aiOverview", type: "checkbox", label: "Réponse IA de Google", admin: { readOnly: true } },
        { name: "aiCited", type: "checkbox", label: "Nous y sommes cités", admin: { readOnly: true } },
      ],
    },
    { name: "aiSources", type: "json", label: "Sources citées par la réponse IA", admin: { readOnly: true } },
    { name: "top10", type: "json", label: "Top 10 (rang, domaine, titre)", admin: { readOnly: true } },
    { name: "competitorsRanking", type: "json", label: "Concurrents classés (opportunités)", admin: { readOnly: true } },
    { name: "coverage", type: "number", label: "Couverture de notre page (%)", admin: { readOnly: true, description: "Pages du site : ressemblance au top 10 (termes, entités, questions)." } },
    { name: "coverageTarget", type: "number", label: "Cible de couverture (%)", admin: { readOnly: true } },
    { name: "coverageGaps", type: "json", label: "Ce qui manque à notre page", admin: { readOnly: true } },
    { name: "checkedAt", type: "date", label: "Relevé le", index: true, admin: { readOnly: true } },
    { name: "pageCheckedAt", type: "date", admin: { hidden: true } },
    { name: "metricsAt", type: "date", admin: { hidden: true } },
    { name: "history", type: "json", label: "Historique (date, position, réponse IA, citée)", admin: { readOnly: true } },
    { name: "serp", type: "json", admin: { hidden: true } },
    { name: "notes", type: "textarea", label: "Notes" },
  ],
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (data?.keyword) {
          data.keyword = String(data.keyword).trim().toLowerCase();
          data.keywordKey = data.keyword
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .replace(/\s+/g, " ");
        }
        return data;
      },
    ],
  },
};
