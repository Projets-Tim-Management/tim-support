import type { CollectionConfig, Endpoint, PayloadRequest } from "payload";

import { hasAdminRole, isAdmin } from "@/core/access";
import { applyCriterionChange, applyRuleChange, PROOF_LEVELS, PROPOSAL_STATUSES, RULE_KINDS, touchesSocle, type CriterionChange, type RuleKind } from "@/modules/editorial/lib/articles/rules-text";
import { syncRulesTask } from "@/modules/editorial/lib/articles/rules-task";

/**
 * LES RÈGLES DES ARTICLES, VERSIONNÉES, ET LES RECOMMANDATIONS DE SERGE
 * (étape 4, 18/11/2026 — docs/articles/REGLES-ARTICLES-v1.md pour la version 1).
 *
 * - `article-rule-versions` : chaque version du fichier de règles. La plus haute
 *   est en vigueur ; chaque article gardera la version avec laquelle il a été
 *   écrit (étape 5). Une version ne se modifie pas : on en crée une nouvelle.
 * - `article-rule-proposals` : les recommandations de la revue mensuelle de
 *   Sergey (tendances SEO/GEO aux États-Unis et en Europe, ce que TIM ne fait pas
 *   encore), chacune avec ses PREUVES. Charlie valide ou refuse chacune ;
 *   validée, elle s'applique au texte et crée une nouvelle version (sauf le
 *   socle, partie A, qui devient un développement). Refusée, elle est gardée
 *   avec son motif pour ne pas revenir.
 */

export const ArticleRuleVersions: CollectionConfig = {
  slug: "article-rule-versions",
  labels: { singular: "Version des règles", plural: "Règles des articles" },
  admin: {
    useAsTitle: "label",
    defaultColumns: ["label", "effectiveAt", "changes"],
    group: "Éditorial",
    description: "Le fichier de règles que suit le rédacteur. La version la plus récente est en vigueur. Elle change quand tu valides une recommandation de Sergey.",
  },
  access: { read: isAdmin, create: isAdmin, update: () => false, delete: () => false },
  defaultSort: "-number",
  hooks: {
    beforeChange: [
      async ({ data, req, operation }) => {
        if (!data) return data;
        // Une nouvelle version sans critères reprend ceux de la précédente (les poids ne se perdent pas).
        if (operation === "create" && !(Array.isArray(data.criteria) && data.criteria.length)) {
          const prev = (await req.payload.find({ collection: "article-rule-versions" as never, sort: "-number", limit: 1, depth: 0, overrideAccess: true })).docs[0] as unknown as { criteria?: unknown } | undefined;
          if (Array.isArray(prev?.criteria) && prev.criteria.length) data.criteria = prev.criteria;
        }
        return { ...data, label: `Version ${data.number}` };
      },
    ],
    // Nouvelle version en vigueur : toutes les notes sont recalculées (sans appel extérieur).
    afterChange: [
      ({ req, operation }) => {
        if (operation !== "create") return;
        void import("@/modules/editorial/lib/score/run").then((m) => m.scoreAll(req.payload)).catch((e) => req.payload.logger.error(`[notes] recalcul après nouvelle version des règles : ${e}`));
      },
    ],
  },
  fields: [
    { name: "label", type: "text", label: "Version", admin: { hidden: true } },
    { name: "number", type: "number", label: "Numéro", required: true, unique: true, index: true, admin: { position: "sidebar" } },
    { name: "effectiveAt", type: "date", label: "En vigueur depuis", required: true, admin: { position: "sidebar", date: { displayFormat: "dd/MM/yyyy HH:mm", pickerAppearance: "dayAndTime" } } },
    { name: "changes", type: "textarea", label: "Ce qui a changé", admin: { position: "sidebar" } },
    {
      name: "criteria",
      type: "json",
      label: "Critères de la note SEO / GEO",
      admin: { description: "Identifiant, jauge, poids, niveau de preuve (A à D), statut (active / info) et mesure de chaque critère. Versionnés avec les règles : une nouvelle version reprend ceux de la précédente." },
    },
    { name: "text", type: "code", label: "Règles", required: true, admin: { language: "markdown", editorOptions: { wordWrap: "on", lineNumbers: "off", minimap: { enabled: false } } } },
  ],
};

/**
 * Décision de Charlie sur une recommandation :
 *  - « valider » : partie A → « À développer » ; sinon le changement s'applique
 *    à la version en vigueur et crée la suivante (ou « Inapplicable » si le texte
 *    a changé depuis) ;
 *  - « refuser » (motif obligatoire).
 */
const decisionEndpoint: Endpoint = {
  path: "/:id/decision",
  method: "post",
  // Après chaque décision, la tâche de « Mes tâches » suit : compteur à jour, ou close s'il ne reste rien.
  handler: async (req) => {
    const res = await decide(req);
    if (res.ok) await syncRulesTask(req.payload).catch(() => undefined);
    return res;
  },
};

const decide = async (req: PayloadRequest): Promise<Response> => {
  {
    if (!hasAdminRole(req.user)) return Response.json({ error: "Réservé aux administrateurs." }, { status: 403 });
    const id = String(req.routeParams?.id ?? "");
    const body = (await req.json?.().catch(() => null)) as { action?: string; motif?: string } | null;
    const motif = String(body?.motif ?? "").trim().slice(0, 1000);
    const doc = (await req.payload.findByID({ collection: "article-rule-proposals" as never, id, depth: 0, overrideAccess: true }).catch(() => null)) as Record<string, unknown> | null;
    if (!doc) return Response.json({ error: "Recommandation introuvable." }, { status: 404 });
    if (doc.status !== "proposee") return Response.json({ error: "Cette recommandation a déjà été décidée." }, { status: 409 });
    const now = new Date().toISOString();
    if (body?.action === "refuser") {
      if (!motif) return Response.json({ error: "Donnez le motif du refus : il évite que la recommandation revienne." }, { status: 400 });
      await req.payload.update({ collection: "article-rule-proposals" as never, id, data: { status: "refusee", decisionNote: motif, decidedAt: now } as never, overrideAccess: true });
      return Response.json({ ok: true, status: "refusee" });
    }
    if (body?.action !== "valider") return Response.json({ error: "Décision inconnue." }, { status: 400 });
    // Un changement de la GRILLE de la note (règles v3) : une nouvelle version, même texte, grille modifiée.
    if (doc.kind === "critere") {
      const cur = (await req.payload.find({ collection: "article-rule-versions" as never, sort: "-number", limit: 1, depth: 0, overrideAccess: true })).docs[0] as unknown as { number: number; text: string; criteria?: unknown } | undefined;
      if (!cur) return Response.json({ error: "Aucune version des règles en vigueur." }, { status: 409 });
      const { criteriaOf } = await import("@/modules/editorial/lib/score/criteria");
      const out = applyCriterionChange(criteriaOf(cur) as never, (doc.criterionChange ?? {}) as CriterionChange);
      if (!out.ok) {
        await req.payload.update({ collection: "article-rule-proposals" as never, id, data: { status: "inapplicable", decisionNote: out.reason, decidedAt: now } as never, overrideAccess: true });
        return Response.json({ error: out.reason }, { status: 409 });
      }
      const number = cur.number + 1;
      await req.payload.create({ collection: "article-rule-versions" as never, overrideAccess: true, data: { number, effectiveAt: now, text: cur.text, criteria: out.criteria, changes: `Grille de la note — ${out.summary} — recommandation de ${String(doc.proposedBy ?? "Sergey")} validée par Charlie.${motif ? ` ${motif}` : ""}` } as never });
      const isNew = Boolean((doc.criterionChange as CriterionChange | null)?.create);
      await req.payload.update({ collection: "article-rule-proposals" as never, id, data: { status: isNew ? "a-developper" : "appliquee", appliedVersion: number, decisionNote: motif || null, decidedAt: now } as never, overrideAccess: true });
      return Response.json({ ok: true, status: isNew ? "a-developper" : "appliquee", version: number });
    }
    if (touchesSocle(String(doc.part ?? ""))) {
      await req.payload.update({ collection: "article-rule-proposals" as never, id, data: { status: "a-developper", decisionNote: motif || null, decidedAt: now } as never, overrideAccess: true });
      return Response.json({ ok: true, status: "a-developper" });
    }
    const current = (await req.payload.find({ collection: "article-rule-versions" as never, sort: "-number", limit: 1, depth: 0, overrideAccess: true })).docs[0] as unknown as { number: number; text: string } | undefined;
    if (!current) return Response.json({ error: "Aucune version des règles en vigueur." }, { status: 409 });
    const out = applyRuleChange(current.text, { kind: doc.kind as RuleKind, part: String(doc.part ?? ""), currentText: doc.currentText as string, proposedText: doc.proposedText as string, anchor: doc.anchor as string });
    if (!out.ok) {
      await req.payload.update({ collection: "article-rule-proposals" as never, id, data: { status: "inapplicable", decisionNote: out.reason, decidedAt: now } as never, overrideAccess: true });
      return Response.json({ error: out.reason }, { status: 409 });
    }
    const number = current.number + 1;
    await req.payload.create({
      collection: "article-rule-versions" as never,
      overrideAccess: true,
      data: { number, effectiveAt: now, text: out.text, changes: `${String(doc.title ?? "")} (${String(doc.kind ?? "")}, partie ${String(doc.part ?? "?")}) — recommandation de ${String(doc.proposedBy ?? "Sergey")} validée par Charlie.${motif ? ` ${motif}` : ""}` } as never,
    });
    await req.payload.update({ collection: "article-rule-proposals" as never, id, data: { status: "appliquee", appliedVersion: number, decisionNote: motif || null, decidedAt: now } as never, overrideAccess: true });
    return Response.json({ ok: true, status: "appliquee", version: number });
  }
};

export const ArticleRuleProposals: CollectionConfig = {
  slug: "article-rule-proposals",
  labels: { singular: "Recommandation", plural: "Recommandations de Sergey" },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "status", "part", "kind", "month"],
    group: "Éditorial",
    description: "Chaque mois, Sergey cherche ce qui se fait aux États-Unis et en Europe en SEO et GEO, et propose de faire évoluer les règles, preuves à l'appui. Tu valides ou tu refuses chacune.",
    components: { beforeListTable: ["/modules/editorial/admin/RuleEvidencePanel#RuleEvidencePanel"] },
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  defaultSort: "-createdAt",
  endpoints: [
    decisionEndpoint,
    {
      // La boucle de mesure (étape 6) : chaque critère croisé avec les résultats du site.
      path: "/evidence",
      method: "get",
      handler: async (req) => {
        if (!hasAdminRole(req.user)) return Response.json({ error: "Réservé aux administrateurs." }, { status: 403 });
        const { loadRuleEvidence } = await import("@/modules/editorial/lib/score/evidence");
        return Response.json(await loadRuleEvidence(req.payload));
      },
    },
  ],
  fields: [
    {
      name: "decision",
      type: "ui",
      admin: { position: "sidebar", components: { Field: "/modules/editorial/admin/RuleProposalDecision#RuleProposalDecision" } },
    },
    {
      name: "status",
      type: "select",
      label: "État",
      required: true,
      defaultValue: "proposee",
      index: true,
      options: PROPOSAL_STATUSES.map((s) => ({ label: s.label, value: s.value })),
      admin: { position: "sidebar", readOnly: true, components: { Cell: "/modules/editorial/admin/RuleProposalStatusCell#RuleProposalStatusCell" } },
    },
    { name: "month", type: "text", label: "Revue du mois", index: true, admin: { position: "sidebar", readOnly: true } },
    { name: "proposedBy", type: "text", label: "Proposée par", admin: { position: "sidebar", readOnly: true } },
    { name: "appliedVersion", type: "number", label: "Appliquée dans la version", admin: { position: "sidebar", readOnly: true, condition: (d) => d?.appliedVersion != null } },
    { name: "decidedAt", type: "date", label: "Décidée le", admin: { position: "sidebar", readOnly: true, date: { displayFormat: "dd/MM/yyyy" } } },
    { name: "title", type: "text", label: "Recommandation", required: true },
    {
      type: "row",
      fields: [
        { name: "part", type: "text", label: "Partie des règles", admin: { readOnly: true, description: "A = socle vérifié par le code ; B = rédaction ; C = pièges ; D = à coder ; F = note SEO/GEO." } },
        { name: "kind", type: "select", label: "Type", options: RULE_KINDS.map((k) => ({ label: k.label, value: k.value })), admin: { readOnly: true } },
      ],
    },
    { name: "why", type: "textarea", label: "Ce qui se fait ailleurs, et que TIM Management ne fait pas encore", admin: { readOnly: true } },
    { name: "effect", type: "textarea", label: "Ce que ça changerait dans nos articles", admin: { readOnly: true } },
    { name: "anchor", type: "text", label: "Section où ajouter", admin: { readOnly: true, condition: (d) => d?.kind === "ajout" } },
    { name: "criterionChange", type: "json", label: "Changement de la grille de la note", admin: { readOnly: true, condition: (d) => d?.kind === "critere" } },
    { name: "currentText", type: "textarea", label: "Texte actuel", admin: { readOnly: true, condition: (d) => d?.kind !== "ajout" && d?.kind !== "critere" } },
    { name: "proposedText", type: "textarea", label: "Texte proposé", admin: { readOnly: true, condition: (d) => d?.kind !== "retrait" && d?.kind !== "critere" } },
    {
      name: "evidence",
      type: "array",
      label: "Preuves",
      labels: { singular: "Preuve", plural: "Preuves" },
      admin: { readOnly: true, description: "Chaque citation est relue sur la page par le support : « vérifiée » = trouvée mot pour mot." },
      fields: [
        { name: "url", type: "text", label: "Adresse", required: true },
        {
          type: "row",
          fields: [
            { name: "source", type: "text", label: "Source" },
            { name: "date", type: "text", label: "Date" },
            { name: "level", type: "select", label: "Niveau", options: PROOF_LEVELS.map((l) => ({ label: l.label, value: l.value })) },
            { name: "verified", type: "checkbox", label: "Citation vérifiée sur la page" },
          ],
        },
        { name: "quote", type: "textarea", label: "Ce que dit la source (citation)" },
      ],
    },
    { name: "decisionNote", type: "textarea", label: "Motif / note de décision", admin: { readOnly: true, condition: (d) => Boolean(d?.decisionNote) } },
  ],
};
