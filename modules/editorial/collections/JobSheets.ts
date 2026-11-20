import type { CollectionConfig, Endpoint } from "payload";

import { hasAdminRole, isAdmin } from "@/core/access";
import { JOB_STATUSES } from "@/modules/editorial/lib/jobs/statuses";

/**
 * LES FICHES MÉTIER DE LA VITRINE (étape 9, décisions de Charlie du 18/11/2026).
 *
 * - Les 44 fiches publiées (CPT `metier`) sont importées et synchronisées chaque
 *   heure depuis WordPress, comme les articles (WordPress fait foi).
 * - L'équipe décide SEULE des nouvelles fiches : 4 par mois (une par semaine),
 *   publiées SANS relecture une fois le contrôle strict passé (chiffres venus de
 *   France Travail uniquement, capsules de 40 à 60 mots, marque « TIM Management »…).
 * - Les CHIFFRES France Travail affichés dans une fiche (salaires, offres,
 *   demandeurs, tension) sont rafraîchis UNE FOIS PAR AN, fiche par fiche, à sa
 *   date anniversaire : jamais toutes en même temps. Les textes ne bougent pas.
 * - Les clics Google, la position et les visites (Search Console, GA4) sont
 *   relevés chaque lundi, comme pour les articles : rien n'est écrit dans WordPress.
 */


const syncEndpoint: Endpoint = {
  path: "/sync",
  method: "post",
  handler: async (req) => {
    if (!hasAdminRole(req.user)) return Response.json({ error: "Réservé aux administrateurs." }, { status: 403 });
    const { syncJobSheetsFromWordPress } = await import("@/modules/editorial/lib/jobs/sync");
    try {
      return Response.json(await syncJobSheetsFromWordPress(req.payload, { full: new URL(req.url ?? "http://x").searchParams.get("full") === "1" }));
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Synchronisation impossible." }, { status: 502 });
    }
  },
};

/** Enregistre les modifications faites dans le tiroir (étape 3), puis recalcule la note. */
const contentEndpoint = (kind: "articles" | "job-sheets"): Endpoint => ({
  path: "/:id/content",
  method: "post",
  handler: async (req) => {
    if (!hasAdminRole(req.user)) return Response.json({ error: "Réservé aux administrateurs." }, { status: 403 });
    const id = String(req.routeParams?.id ?? "");
    const body = (await req.json?.().catch(() => null)) as Record<string, unknown> | null;
    const { saveArticleEdits, saveJobEdits, SaveError } = await import("@/modules/editorial/lib/score/save");
    try {
      const score = kind === "articles" ? await saveArticleEdits(req.payload, id, (body ?? {}) as never) : await saveJobEdits(req.payload, id, (body ?? {}) as never);
      return Response.json({ ok: true, score });
    } catch (e) {
      req.payload.logger.error(`[tiroir] enregistrement ${kind} ${id} : ${e}`);
      const known = e instanceof SaveError || (e instanceof Error && /modifié dans WordPress|modifiée dans WordPress/.test(e.message));
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: known ? 409 : 502 });
    }
  },
});


/** Le comparateur de concurrents (étape 4) : lire l'analyse (GET), la relancer (POST, ≈ 0,002 €). */
const competitorsEndpoints = (kind: "articles" | "job-sheets"): Endpoint[] => {
  const handler = (force: boolean): Endpoint["handler"] => async (req) => {
    if (!hasAdminRole(req.user)) return Response.json({ error: "Réservé aux administrateurs." }, { status: 403 });
    const id = String(req.routeParams?.id ?? "");
    const { analyzeContent, copyCheck, findSnapshot } = await import("@/modules/editorial/lib/competitors/run");
    const { suggestLinks } = await import("@/modules/editorial/lib/competitors/links");
    const { analysisKeyword } = await import("@/modules/editorial/lib/competitors/content");
    const { isDataForSeoConfigured } = await import("@/modules/editorial/lib/competitors/dataforseo");
    try {
      const doc = (await req.payload.findByID({ collection: kind as never, id, depth: 0, overrideAccess: true })) as unknown as Record<string, unknown>;
      const keyword = analysisKeyword(kind, doc);
      const snap = force ? await analyzeContent(req.payload, kind, id, { force: true }) : await findSnapshot(req.payload, keyword);
      // Le texte des pages concurrentes reste sur le serveur.
      const pages = (snap?.pages ?? []).map((p) => ({ ...p, text: undefined }));
      // Étape 5 : ressemblance du texte enregistré avec chaque concurrent ; liens internes à proposer (articles).
      const [copy, links] = await Promise.all([copyCheck(req.payload, kind, doc).catch(() => null), kind === "articles" ? suggestLinks(req.payload, id).catch(() => []) : Promise.resolve([])]);
      return Response.json({ keyword, configured: isDataForSeoConfigured(), snapshot: snap ? { ...snap, pages } : null, copy, links });
    } catch (e) {
      req.payload.logger.error(`[concurrents] ${kind} ${id} : ${e}`);
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
  };
  return [
    { path: "/:id/competitors", method: "get", handler: handler(false) },
    { path: "/:id/competitors", method: "post", handler: handler(true) },
  ];
};

const ro = { readOnly: true } as const;
const roWp = { readOnly: true, description: "Repris de WordPress à chaque synchronisation." } as const;

export const JobSheets: CollectionConfig = {
  slug: "job-sheets",
  labels: { singular: "Fiche métier", plural: "Fiches métier" },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "status", "scoreSeo", "scoreGeo", "scoreCoverage", "rome", "gscClicks", "figuresUpdatedAt"],
    listSearchableFields: ["title", "slug", "rome"],
    group: "Éditorial",
    pagination: { defaultLimit: 50 },
    components: { beforeListTable: ["/modules/editorial/admin/JobSheetsHeader#JobSheetsHeader"] },
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  defaultSort: "title",
  endpoints: [syncEndpoint, contentEndpoint("job-sheets"), ...competitorsEndpoints("job-sheets")],
  fields: [
    {
      name: "status",
      type: "select",
      label: "Statut",
      required: true,
      defaultValue: "a-rediger",
      index: true,
      options: JOB_STATUSES.map((s) => ({ label: s.label, value: s.value })),
      admin: { position: "sidebar", components: { Cell: "/modules/editorial/admin/JobStatusCell#JobStatusCell" } },
    },
    { name: "rome", type: "text", label: "Code ROME", index: true, admin: { position: "sidebar" } },
    { name: "figuresUpdatedAt", type: "date", label: "Chiffres France Travail du", index: true, admin: { position: "sidebar", readOnly: true, description: "Rafraîchis une fois par an, à cette date anniversaire.", date: { displayFormat: "dd/MM/yyyy" } } },
    // La note SEO / GEO (19/11/2026) : critères de la version en vigueur des règles, mesurés par le code.
    { name: "scoreSeo", type: "number", label: "SEO", index: true, admin: { position: "sidebar", readOnly: true, components: { Cell: "/modules/editorial/admin/ScoreCell#ScoreCell" } } },
    { name: "scoreGeo", type: "number", label: "GEO", index: true, admin: { position: "sidebar", readOnly: true, components: { Cell: "/modules/editorial/admin/ScoreCell#ScoreCell" } } },
    { name: "scoreRulesVersion", type: "number", label: "Note selon les règles v.", admin: { position: "sidebar", readOnly: true } },
    { name: "scoredAt", type: "date", admin: { hidden: true } },
    { name: "scoreDetail", type: "json", admin: { hidden: true } },
    { name: "scoreCoverage", type: "number", label: "Couverture", index: true, admin: { position: "sidebar", readOnly: true, description: "Ressemblance au top 10 de Google sur la requête (termes, questions). Pas une prévision de classement.", components: { Cell: "/modules/editorial/admin/ScoreCell#ScoreCell" } } },
    { name: "coverageTarget", type: "number", label: "Cible de couverture (%)", admin: { position: "sidebar", readOnly: true, description: "Médiane des concurrents + 10 points." } },
    { name: "competitorsAt", type: "date", label: "Concurrents relevés le", index: true, admin: { position: "sidebar", readOnly: true } },
    // Le comparateur, pour la note v3 (19/11/2026) : statut, fourchette de longueur du top 10, entités citées, termes en excès.
    { name: "coverageStatus", type: "select", options: [{ label: "Analysé", value: "analyse" }, { label: "Top 10 sans assez d'articles", value: "insuffisant" }], admin: { hidden: true } },
    { name: "coverageWordsMin", type: "number", admin: { hidden: true } },
    { name: "coverageWordsMax", type: "number", admin: { hidden: true } },
    { name: "coverageEntities", type: "number", admin: { hidden: true } },
    { name: "coverageExcess", type: "number", admin: { hidden: true } },
    // La méta Yoast de la fiche, relue dans WordPress (note v3, 19/11/2026).
    { name: "seoTitle", type: "text", label: "Titre SEO (Yoast)", admin: { position: "sidebar", readOnly: true } },
    { name: "seoDescription", type: "textarea", label: "Méta description (Yoast)", admin: { position: "sidebar", readOnly: true } },
    { name: "wpFocusKeyword", type: "text", label: "Mot-clé Yoast", admin: { position: "sidebar", readOnly: true } },
    { name: "publishedAt", type: "date", label: "Publiée le", index: true, admin: { position: "sidebar", ...roWp, date: { displayFormat: "dd/MM/yyyy" } } },
    {
      type: "tabs",
      tabs: [
        {
          label: "Fiche",
          fields: [
            { name: "title", type: "text", label: "Métier", required: true, admin: { components: { Cell: "/modules/editorial/admin/TitleDrawerCell#TitleDrawerCell" } } },
            { name: "slug", type: "text", label: "Slug", index: true },
            { name: "why", type: "textarea", label: "Pourquoi ce métier", admin: { ...ro, condition: (d) => Boolean(d?.why) } },
            {
              type: "row",
              fields: [
                { name: "proposedBy", type: "text", label: "Proposé par", admin: ro },
                { name: "proposedAt", type: "date", label: "Proposé le", admin: { ...ro, date: { displayFormat: "dd/MM/yyyy" } } },
              ],
            },
            { name: "figures", type: "json", label: "Derniers chiffres France Travail", admin: ro },
          ],
        },
        {
          label: "Chiffres",
          description: "Clics Google (Search Console) et visites (GA4), relevés chaque lundi. Rien n'est écrit dans WordPress.",
          fields: [
            {
              type: "row",
              fields: [
                { name: "gscClicks", type: "number", label: "Clics Google", index: true, admin: { ...ro, description: "Sur les 16 mois que garde Google." } },
                { name: "gscImpressions", type: "number", label: "Impressions (16 mois)", admin: ro },
                { name: "gscPosition", type: "number", label: "Position", admin: ro },
              ],
            },
            {
              type: "row",
              fields: [
                { name: "gscClicks28", type: "number", label: "Clics, 28 derniers jours", admin: ro },
                { name: "gscClicks28Prev", type: "number", label: "Clics, 28 jours d'avant", admin: ro },
                { name: "ga4Sessions", type: "number", label: "Visites (GA4, 16 mois)", admin: ro },
                { name: "ga4AiSessions", type: "number", label: "dont venues d'une IA", admin: ro },
              ],
            },
            { name: "statsUpdatedAt", type: "date", label: "Chiffres mis à jour le", admin: { ...ro, date: { pickerAppearance: "dayAndTime", displayFormat: "dd/MM/yyyy HH:mm" } } },
          ],
        },
        {
          label: "Rédaction",
          fields: [
            {
              type: "row",
              fields: [
                { name: "writeStage", type: "select", label: "Étape", options: [{ label: "Rédaction", value: "redaction" }, { label: "Relance", value: "relance" }, { label: "Publication", value: "publication" }, { label: "Rafraîchissement des chiffres", value: "chiffres" }, { label: "Terminée", value: "termine" }, { label: "Échec", value: "echec" }], admin: ro },
                { name: "writeAttempts", type: "number", label: "Essais", admin: ro },
                { name: "writeCostEur", type: "number", label: "Coût (€)", admin: ro },
              ],
            },
            {
              type: "row",
              fields: [
                { name: "writeStartedAt", type: "date", label: "Commencée le", index: true, admin: { ...ro, date: { pickerAppearance: "dayAndTime", displayFormat: "dd/MM/yyyy HH:mm" } } },
                { name: "writeLockedUntil", type: "date", admin: { hidden: true } },
              ],
            },
            { name: "writeErrors", type: "textarea", label: "Ce que le contrôle a bloqué", admin: { ...ro, condition: (d) => Boolean(d?.writeErrors) } },
            { name: "writeWarnings", type: "textarea", label: "Avertissements", admin: { ...ro, condition: (d) => Boolean(d?.writeWarnings) } },
            { name: "writeContext", type: "json", admin: { hidden: true } },
            { name: "draft", type: "json", admin: { hidden: true } },
            { name: "previousAcf", type: "json", admin: { hidden: true } },
          ],
        },
        {
          label: "WordPress",
          fields: [
            {
              type: "row",
              fields: [
                { name: "wpId", type: "number", label: "ID WordPress", unique: true, index: true, admin: ro },
                { name: "wpStatus", type: "text", label: "Statut WordPress", admin: roWp },
              ],
            },
            { name: "wpLink", type: "text", label: "Adresse", admin: roWp },
            {
              type: "row",
              fields: [
                { name: "wpModified", type: "date", label: "Modifiée dans WordPress", index: true, admin: { ...roWp, date: { pickerAppearance: "dayAndTime", displayFormat: "dd/MM/yyyy HH:mm" } } },
                { name: "syncedAt", type: "date", label: "Dernière synchronisation", admin: { ...ro, date: { pickerAppearance: "dayAndTime", displayFormat: "dd/MM/yyyy HH:mm" } } },
              ],
            },
            { name: "acf", type: "json", admin: { ...roWp, hidden: true } },
          ],
        },
      ],
    },
  ],
};
