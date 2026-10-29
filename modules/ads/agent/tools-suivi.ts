import { notebookOf, resolveAppuis } from "@/modules/ads/agent/notebook";
import { ROLE_SUBJECT } from "@/modules/ads/agent/roles";
import { clip, type AgentTool, type ToolContext, type ToolOutcome } from "@/modules/ads/agent/tools";
import type { SuiviPort } from "@/modules/ads/agent/types";

/**
 * Les outils de l'analyste (plan Publicité, §9 nonies, étape 3) : lire la
 * campagne en ligne, agir sous les garde-fous, attendre en le disant, noter ce
 * qu'on a appris.
 *
 * Agir n'est permis qu'au passage du LUNDI (et au bilan du mois) : le passage
 * de suivi (tous les 2 jours) lit et prévient, il ne touche à rien (§9 quinquies §5) — les
 * urgences, elles, sont l'affaire du code (lib/alerts.ts).
 */

const who = (ctx: ToolContext) => ROLE_SUBJECT[ctx.agent.role];
const refuse = (ctx: ToolContext, reason: string): ToolOutcome => ({ kind: "ok", isError: true, output: { refus: reason }, line: `${who(ctx)} : ${clip(reason, 110)}` });

function port(ctx: ToolContext): SuiviPort {
  if (!ctx.deps.suivi) throw new Error("Le suivi des campagnes en ligne n'est pas branché.");
  return ctx.deps.suivi;
}

const lireResultats: AgentTool = {
  definition: {
    name: "lire_resultats",
    description:
      "Le rapport de la campagne en ligne, calculé par le code : totaux de la période et de la précédente (dépense, clics vers le site, vues de la page, leads du site, qualifiés, gagnés, taux et coûts), tendances, chaque ensemble (budget, répétition, phase d'apprentissage, dernier changement) et chaque publicité (sa créa, sa part de la dépense, sa tendance, « usee » si elle s'use), les alertes ouvertes et les jours.",
    input_schema: { type: "object", properties: { jours: { type: "number", enum: [7, 14, 30], description: "La période, 7 jours par défaut." } } },
  },
  async run(ctx, input) {
    const days = [7, 14, 30].includes(Number(input.jours)) ? Number(input.jours) : 7;
    const r = await port(ctx).report(ctx.run.campaign, days);
    const t = r.totaux;
    return {
      kind: "ok",
      output: r,
      line: `${who(ctx)} lit les résultats sur ${days} jours : ${t.depenseEur.toFixed(2)} €, ${t.vuesPage} vues de la page, ${t.leadsSite} lead(s) du site.`,
    };
  },
};

const lireJournal: AgentTool = {
  definition: {
    name: "lire_journal",
    description: "Les décisions récentes sur la campagne (actions exécutées, proposées, bloquées et pourquoi ; attentes) et les alertes, les plus récentes d'abord. À lire avant d'agir : ne pas refaire ce qui vient d'être fait.",
    input_schema: { type: "object", properties: { jours: { type: "number", description: "Combien de jours en arrière (30 par défaut, 90 au plus)." } } },
  },
  async run(ctx, input) {
    const days = Math.min(90, Math.max(1, Number(input.jours) || 30));
    const j = await port(ctx).journal(ctx.run.campaign, days);
    return { kind: "ok", output: j, line: `${who(ctx)} relit le journal : ${j.decisions.length} décision(s), ${j.alertes.length} alerte(s) sur ${days} jours.` };
  },
};

const agir: AgentTool = {
  definition: {
    name: "agir",
    description:
      "Change le budget quotidien d'un ensemble, met en pause ou réactive une publicité, un ensemble ou la campagne. Les garde-fous du code jugent : exécutée (campagne autonome, dans les bornes), proposée à Charlie, ou bloquée (gel des 7 jours, 72 h depuis le dernier changement de l'objet, ±20 % de budget, plancher, plafond du compte). Le budget actuel est relu par le code. Une action bloquée n'est pas à contourner : attends.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["budget", "pause", "activation"] },
        niveau: { type: "string", enum: ["campaign", "adset", "ad"] },
        id: { type: "string", description: "L'identifiant Meta de l'objet, tel que le rapport le donne." },
        nouveau_budget_eur: { type: "number", description: "Pour un budget : le nouveau montant quotidien, en euros." },
        justification: { type: "string", description: "Pourquoi, chiffres du rapport à l'appui." },
        appuis: { type: "array", items: { type: "string" }, description: "Les références (C…, A…) qui ont pesé ; liste vide si aucune." },
      },
      required: ["type", "niveau", "id", "justification", "appuis"],
    },
  },
  async run(ctx, input) {
    if (ctx.run.kind === "quotidien") return refuse(ctx, "Le passage de suivi (tous les 2 jours) lit et prévient ; il n'agit pas. Note ce que tu proposes dans ton résultat : le passage du lundi décidera.");
    const appuis = resolveAppuis(notebookOf(ctx.run), input.appuis);
    if ("error" in appuis) return refuse(ctx, appuis.error);
    const justification = String(input.justification ?? "").trim();
    if (!justification) return refuse(ctx, "Une action sans justification ne part pas.");
    try {
      const r = await port(ctx).act(
        ctx.run.campaign,
        { kind: input.type as "budget", level: input.niveau as "adset", externalId: String(input.id ?? "").trim(), toEur: input.nouveau_budget_eur == null ? undefined : Number(input.nouveau_budget_eur) },
        justification,
        { run: ctx.run.id, agent: ctx.agent.id, step: ctx.step.id },
        { instructions: appuis.instructions, learnings: appuis.learnings, citations: appuis.citations },
      );
      const verdict = r.error ? `échec chez Meta (${r.error})` : r.outcome === "executer" ? "appliquée" : r.outcome === "proposer" ? "proposée à Charlie" : "bloquée";
      return {
        kind: "ok",
        isError: r.outcome === "bloquer" || Boolean(r.error),
        output: { decision: r.decision, issue: r.error ? "echec" : r.outcome, raisons: r.reasons, erreur: r.error },
        line: `${who(ctx)} : ${r.summary} — ${verdict}${r.outcome === "bloquer" ? ` (${clip(r.reasons.join(" "), 80)})` : ""}.`,
      };
    } catch (e) {
      return refuse(ctx, (e as Error).message);
    }
  },
};

const attendre: AgentTool = {
  definition: {
    name: "attendre",
    description: "« Attendre » est une décision : sous le volume minimum, pendant le gel des 7 jours ou la phase d'apprentissage de Meta, ou quand rien ne justifie de bouger. Journalisée avec sa raison, pour qu'on sache pourquoi rien n'a bougé.",
    input_schema: {
      type: "object",
      properties: {
        raison: { type: "string", description: "Pourquoi on attend, et ce qu'on attend pour décider (chiffres à l'appui)." },
        appuis: { type: "array", items: { type: "string" } },
      },
      required: ["raison", "appuis"],
    },
  },
  async run(ctx, input) {
    const raison = String(input.raison ?? "").trim();
    if (!raison) return refuse(ctx, "Dis pourquoi tu attends.");
    const appuis = resolveAppuis(notebookOf(ctx.run), input.appuis);
    if ("error" in appuis) return refuse(ctx, appuis.error);
    await ctx.deps.store.createDecision({
      campaign: ctx.run.campaign,
      run: ctx.run.id,
      agent: ctx.agent.id,
      step: ctx.step.id,
      kind: "attente",
      status: "executee",
      rationale: raison,
      instructions: appuis.instructions,
      learnings: appuis.learnings,
      citations: appuis.citations,
    });
    return { kind: "ok", output: { ok: true }, line: `${who(ctx)} attend : ${clip(raison, 100)}` };
  },
};

const noterApprentissage: AgentTool = {
  definition: {
    name: "noter_apprentissage",
    description:
      "Note dans le carnet ce que les résultats ont montré, en UNE phrase vérifiable (« Sur cette campagne, la vidéo C19 obtient deux fois le taux de clic de C17 à dépense égale »). Seulement ce qui est établi par les chiffres, avec la confiance qu'ils permettent. « global » le propose pour toutes les campagnes : Charlie valide.",
    input_schema: {
      type: "object",
      properties: {
        phrase: { type: "string" },
        confiance: { type: "string", enum: ["faible", "moyenne", "forte"] },
        global: { type: "boolean" },
      },
      required: ["phrase", "confiance"],
    },
  },
  async run(ctx, input) {
    const phrase = String(input.phrase ?? "").trim();
    if (!phrase || phrase.length > 300) return refuse(ctx, "Une phrase, de 300 caractères au plus.");
    const confidence = ["faible", "moyenne", "forte"].includes(String(input.confiance)) ? (String(input.confiance) as "faible") : "faible";
    const id = await port(ctx).learn(ctx.run.campaign, { statement: phrase, confidence, global: input.global === true, decision: null });
    return { kind: "ok", output: { apprentissage: id }, line: `${who(ctx)} note : « ${clip(phrase, 100)} »${input.global === true ? " (proposé pour toutes les campagnes)" : ""}.` };
  },
};

const DIMENSIONS = ["angle", "accroche", "ton", "format", "visuel", "cta", "style", "musique", "page", "audience"];

const lireTests: AgentTool = {
  definition: {
    name: "lire_tests",
    description: "Les tests A/B de la campagne : celui en cours (où il en est) et les derniers clos, avec le verdict CALCULÉ PAR LE CODE (gagnant, probabilité, confiance) et les chiffres par variante. Un verdict ne se discute pas : il s'interprète.",
    input_schema: { type: "object", properties: {} },
  },
  async run(ctx) {
    const t = await port(ctx).tests(ctx.run.campaign);
    const open = t.find((x) => x.etat === "en-cours" || x.etat === "en-attente-de-volume");
    return { kind: "ok", output: t, line: `${who(ctx)} relit les tests : ${open ? `un en cours (${clip(open.ouEnEst ?? open.etat, 60)})` : "aucun en cours"}, ${t.filter((x) => x !== open).length} clos.` };
  },
};

const ouvrirTest: AgentTool = {
  definition: {
    name: "ouvrir_test",
    description:
      "Ouvre un test A/B entre des publicités EN LIGNE de la campagne (un seul test à la fois). Une seule différence entre les variantes (la dimension). Le code le juge à chaque synchro : volume et durée minimum, puis gagnant à 95 % (ou 80 % après deux fois la durée minimum), ou « sans verdict » au bout de 42 jours. Choisis la métrique que la campagne peut atteindre : sans leads, juger sur le coût par lead n'aboutira jamais.",
    input_schema: {
      type: "object",
      properties: {
        hypothese: { type: "string", description: "Ce qu'on cherche à savoir, en une phrase vérifiable." },
        dimension: { type: "string", enum: DIMENSIONS },
        metrique: { type: "string", enum: ["cpl-qualifie", "cpl", "cout-par-vue", "ctr"] },
        variantes: {
          type: "array",
          items: { type: "object", properties: { nom: { type: "string" }, pubs: { type: "array", items: { type: "string" } } }, required: ["nom", "pubs"] },
          description: "2 à 4 variantes ; chacune = des identifiants Meta de publicités de la campagne.",
        },
        appuis: { type: "array", items: { type: "string" } },
      },
      required: ["hypothese", "dimension", "metrique", "variantes", "appuis"],
    },
  },
  async run(ctx, input) {
    if (ctx.run.kind === "quotidien") return refuse(ctx, "Un test s'ouvre au passage du lundi.");
    const appuis = resolveAppuis(notebookOf(ctx.run), input.appuis);
    if ("error" in appuis) return refuse(ctx, appuis.error);
    const variants = (Array.isArray(input.variantes) ? input.variantes : []).map((v: { nom?: unknown; pubs?: unknown }) => ({ label: String(v.nom ?? ""), ads: Array.isArray(v.pubs) ? v.pubs.map(String) : [] }));
    try {
      const id = await port(ctx).openTest(ctx.run.campaign, { hypothesis: String(input.hypothese ?? ""), dimension: String(input.dimension ?? ""), metric: String(input.metrique ?? ""), variants }, ctx.run.id);
      await ctx.deps.store.createDecision({
        campaign: ctx.run.campaign,
        run: ctx.run.id,
        agent: ctx.agent.id,
        step: ctx.step.id,
        kind: "test",
        status: "executee",
        rationale: String(input.hypothese ?? ""),
        after: { test: id, dimension: input.dimension, metrique: input.metrique, variantes: variants },
        instructions: appuis.instructions,
        learnings: appuis.learnings,
        citations: appuis.citations,
      });
      return { kind: "ok", output: { test: id }, line: `${who(ctx)} ouvre un test : « ${clip(String(input.hypothese ?? ""), 90)} »` };
    } catch (e) {
      return refuse(ctx, (e as Error).message);
    }
  },
};

const interpreterTest: AgentTool = {
  definition: {
    name: "interpreter_test",
    description: "Écrit ce qu'on retient d'un test CLOS (conclu ou sans verdict), en une ou deux phrases. Puis, s'il a établi quelque chose, note-le au carnet.",
    input_schema: { type: "object", properties: { test: { type: "number" }, interpretation: { type: "string" } }, required: ["test", "interpretation"] },
  },
  async run(ctx, input) {
    const text = String(input.interpretation ?? "").trim();
    if (!text) return refuse(ctx, "Une interprétation vide ne s'écrit pas.");
    try {
      await port(ctx).interpret(ctx.run.campaign, Number(input.test), text);
      return { kind: "ok", output: { ok: true }, line: `${who(ctx)} interprète le test ${input.test} : ${clip(text, 90)}` };
    } catch (e) {
      return refuse(ctx, (e as Error).message);
    }
  },
};

const demanderCreas: AgentTool = {
  definition: {
    name: "demander_creas",
    description:
      "Fait préparer de nouvelles créas pour la campagne en ligne : une préparation part (stratège, rédacteur, directeur artistique, contrôleur), les créas vont « À valider », Charlie fait les visuels et valide, puis elles s'ajoutent SEULES à la campagne. Quand une pub s'use, qu'une seule pub porte toute la campagne, ou pour tester une idée. Refusé si des créas attendent déjà Charlie, ou si le quota de la semaine est atteint.",
    input_schema: {
      type: "object",
      properties: {
        raison: { type: "string", description: "Ce que tu as constaté, chiffres à l'appui : ce qui s'use, ce qui manque, ce qu'il faut tester." },
        angles: { type: "array", items: { type: "string" }, description: "Pistes d'angles (facultatif) ; le stratège tranche." },
        nombre: { type: "number", description: "Combien de créas (1 à 4, 2 par défaut)." },
        appuis: { type: "array", items: { type: "string" } },
      },
      required: ["raison", "appuis"],
    },
  },
  async run(ctx, input) {
    if (ctx.run.kind === "quotidien") return refuse(ctx, "De nouvelles créas se demandent au passage du lundi.");
    const appuis = resolveAppuis(notebookOf(ctx.run), input.appuis);
    if ("error" in appuis) return refuse(ctx, appuis.error);
    const raison = String(input.raison ?? "").trim();
    try {
      const r = await port(ctx).renew(
        ctx.run.campaign,
        { reason: raison, angles: Array.isArray(input.angles) ? input.angles.map(String) : [], count: Number(input.nombre) || 2 },
        { run: ctx.run.id, agent: ctx.agent.id },
      );
      await ctx.deps.store.createDecision({
        campaign: ctx.run.campaign,
        run: ctx.run.id,
        agent: ctx.agent.id,
        step: ctx.step.id,
        kind: "renouvellement",
        status: "executee",
        rationale: raison,
        after: { preparation: r.run, angles: input.angles ?? [], nombre: input.nombre ?? 2, budgetEur: r.budgetEur },
        instructions: appuis.instructions,
        learnings: appuis.learnings,
        citations: appuis.citations,
      });
      return { kind: "ok", output: { preparation: r.run, budget_eur: r.budgetEur }, line: `${who(ctx)} fait préparer de nouvelles créas : ${clip(raison, 90)}` };
    } catch (e) {
      return refuse(ctx, (e as Error).message);
    }
  },
};

const preparerProspects: AgentTool = {
  definition: {
    name: "preparer_campagne_prospects",
    description:
      "Quand Meta reçoit assez de leads (10 en 30 jours, par l'API Conversions) : prépare en BROUILLON la campagne qui optimisera sur les prospects — même compte, brief, budget et ciblage, objectif Prospects, avec les créas EN LIGNE que tu choisis (les gagnantes). Charlie la publie ; ensuite, propose de couper l'ancienne. Une seule bascule par campagne.",
    input_schema: {
      type: "object",
      properties: {
        justification: { type: "string", description: "Pourquoi maintenant, chiffres à l'appui." },
        creas: { type: "array", items: { type: "number" }, description: "Les identifiants des créas en ligne à reprendre (rapport : publicites[].crea.id)." },
        appuis: { type: "array", items: { type: "string" } },
      },
      required: ["justification", "creas", "appuis"],
    },
  },
  async run(ctx, input) {
    if (ctx.run.kind === "quotidien") return refuse(ctx, "La bascule se prépare au passage du lundi.");
    const appuis = resolveAppuis(notebookOf(ctx.run), input.appuis);
    if ("error" in appuis) return refuse(ctx, appuis.error);
    const reason = String(input.justification ?? "").trim();
    try {
      const r = await port(ctx).prospects(ctx.run.campaign, { reason, creatives: Array.isArray(input.creas) ? input.creas.map(Number) : [] }, { run: ctx.run.id, agent: ctx.agent.id, step: ctx.step.id });
      await ctx.deps.store.createDecision({
        campaign: ctx.run.campaign,
        run: ctx.run.id,
        agent: ctx.agent.id,
        step: ctx.step.id,
        kind: "bascule",
        status: "executee",
        rationale: reason,
        after: { campagne: r.campaign, creas: r.creatives },
        instructions: appuis.instructions,
        learnings: appuis.learnings,
        citations: appuis.citations,
      });
      return { kind: "ok", output: { campagne: r.campaign, creas: r.creatives }, line: `${who(ctx)} prépare la campagne Prospects (brouillon n° ${r.campaign}, ${r.creatives.length} créa(s)) : à publier par Charlie.` };
    } catch (e) {
      return refuse(ctx, (e as Error).message);
    }
  },
};

export const SUIVI_TOOLS: AgentTool[] = [preparerProspects, demanderCreas, lireResultats, lireJournal, agir, attendre, noterApprentissage, lireTests, ouvrirTest, interpreterTest];
