import type { CollectionBeforeChangeHook, CollectionConfig, Endpoint } from "payload";

import { hasAdminRole, isAdmin } from "@/core/access";
import { ARTICLE_STATUSES, PREPARATION_STATUSES, REFRESH_REASONS } from "@/modules/editorial/lib/articles/statuses";

/**
 * LE TABLEAU DES ARTICLES (Éditorial › Articles, décision du 18/11/2026).
 *
 * Une fiche par article de la vitrine : ceux qui existent déjà (importés de
 * WordPress), et demain ceux que l'équipe de Sergey propose, rédige et publie.
 * Les règles de rédaction : docs/articles/REGLES-ARTICLES-v1.md.
 *
 * Étape 2 (cette version) : le support LIT WordPress (import, puis
 * synchronisation chaque heure) ; il n'y écrit rien. Les champs de l'onglet
 * « WordPress » sont réécrits à chaque synchronisation : une modification faite
 * dans WordPress arrive ici. Les champs du tableau (thématique, intention,
 * mot-clé, suivi) ne sont jamais écrasés par la synchronisation.
 */

/** Thématique choisie à la main : la synchronisation ne la touche plus (elle ne la pose qu'à la création). */
const markManualTheme: CollectionBeforeChangeHook = ({ data, originalDoc, context }) => {
  if (context?.fromWordPress) return data;
  const before = originalDoc?.theme && typeof originalDoc.theme === "object" ? originalDoc.theme.id : originalDoc?.theme;
  const after = data?.theme && typeof data.theme === "object" ? data.theme.id : data?.theme;
  if (data && "theme" in data && String(before ?? "") !== String(after ?? "")) data.themeSource = after ? "manuel" : null;
  return data;
};

const syncEndpoint: Endpoint = {
  path: "/sync",
  method: "post",
  handler: async (req) => {
    if (!hasAdminRole(req.user)) return Response.json({ error: "Réservé aux administrateurs." }, { status: 403 });
    const full = new URL(req.url ?? "http://x").searchParams.get("full") === "1";
    const { syncArticlesFromWordPress } = await import("@/modules/editorial/lib/articles/sync");
    try {
      return Response.json(await syncArticlesFromWordPress(req.payload, { full }));
    } catch (err) {
      req.payload.logger.error(`[articles] synchronisation WordPress échouée : ${err}`);
      return Response.json({ error: err instanceof Error ? err.message : "Synchronisation impossible." }, { status: 502 });
    }
  },
};

const statsEndpoint: Endpoint = {
  path: "/stats",
  method: "get",
  handler: async (req) => {
    if (!hasAdminRole(req.user)) return Response.json({ error: "Réservé aux administrateurs." }, { status: 403 });
    const counts = await Promise.all(
      ARTICLE_STATUSES.map((s) => req.payload.count({ collection: "articles" as never, where: { status: { equals: s.value } }, overrideAccess: true }).then((r) => [s.value, r.totalDocs] as const)),
    );
    return Response.json({ byStatus: Object.fromEntries(counts) });
  },
};

const refreshStatsEndpoint: Endpoint = {
  path: "/stats/refresh",
  method: "post",
  handler: async (req) => {
    if (!hasAdminRole(req.user)) return Response.json({ error: "Réservé aux administrateurs." }, { status: 403 });
    const { refreshArticleStats } = await import("@/modules/editorial/lib/articles/stats");
    try {
      return Response.json(await refreshArticleStats(req.payload));
    } catch (err) {
      req.payload.logger.error(`[articles] chiffres Search Console / GA4 impossibles : ${err}`);
      return Response.json({ error: err instanceof Error ? err.message : "Chiffres indisponibles." }, { status: 502 });
    }
  },
};

/**
 * Les décisions de Charlie sur une fiche (étape 3, 18/11/2026) :
 *  - « valider » une idée → Validée (elle attend la rédaction) ;
 *  - « arreter » une idée, à n'importe quelle étape avant la publication, avec
 *    un motif → Arrêtée (elle ne sera plus reproposée) ;
 *  - « reprendre » une idée arrêtée → de nouveau Idée ;
 *  - « reprise-valider » / « reprise-refuser » une reprise proposée sur un
 *    article en ligne : validée, il passe « À rafraîchir » ; refusée (motif),
 *    elle ne revient pas avant 8 semaines.
 */
const decisionEndpoint: Endpoint = {
  path: "/:id/decision",
  method: "post",
  handler: async (req) => {
    if (!hasAdminRole(req.user)) return Response.json({ error: "Réservé aux administrateurs." }, { status: 403 });
    const id = String(req.routeParams?.id ?? "");
    const body = (await req.json?.().catch(() => null)) as { action?: string; motif?: string } | null;
    const action = String(body?.action ?? "");
    const motif = String(body?.motif ?? "").trim().slice(0, 1000);
    const doc = (await req.payload.findByID({ collection: "articles" as never, id, depth: 0, overrideAccess: true }).catch(() => null)) as Record<string, unknown> | null;
    if (!doc) return Response.json({ error: "Article introuvable." }, { status: 404 });
    const now = new Date().toISOString();
    const status = String(doc.status ?? "");
    // Étape 6 : les actions qui écrivent dans WordPress (wp-write.ts : relire avant, écrire ce qui change, relire après).
    if (action === "valider-texte" || action === "annuler-maj") {
      const { validateText, undoUpdate, ActionError } = await import("@/modules/editorial/lib/articles/actions");
      try {
        if (action === "valider-texte") return Response.json({ ok: true, ...(await validateText(req.payload, id)) });
        await undoUpdate(req.payload, id, motif);
        return Response.json({ ok: true });
      } catch (e) {
        const known = e instanceof ActionError || (e instanceof Error && e.name === "WpWriteError");
        req.payload.logger.error(`[articles] ${action} ${id} : ${e}`);
        return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: known ? 409 : 502 });
      }
    }
    let data: Record<string, unknown> | null = null;
    if (action === "valider" && status === "idee") data = { status: "validee", decidedAt: now };
    else if (action === "arreter" && (PREPARATION_STATUSES as readonly string[]).includes(status)) {
      if (!motif) return Response.json({ error: "Donnez le motif de l'arrêt : il évite que l'idée revienne." }, { status: 400 });
      data = { status: "arretee", decisionNote: motif, decidedAt: now };
    } else if (action === "reprendre" && status === "arretee") data = { status: "idee", decidedAt: now };
    else if (action === "reprise-valider" && doc.refreshState === "proposee") data = { refreshState: "validee", refreshDecidedAt: now, ...(status === "publie" ? { status: "a-rafraichir" } : {}) };
    else if (action === "reprise-refuser" && doc.refreshState === "proposee") {
      if (!motif) return Response.json({ error: "Donnez le motif du refus." }, { status: 400 });
      data = { refreshState: "refusee", refreshDecidedAt: now, refreshDecisionNote: motif };
    }
    if (!data) return Response.json({ error: "Cette décision n'est pas possible dans l'état actuel de l'article." }, { status: 409 });
    await req.payload.update({ collection: "articles" as never, id, data: data as never, overrideAccess: true, context: { fromWordPress: true } });
    return Response.json({ ok: true });
  },
};

/** Recalcule les notes SEO / GEO de tous les articles et fiches (aucun appel extérieur). */
const scoreEndpoint: Endpoint = {
  path: "/score",
  method: "post",
  handler: async (req) => {
    if (!hasAdminRole(req.user)) return Response.json({ error: "Réservé aux administrateurs." }, { status: 403 });
    const { scoreAll } = await import("@/modules/editorial/lib/score/run");
    const { coverageAll } = await import("@/modules/editorial/lib/competitors/run");
    const out = await scoreAll(req.payload);
    return Response.json({ ...out, coverageChanged: await coverageAll(req.payload).catch(() => 0) });
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

const readOnlyWp = { readOnly: true, description: "Repris de WordPress à chaque synchronisation." } as const;

export const Articles: CollectionConfig = {
  slug: "articles",
  labels: { singular: "Article", plural: "Articles" },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "status", "scoreSeo", "scoreGeo", "scoreCoverage", "theme", "gscClicks", "gscPosition", "publishedAt"],
    listSearchableFields: ["title", "slug", "keyword"],
    group: "Éditorial",
    pagination: { defaultLimit: 50 },
    components: {
      beforeListTable: ["/modules/editorial/admin/ArticlesBoardHeader#ArticlesBoardHeader"],
    },
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  defaultSort: "-publishedAt",
  hooks: { beforeChange: [markManualTheme] },
  endpoints: [syncEndpoint, statsEndpoint, refreshStatsEndpoint, decisionEndpoint, scoreEndpoint, contentEndpoint("articles"), ...competitorsEndpoints("articles")],
  fields: [
    // ── Barre latérale : où en est l'article ─────────────────────────────
    {
      name: "decision",
      type: "ui",
      admin: { position: "sidebar", components: { Field: "/modules/editorial/admin/ArticleDecision#ArticleDecision" } },
    },
    {
      name: "status",
      type: "select",
      label: "Statut",
      required: true,
      defaultValue: "idee",
      index: true,
      options: ARTICLE_STATUSES.map((s) => ({ label: s.label, value: s.value })),
      admin: { position: "sidebar", components: { Cell: "/modules/editorial/admin/ArticleStatusCell#ArticleStatusCell" } },
    },
    { name: "theme", type: "relationship", relationTo: "article-themes" as never, label: "Thématique", index: true, admin: { position: "sidebar" } },
    {
      name: "themeSource",
      type: "select",
      label: "Thématique posée",
      options: [
        { label: "Automatiquement (à l'import)", value: "auto" },
        { label: "À la main", value: "manuel" },
      ],
      admin: { position: "sidebar", readOnly: true },
    },
    { name: "subtheme", type: "text", label: "Sous-thématique", admin: { position: "sidebar" } },
    {
      name: "intent",
      type: "select",
      label: "Intention",
      options: [
        { label: "TOFU — découvrir le sujet", value: "tofu" },
        { label: "MOFU — trouver une méthode", value: "mofu" },
        { label: "BOFU — choisir une solution", value: "bofu" },
      ],
      admin: { position: "sidebar", description: "Décide de la place de TIM Management dans l'article (règle B1/B2)." },
    },
    {
      name: "scheduledAt",
      type: "date",
      label: "Publication prévue le",
      index: true,
      admin: { position: "sidebar", readOnly: true, condition: (d) => Boolean(d?.scheduledAt) && d?.status !== "publie", date: { pickerAppearance: "dayAndTime", displayFormat: "EEEE dd/MM/yyyy HH:mm" } },
    },
    { name: "featuredImageUrl", type: "text", label: "Image principale", admin: { position: "sidebar", readOnly: true, condition: (d) => Boolean(d?.featuredImageUrl) } },
    { name: "featuredMediaId", type: "number", admin: { hidden: true } },
    // Le visuel de la charte « 5a — Éditorial doux » (étape 8, 19/11/2026), créé par le support.
    {
      name: "visualMotif",
      type: "select",
      label: "Motif du visuel",
      options: ["horloge", "calendrier", "feuille", "pieces", "barres", "versus", "meteo", "route", "bouclier", "personnes", "telephone", "gantt", "casque", "photo", "repas"].map((m) => ({ label: m, value: m })),
      admin: { position: "sidebar", description: "Motif forcé dans le prompt de l'image ; vide = Claude Design le choisit (charte)." },
    },
    { name: "visualItalic", type: "text", label: "Mots en serif italique", admin: { position: "sidebar", description: "Un passage EXACT du titre (1 à 3 mots). Vide = le mot-clé." } },
    { name: "visualFile", type: "text", label: "Fichier du visuel", admin: { position: "sidebar", readOnly: true, condition: (d) => Boolean(d?.visualFile) } },
    { name: "visualAlt", type: "text", label: "Texte alternatif du visuel", admin: { position: "sidebar", readOnly: true, condition: (d) => Boolean(d?.visualAlt) } },
    { name: "visualCaption", type: "text", label: "Légende du visuel", admin: { position: "sidebar", readOnly: true, condition: (d) => Boolean(d?.visualCaption) } },
    { name: "visualJsonLd", type: "json", label: "JSON-LD de l'image (ImageObject)", admin: { position: "sidebar", readOnly: true, condition: (d) => Boolean(d?.visualJsonLd) } },
    { name: "textValidatedAt", type: "date", admin: { hidden: true } },
    { name: "previousAcf", type: "json", admin: { hidden: true } },
    { name: "backlinksPending", type: "checkbox", index: true, admin: { hidden: true } },
    { name: "lastUpdateAt", type: "date", label: "Dernière mise à jour automatique", admin: { position: "sidebar", readOnly: true, condition: (d) => Boolean(d?.lastUpdateAt), date: { displayFormat: "dd/MM/yyyy" } } },
    // La note SEO / GEO (19/11/2026) : critères de la version en vigueur des règles, mesurés par le code.
    { name: "scoreSeo", type: "number", label: "Note SEO (%)", index: true, admin: { position: "sidebar", readOnly: true, components: { Cell: "/modules/editorial/admin/ScoreCell#ScoreCell" } } },
    { name: "scoreGeo", type: "number", label: "Note GEO (%)", index: true, admin: { position: "sidebar", readOnly: true, components: { Cell: "/modules/editorial/admin/ScoreCell#ScoreCell" } } },
    { name: "scoreRulesVersion", type: "number", label: "Note selon les règles v.", admin: { position: "sidebar", readOnly: true } },
    { name: "scoredAt", type: "date", admin: { hidden: true } },
    { name: "scoreDetail", type: "json", admin: { hidden: true } },
    { name: "scoreCoverage", type: "number", label: "Couverture concurrents (%)", index: true, admin: { position: "sidebar", readOnly: true, description: "Ressemblance au top 10 de Google sur la requête (termes, questions). Pas une prévision de classement.", components: { Cell: "/modules/editorial/admin/ScoreCell#ScoreCell" } } },
    { name: "coverageTarget", type: "number", label: "Cible de couverture (%)", admin: { position: "sidebar", readOnly: true, description: "Médiane des concurrents + 10 points." } },
    { name: "competitorsAt", type: "date", label: "Concurrents relevés le", index: true, admin: { position: "sidebar", readOnly: true } },
    // Le comparateur, pour la note v3 (19/11/2026) : statut, fourchette de longueur du top 10, entités citées, termes en excès.
    { name: "coverageStatus", type: "select", options: [{ label: "Analysé", value: "analyse" }, { label: "Top 10 sans assez d'articles", value: "insuffisant" }], admin: { hidden: true } },
    { name: "coverageWordsMin", type: "number", admin: { hidden: true } },
    { name: "coverageWordsMax", type: "number", admin: { hidden: true } },
    { name: "coverageEntities", type: "number", admin: { hidden: true } },
    { name: "coverageExcess", type: "number", admin: { hidden: true } },
    // L'image principale, mesurée pour la note v3 (relue dans WordPress, ou posée par le visuel).
    { name: "imageAlt", type: "text", admin: { hidden: true } },
    { name: "imageMime", type: "text", admin: { hidden: true } },
    { name: "imageWidth", type: "number", admin: { hidden: true } },
    { name: "imageBytes", type: "number", admin: { hidden: true } },
    { name: "imageFile", type: "text", admin: { hidden: true } },
    { name: "publishedAt", type: "date", label: "Publié le", index: true, admin: { position: "sidebar", ...readOnlyWp, date: { displayFormat: "dd/MM/yyyy" } } },
    {
      type: "tabs",
      tabs: [
        {
          label: "Proposition",
          description: "Ce que l'équipe SEO/GEO propose, et tes décisions. Une idée vient avec son pourquoi chiffré ; une reprise d'article en ligne attend ta validation avant de passer « À rafraîchir ».",
          fields: [
            { name: "ideaWhy", type: "textarea", label: "Pourquoi cet article", admin: { description: "Chiffres à l'appui : Search Console, concurrence (Guy), IA (Georges)." } },
            { name: "ideaAngle", type: "text", label: "Angle" },
            { name: "ideaOutline", type: "textarea", label: "Plan proposé", admin: { description: "Un intertitre (H2) par ligne." } },
            {
              type: "row",
              fields: [
                { name: "proposedBy", type: "text", label: "Proposé par", admin: { readOnly: true } },
                { name: "proposedAt", type: "date", label: "Proposé le", admin: { readOnly: true, date: { displayFormat: "dd/MM/yyyy" } } },
                { name: "decidedAt", type: "date", label: "Décidé le", admin: { readOnly: true, date: { displayFormat: "dd/MM/yyyy" } } },
              ],
            },
            { name: "decisionNote", type: "textarea", label: "Motif de l'arrêt", admin: { readOnly: true, condition: (d) => d?.status === "arretee" || Boolean(d?.decisionNote) } },
            {
              name: "refreshState",
              type: "select",
              label: "Reprise proposée",
              index: true,
              options: [
                { label: "Proposée — attend ta décision", value: "proposee" },
                { label: "Validée", value: "validee" },
                { label: "Refusée", value: "refusee" },
              ],
              admin: { readOnly: true },
            },
            { name: "refreshReason", type: "select", label: "Raison de la reprise", options: REFRESH_REASONS.map((r) => ({ label: r.label, value: r.value })), admin: { readOnly: true, condition: (d) => Boolean(d?.refreshState) } },
            { name: "refreshWhy", type: "textarea", label: "Pourquoi la reprendre", admin: { readOnly: true, condition: (d) => Boolean(d?.refreshState) } },
            { name: "refreshPlan", type: "textarea", label: "Ce qu'il faudrait changer", admin: { readOnly: true, condition: (d) => Boolean(d?.refreshState) } },
            {
              type: "row",
              admin: { condition: (d) => Boolean(d?.refreshState) },
              fields: [
                { name: "refreshProposedBy", type: "text", label: "Proposée par", admin: { readOnly: true } },
                { name: "refreshProposedAt", type: "date", label: "Proposée le", admin: { readOnly: true, date: { displayFormat: "dd/MM/yyyy" } } },
                { name: "refreshDecidedAt", type: "date", label: "Décidée le", admin: { readOnly: true, date: { displayFormat: "dd/MM/yyyy" } } },
              ],
            },
            { name: "refreshDecisionNote", type: "textarea", label: "Motif du refus", admin: { readOnly: true, condition: (d) => d?.refreshState === "refusee" } },
          ],
        },
        {
          label: "Article",
          fields: [
            { name: "title", type: "text", label: "Titre (H1)", required: true, admin: { components: { Cell: "/modules/editorial/admin/TitleDrawerCell#TitleDrawerCell" } } },
            { name: "slug", type: "text", label: "Slug", index: true },
            { name: "keyword", type: "text", label: "Mot-clé principal" },
            { name: "secondaryKeywords", type: "text", label: "Mots-clés secondaires", admin: { description: "Séparés par des virgules." } },
            {
              name: "contentPreview",
              type: "ui",
              admin: { components: { Field: "/modules/editorial/admin/ArticleContentPreview#ArticleContentPreview" } },
            },
          ],
        },
        {
          label: "Rédaction",
          description: "La rédaction automatique (étape 5) : elle démarre quand tu valides une idée, un article par jour au plus, en pause dès que 4 articles attendent ta relecture. Les faits sont les SEULES données chiffrées que le rédacteur peut utiliser.",
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "writeStage",
                  type: "select",
                  label: "Étape",
                  options: [
                    { label: "En attente", value: "attente" },
                    { label: "Recherche des faits", value: "recherche" },
                    { label: "Préparation", value: "preparation" },
                    { label: "Rédaction et contrôle", value: "redaction" },
                    { label: "Relance après contrôle", value: "relance" },
                    { label: "Mise à jour et écriture dans WordPress", value: "maj" },
                    { label: "Terminée", value: "termine" },
                    { label: "Échec", value: "echec" },
                  ],
                  admin: { readOnly: true },
                },
                { name: "writeAttempts", type: "number", label: "Essais", admin: { readOnly: true } },
                { name: "writeMode", type: "select", label: "Travail", options: [{ label: "Nouvel article", value: "article" }, { label: "Mise à jour", value: "maj" }], admin: { readOnly: true } },
                { name: "rulesVersion", type: "number", label: "Version des règles", admin: { readOnly: true, description: "Celle avec laquelle l'article a été écrit." } },
                { name: "writeCostEur", type: "number", label: "Coût (€)", admin: { readOnly: true } },
              ],
            },
            {
              type: "row",
              fields: [
                { name: "writeStartedAt", type: "date", label: "Commencée le", index: true, admin: { readOnly: true, date: { pickerAppearance: "dayAndTime", displayFormat: "dd/MM/yyyy HH:mm" } } },
                { name: "writeFinishedAt", type: "date", label: "Terminée le", admin: { readOnly: true, date: { pickerAppearance: "dayAndTime", displayFormat: "dd/MM/yyyy HH:mm" } } },
                { name: "writeLockedUntil", type: "date", label: "Verrou jusqu'à", admin: { hidden: true } },
              ],
            },
            { name: "writeErrors", type: "textarea", label: "Ce que le contrôle a bloqué", admin: { readOnly: true, condition: (d) => Boolean(d?.writeErrors) } },
            { name: "writeWarnings", type: "textarea", label: "Avertissements (non bloquants)", admin: { readOnly: true, condition: (d) => Boolean(d?.writeWarnings) } },
            { name: "wordcountTarget", type: "number", label: "Longueur visée (mots)", admin: { description: "Facultatif : sinon, la longueur que le sujet exige." } },
            { name: "clientCase", type: "textarea", label: "Cas client réel", admin: { description: "Le SEUL cas, la seule entreprise ou le seul témoignage que l'article peut citer. Vide = aucun." } },
            {
              name: "facts",
              type: "array",
              label: "Faits sourcés",
              labels: { singular: "Fait", plural: "Faits" },
              admin: { description: "Trouvés par la recherche (extrait vérifié mot pour mot dans la page lue) ou ajoutés par toi. « [sujet] » en tête de fait : sujets dont les sources divergent." },
              fields: [
                { name: "fact", type: "textarea", label: "Fait", required: true },
                {
                  type: "row",
                  fields: [
                    { name: "source", type: "text", label: "Source", required: true },
                    { name: "url", type: "text", label: "Adresse précise" },
                    { name: "year", type: "text", label: "Année" },
                    { name: "origin", type: "select", label: "Origine", defaultValue: "manuel", options: [{ label: "Recherche (vérifié)", value: "recherche" }, { label: "Ajouté à la main", value: "manuel" }] },
                  ],
                },
                { name: "excerpt", type: "textarea", label: "Extrait de la page", admin: { readOnly: true, condition: (_, sib) => Boolean(sib?.excerpt) } },
              ],
            },
            { name: "rejectedFacts", type: "json", label: "Faits écartés par la vérification", admin: { readOnly: true, condition: (d) => Array.isArray(d?.rejectedFacts) && d.rejectedFacts.length > 0 } },
            { name: "writeContext", type: "json", label: "Préparation", admin: { hidden: true } },
            { name: "draft", type: "json", label: "Article rédigé", admin: { hidden: true } },
          ],
        },
        {
          label: "Suivi",
          fields: [
            { name: "notes", type: "textarea", label: "Notes", admin: { description: "Historique (revues d'octobre 2026), motif d'un « À vérifier », décisions." } },
            {
              name: "deadlines",
              type: "array",
              label: "Échéances",
              labels: { singular: "Échéance", plural: "Échéances" },
              admin: { description: "Revérifications datées : barème annuel, texte abrogé, tarifs des concurrents…" },
              fields: [
                { name: "date", type: "date", label: "Date", required: true, admin: { date: { displayFormat: "dd/MM/yyyy" } } },
                { name: "reason", type: "text", label: "À faire", required: true },
              ],
            },
            { name: "keepSeoTitle", type: "checkbox", label: "Titre SEO à ne pas réécrire", admin: { description: "Raccourci à la main (revue du 07/10/2026) : aucune reprise ne le change." } },
            { name: "redirectTo", type: "number", label: "Redirigé vers l'article (ID WordPress)", admin: { description: "Article retiré du site et fusionné dans un autre." } },
            {
              name: "origin",
              type: "select",
              label: "Origine",
              options: [
                { label: "Importé de WordPress", value: "import-wordpress" },
                { label: "Proposé par l'équipe SEO/GEO", value: "equipe-seo" },
                { label: "Ajouté à la main", value: "manuel" },
              ],
              admin: { readOnly: true },
            },
          ],
        },
        {
          label: "Chiffres",
          description: "Une fois par semaine (lundi) et à la demande (« Rafraîchir les chiffres » en tête du tableau). Clics Google : Search Console, fiable jusqu'à J-3. Visites : GA4, toutes sources.",
          fields: [
            {
              type: "row",
              fields: [
                { name: "gscClicks", type: "number", label: "Clics Google (cumulés, 16 mois)", index: true, admin: { readOnly: true, description: "Depuis la publication, sur les 16 mois que garde Google." } },
                { name: "gscImpressions", type: "number", label: "Impressions (16 mois)", admin: { readOnly: true } },
                { name: "gscPosition", type: "number", label: "Position moyenne (3 mois)", admin: { readOnly: true } },
              ],
            },
            {
              type: "row",
              fields: [
                { name: "gscClicks28", type: "number", label: "Clics Google, 28 derniers jours", admin: { readOnly: true } },
                { name: "gscClicks28Prev", type: "number", label: "Clics Google, 28 jours d'avant", admin: { readOnly: true } },
              ],
            },
            {
              type: "row",
              fields: [
                { name: "ga4Sessions", type: "number", label: "Visites (GA4, 16 mois)", admin: { readOnly: true, description: "Toutes sources : Google, IA, réseaux, direct…" } },
                { name: "ga4AiSessions", type: "number", label: "dont venues d'une IA", admin: { readOnly: true, description: "ChatGPT, Perplexity, Gemini, Copilot…" } },
              ],
            },
            { name: "review30", type: "json", label: "Bilan à 30 jours", admin: { readOnly: true, condition: (d) => Boolean(d?.review30) } },
            { name: "review90", type: "json", label: "Bilan à 90 jours", admin: { readOnly: true, condition: (d) => Boolean(d?.review90) } },
            { name: "backlinks", type: "json", label: "Maillage retour (liens ajoutés vers cet article)", admin: { readOnly: true, condition: (d) => Array.isArray(d?.backlinks) && d.backlinks.length > 0 } },
            { name: "statsUpdatedAt", type: "date", label: "Chiffres mis à jour le", admin: { readOnly: true, date: { pickerAppearance: "dayAndTime", displayFormat: "dd/MM/yyyy HH:mm" } } },
          ],
        },
        {
          label: "SEO",
          fields: [
            { name: "seoTitle", type: "text", label: "Titre SEO (Yoast)", admin: readOnlyWp },
            { name: "seoDescription", type: "textarea", label: "Meta description (Yoast)", admin: readOnlyWp },
            { name: "wpFocusKeyword", type: "text", label: "Mot-clé Yoast", admin: readOnlyWp },
          ],
        },
        {
          label: "WordPress",
          fields: [
            {
              type: "row",
              fields: [
                { name: "wpId", type: "number", label: "ID WordPress", unique: true, index: true, admin: { readOnly: true } },
                { name: "wpStatus", type: "text", label: "Statut WordPress", admin: readOnlyWp },
                { name: "wpAuthor", type: "number", label: "Auteur (ID)", admin: readOnlyWp },
              ],
            },
            { name: "wpLink", type: "text", label: "Adresse", admin: readOnlyWp },
            {
              type: "row",
              fields: [
                { name: "wordCount", type: "number", label: "Mots", admin: readOnlyWp },
                { name: "faqCount", type: "number", label: "Questions de FAQ", admin: readOnlyWp },
                { name: "sourcesCount", type: "number", label: "Sources", admin: readOnlyWp },
              ],
            },
            {
              type: "row",
              fields: [
                { name: "hasTldr", type: "checkbox", label: "TL;DR présente", admin: readOnlyWp },
                { name: "assistanceIa", type: "checkbox", label: "Rédigé avec assistance IA", admin: readOnlyWp },
              ],
            },
            {
              type: "row",
              fields: [
                { name: "reviewedBy", type: "text", label: "Relu par", admin: readOnlyWp },
                { name: "reviewedOn", type: "date", label: "Relu le", admin: { ...readOnlyWp, date: { displayFormat: "dd/MM/yyyy" } } },
                { name: "updatedOnWp", type: "date", label: "Mis à jour le (affiché)", admin: { ...readOnlyWp, date: { displayFormat: "dd/MM/yyyy" } } },
              ],
            },
            {
              type: "row",
              fields: [
                { name: "wpModified", type: "date", label: "Modifié dans WordPress", index: true, admin: { ...readOnlyWp, date: { pickerAppearance: "dayAndTime", displayFormat: "dd/MM/yyyy HH:mm" } } },
                { name: "syncedAt", type: "date", label: "Dernière synchronisation", admin: { readOnly: true, date: { pickerAppearance: "dayAndTime", displayFormat: "dd/MM/yyyy HH:mm" } } },
              ],
            },
            { name: "wpCategories", type: "json", label: "Catégories WordPress (ID)", admin: readOnlyWp },
            { name: "acf", type: "json", label: "Contenu (champs ACF)", admin: { ...readOnlyWp, hidden: true } },
          ],
        },
      ],
    },
  ],
};
