import { canSpend, splitViolations } from "@/modules/ads/agent/budget";
import { MAX_REJECTIONS } from "@/modules/ads/agent/limits";
import { notebookOf, resolveAppuis, type Appuis } from "@/modules/ads/agent/notebook";
import { ROLE_SUBJECT } from "@/modules/ads/agent/roles";
import { clip, type AgentTool, type ToolContext, type ToolOutcome } from "@/modules/ads/agent/tools";
import type { Id } from "@/modules/ads/agent/types";
import type { DecisionKind, DecisionStatus } from "@/modules/ads/collections/AdDecisions";
import { eur } from "@/modules/ads/lib/spend";
import { MAX_VARIANTS } from "@/modules/ads/video/mount";
import { SCENE_TYPES } from "@/modules/ads/video/scenes";
import { MAX_CAPTION_CHARS, MAX_OPENING_CHARS, MAX_SHOT, MAX_TOTAL, MIN_SHOT, MIN_TOTAL, MIN_ZOOM } from "@/modules/ads/video/score";

/**
 * Les outils qui passent par l'atelier de créas (plan Publicité, §9 quater,
 * commit 4). Chacun APPELLE l'atelier par `deps.atelier` — génération et
 * garde-fous des textes, rendu des visuels, file « À valider » — et rien n'est
 * recopié ici. Les choix du stratège et de l'orchestrateur deviennent des
 * décisions journalisées, avec leur justification.
 *
 * Tout ce qui toucherait Meta (audiences, répartition du budget) naît
 * « proposée » : la 3c ne publie rien.
 *
 * Chaque outil de décision exige ses `appuis` (§9 quinquies) : les consignes
 * et apprentissages qui ont pesé, cités par leur référence. Le code vérifie
 * qu'ils sont dans la photo du passage avant d'écrire quoi que ce soit.
 */

const who = (ctx: ToolContext) => ROLE_SUBJECT[ctx.agent.role];
const idOf = (v: unknown): Id => (typeof v === "number" ? v : String(v));
const errorOf = (ctx: ToolContext, e: unknown, what: string): ToolOutcome => ({
  kind: "ok",
  isError: true,
  // Un appel facturé puis refusé (réponse tronquée, déclinée) reste dans la dépense de l'agent.
  costEur: (e as { costEur?: number }).costEur,
  output: { refus: (e as Error).message },
  line: `${who(ctx)} : ${what} refusé — ${clip((e as Error).message, 100)}`,
});

/** Le paramètre `appuis` des outils de décision. */
const APPUIS = {
  type: "array",
  items: { type: "string" },
  description: "Les références (ex. C4, A12) des consignes et apprentissages qui ont pesé sur ce choix ; liste vide si aucune.",
} as const;

/** Les appuis vérifiés, ou le refus à rendre au modèle (rien n'est journalisé : la décision n'a pas eu lieu). */
function appuisOf(ctx: ToolContext, input: Record<string, unknown>): Appuis | ToolOutcome {
  const r = resolveAppuis(notebookOf(ctx.run), input.appuis);
  if ("error" in r) return { kind: "ok", isError: true, output: { refus: r.error }, line: `${who(ctx)} : décision refusée — ${clip(r.error, 100)}` };
  return r;
}
const isOutcome = (v: Appuis | ToolOutcome): v is ToolOutcome => "kind" in v;

/**
 * Pas de stratégie à l'aveugle (premier passage réel, 13/10/2026 : des créas
 * écrites sans aucune analyse). Positionnement et angles exigent que les
 * publicités des concurrents aient été lues dans ce passage, et aucun texte ne
 * s'écrit avant que le stratège ait choisi ses angles.
 */
async function competitorsRead(ctx: ToolContext): Promise<boolean> {
  for (const a of ctx.agents) {
    const steps = await ctx.deps.store.listSteps(a.id);
    if (steps.some((st) => st.tool === "lire_pubs_concurrents" && st.status === "fait" && !(st.output as { isError?: boolean } | null)?.isError)) return true;
  }
  return false;
}

const NO_COMPETITORS: ToolOutcome = {
  kind: "ok",
  isError: true,
  output: { refus: "Lis d'abord les publicités des concurrents (« lire_pubs_concurrents ») : un positionnement ou un angle se choisit face à ce qu'ils disent." },
  line: "Décision refusée : les publicités des concurrents n'ont pas encore été lues.",
};

/** Ce que disent les concurrents, et en quoi ce choix s'en démarque : exigé, et gardé dans la décision. */
const CONCURRENTS = {
  type: "string",
  description: "Ce que disent les concurrents sur ce terrain (d'après « lire_pubs_concurrents »), et en quoi ce choix s'en démarque.",
} as const;

async function decide(ctx: ToolContext, kind: DecisionKind, status: DecisionStatus, rationale: string, after: unknown, appuis: Appuis, guardrail?: string): Promise<Id> {
  return ctx.deps.store.createDecision({
    campaign: ctx.run.campaign,
    run: ctx.run.id,
    agent: ctx.agent.id,
    step: ctx.step.id,
    kind,
    status,
    rationale: rationale.trim() || "—",
    after,
    guardrail: guardrail ?? null,
    instructions: appuis.instructions,
    learnings: appuis.learnings,
    citations: appuis.citations,
  });
}

const lireBrief: AgentTool = {
  definition: {
    name: "lire_brief",
    description: "Le brief de la campagne, le kit de marque, les faits sourcés autorisés, le quota de créas de la semaine et les gabarits de visuels disponibles.",
    input_schema: { type: "object", properties: {} },
  },
  async run(ctx) {
    const b = await ctx.deps.atelier.brief(ctx.run.campaign);
    return { kind: "ok", output: b, line: `${who(ctx)} lit le brief et le kit de marque (${b.quotaRestant} créa(s) possible(s) cette semaine).` };
  },
};

const genererTextes: AgentTool = {
  definition: {
    name: "generer_textes",
    description:
      "Fait écrire par l'atelier les textes d'1 à 3 angles (textes principaux, titres, descriptions, accroche), passés aux garde-fous : chiffres sourcés, limites Meta, interdits, ton. Chaque angle devient une créa. Coûte environ 0,10 € par appel, pris sur ton budget.",
    input_schema: {
      type: "object",
      properties: {
        angles: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3, description: "Les angles, tels que le stratège les a choisis." },
        test_de_ton: { type: "boolean", description: "Ajouter une variante du premier angle au ton opposé (test étiqueté)." },
      },
      required: ["angles"],
    },
  },
  async run(ctx, input) {
    const asked = (Array.isArray(input.angles) ? input.angles : []).map((a) => String(a).trim()).filter(Boolean).slice(0, 3);
    if (!asked.length) return { kind: "ok", isError: true, output: { refus: "Aucun angle." }, line: `${who(ctx)} : aucun angle à écrire.` };
    const decided = (await ctx.deps.store.listDecisions(ctx.run.id, "angle")).filter((d) => d.status === "executee");
    if (!decided.length) {
      return {
        kind: "ok",
        isError: true,
        output: { refus: "Aucun angle n'a été choisi par le stratège dans ce passage : rien ne s'écrit avant son analyse (concurrents, site, clients signés)." },
        line: `${who(ctx)} : écriture refusée, le stratège n'a pas encore choisi d'angles.`,
      };
    }
    // Un angle rejeté MAX_REJECTIONS fois par le contrôleur ne se réécrit plus : la règle tient en code, pas dans une consigne
    // (relecture du 01/10/2026, M4).
    const exhausted: string[] = [];
    for (const a of asked) if ((await rejectionsOf(ctx, a)) >= MAX_REJECTIONS) exhausted.push(a);
    const angles = asked.filter((a) => !exhausted.includes(a));
    if (!angles.length) {
      return { kind: "ok", isError: true, output: { refus: `Ces angles ont été rejetés ${MAX_REJECTIONS} fois : on ne les réécrit plus.`, angles: exhausted }, line: `${who(ctx)} : angle(s) rejeté(s) ${MAX_REJECTIONS} fois, pas de réécriture.` };
    }
    try {
      const r = await ctx.deps.atelier.generate(ctx.run.campaign, {
        run: ctx.run.id,
        agent: ctx.agent.id,
        angles,
        toneTest: input.test_de_ton === true,
        // Le budget de l'agent et le plafond global des agents, en plus de ceux de l'atelier.
        preCheck: async (maxEur) => {
          const own = canSpend(ctx.ledger(ctx.agent), maxEur);
          if (own !== true) throw new Error(own);
          await ctx.deps.budget.assert(maxEur, ctx.deps.now());
        },
      });
      const rejected = r.creatives.reduce((n, c) => n + c.texts.filter((t) => t.status !== "ok").length, 0);
      return {
        kind: "ok",
        costEur: r.costEur,
        output: exhausted.length ? { creas: r.creatives, ecartes: exhausted, raison: `rejetés ${MAX_REJECTIONS} fois` } : r.creatives,
        line: `${who(ctx)} fait écrire ${r.creatives.length} créa(s) (${eur(r.costEur)}) : ${angles.map((a) => `« ${clip(a, 50)} »`).join(", ")}${rejected ? ` — ${rejected} texte(s) écarté(s) par les garde-fous` : ""}.`,
      };
    } catch (e) {
      return errorOf(ctx, e, "l'écriture des textes");
    }
  },
};

const rendreVisuels: AgentTool = {
  definition: {
    name: "rendre_visuels",
    description: "Rend les visuels d'une créa aux trois formats Meta, avec un gabarit de l'atelier (voir lire_brief). Sans gabarit, l'atelier choisit selon la matière disponible.",
    input_schema: {
      type: "object",
      properties: { crea: { type: ["number", "string"] }, gabarit: { type: "string", enum: ["capture", "chiffre", "photo", "texte"] } },
      required: ["crea"],
    },
  },
  async run(ctx, input) {
    try {
      const r = await ctx.deps.atelier.render(ctx.run.campaign, idOf(input.crea), input.gabarit ? String(input.gabarit) : undefined);
      return { kind: "ok", output: r, line: `${who(ctx)} rend les visuels de la créa ${String(input.crea)} (gabarit « ${r.template} », ${r.visuals} format(s)).` };
    } catch (e) {
      return errorOf(ctx, e, "le rendu des visuels");
    }
  },
};

const lireRushes: AgentTool = {
  definition: {
    name: "lire_rushes",
    description:
      "La matière des vidéos : les rushes prêts (écrans de l'app, chantier…) avec ce qu'on y voit, la description détaillée validée et ses plans repérés, la durée et le recadrage (zone utile, zone à ne jamais couper) ; les styles actifs, avec quand employer chacun et ce que le moteur en fait (un zoom ou un sous-titre que le style ignore ne sert à rien) ; les musiques, avec quand les employer et leur tempo ; les inspirations de Charlie — des pubs à imiter ou à éviter, réduites à leur fiche de style (elles ne se montent jamais) ; ce que permet le logo ; et les scènes de motion design disponibles, avec leurs données.",
    input_schema: { type: "object", properties: {} },
  },
  async run(ctx) {
    const m = await ctx.deps.atelier.videoMaterial();
    return {
      kind: "ok",
      output: m,
      line: `${who(ctx)} passe en revue ${m.rushes.length} rush(es) prêt(s), ${m.styles.length} style(s), ${m.musiques.length} musique(s)${m.inspirations.length ? ` et ${m.inspirations.length} inspiration(s)` : ""}.`,
    };
  },
};

const RECT = { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } }, description: "En fractions de l'image (0 à 1)." } as const;

const monterVideo: AgentTool = {
  definition: {
    name: "monter_video",
    description: [
      `Monte la vidéo d'une créa : tu écris la partition (les plans, dans l'ordre), le moteur la rend aux trois formats Meta. Tu peux tester plusieurs styles sur une musique, OU un style sur plusieurs musiques — jamais les deux à la fois —, ${MAX_VARIANTS} vidéos au plus.`,
      "La première variante va sur la créa ; chaque suivante crée une copie étiquetée « test de style » ou « test de musique » (même angle, mêmes textes), comptée dans le quota de la semaine.",
      "Sur une musique au tempo connu, le moteur cale chaque coupe sur le temps le plus proche et fait tomber les mots de l'ouverture sur les temps : écris des durées proches de multiples du temps (60 / BPM). Sans musique précisée, c'est celle du Kit de marque.",
      `Le code vérifie la partition avant tout rendu : ${MIN_TOTAL} à ${MAX_TOTAL} s au total, plans de ${MIN_SHOT} à ${MAX_SHOT} s, au moins un plan qui montre le logiciel (rush ou scène recréée), une seule fin et en dernier, des rushes prêts pris dans leur durée, aucun zoom plus serré que ${MIN_ZOOM * 100} % ni qui coupe la zone protégée, aucun chiffre absent des faits sourcés et de l'offre, aucune mention interdite. Un refus dit pourquoi : corrige et rappelle.`,
      "Le rendu prend quelques minutes, sans coût IA ; la vidéo apparaît sur la carte de la créa.",
    ].join(" "),
    input_schema: {
      type: "object",
      properties: {
        crea: { type: ["number", "string"] },
        styles: { type: "array", items: { type: "number" }, minItems: 1, maxItems: MAX_VARIANTS, description: "Les identifiants des styles (voir lire_rushes), le préféré d'abord." },
        musiques: { type: "array", items: { type: "number" }, minItems: 1, maxItems: MAX_VARIANTS, description: "Les identifiants des musiques (voir lire_rushes), la préférée d'abord. Omis : la musique du Kit de marque." },
        partition: {
          type: "object",
          properties: {
            shots: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  kind: {
                    type: "string",
                    enum: ["ouverture", "rush", "preuve", "scene", "logo", "fin"],
                    description: "scene : l'interface de TIM recréée en motion design (voir « scenes » dans lire_rushes). logo : le logo seul, animé — une signature, en ouverture par exemple.",
                  },
                  scene: { type: "string", enum: [...SCENE_TYPES], description: "scene : le type de scène." },
                  data: { type: "object", description: "scene : les données de la scène (voir « scenes » dans lire_rushes), et « legende » facultative." },
                  seconds: { type: "number" },
                  text: { type: "string", description: `ouverture : l'accroche, ${MAX_OPENING_CHARS} caractères au plus.` },
                  highlight: { type: "string", description: "ouverture : le mot à faire ressortir (dans le texte)." },
                  sub: { type: "string", description: "ouverture : une ligne sous l'accroche." },
                  rush: { type: "number", description: "rush : l'identifiant du rush." },
                  from: { type: "number", description: "rush : début du passage, en secondes." },
                  to: { type: "number", description: "rush : fin du passage, en secondes." },
                  zoom: { ...RECT, description: "rush : la zone à montrer de près, en fractions de l'image ; jamais hors de la zone utile ni coupant la zone protégée." },
                  caption: { type: "string", description: `rush : le sous-titre, ${MAX_CAPTION_CHARS} caractères au plus.` },
                  fact: { type: "number", description: "preuve : l'identifiant du fait sourcé (voir lire_brief)." },
                  line: { type: "string", description: "fin : une phrase au-dessus du bouton." },
                },
                required: ["kind", "seconds"],
              },
            },
          },
          required: ["shots"],
        },
        justification: { type: "string", description: "Pourquoi ce montage et ces styles pour cet angle." },
      },
      required: ["crea", "styles", "partition", "justification"],
    },
  },
  async run(ctx, input) {
    const styles = (Array.isArray(input.styles) ? input.styles : []).map(idOf);
    try {
      const musics = Array.isArray(input.musiques) ? input.musiques.map(idOf) : undefined;
      const r = await ctx.deps.atelier.video(ctx.run.campaign, idOf(input.crea), { styles, musics, score: input.partition });
      const tests = r.creas.filter((c) => c.test).length;
      const label = (c: (typeof r.creas)[number]) => `« ${clip(c.styleNom, 30)} »${c.musiqueNom ? ` sur « ${clip(c.musiqueNom, 30)} »` : ", sans musique"}`;
      return {
        kind: "ok",
        output: r,
        line: `${who(ctx)} monte la vidéo de la créa ${String(input.crea)} : ${r.creas.map(label).join(" ; ")}${tests ? ` (${tests} test(s))` : ""}${r.ecartes.length ? ` — ${r.ecartes.length} variante(s) écartée(s) : quota` : ""}.`,
      };
    } catch (e) {
      return errorOf(ctx, e, "le montage vidéo");
    }
  },
};

/** Les rejets déjà prononcés sur un angle dans ce passage : la réécriture a une limite. */
async function rejectionsOf(ctx: ToolContext, angle: string): Promise<number> {
  const past = await ctx.deps.store.listDecisions(ctx.run.id, "rejet-controleur");
  return past.filter((d) => (d.after as { angle?: string } | null)?.angle === angle).length;
}

const verifierCrea: AgentTool = {
  definition: {
    name: "verifier_crea",
    description: "Une créa telle qu'elle est : angle demandé, textes et verdict des garde-fous de l'atelier, visuels, rejets déjà prononcés sur cet angle.",
    input_schema: { type: "object", properties: { crea: { type: ["number", "string"] } }, required: ["crea"] },
  },
  async run(ctx, input) {
    const [c] = await ctx.deps.atelier.creatives(ctx.run.campaign, [idOf(input.crea)]);
    if (!c) return { kind: "ok", isError: true, output: { refus: "Créa introuvable." }, line: `${who(ctx)} : créa ${String(input.crea)} introuvable.` };
    const rejets = await rejectionsOf(ctx, c.requestedAngle ?? c.angle);
    return { kind: "ok", output: { ...c, rejetsPrecedents: rejets, rejetsMax: MAX_REJECTIONS }, line: `${who(ctx)} relit la créa « ${clip(c.angle, 60)} ».` };
  },
};

const jugerCrea: AgentTool = {
  definition: {
    name: "juger_crea",
    description: `Accepte ou rejette une créa, avec un motif précis (charte, faux témoignage, chiffre sans source, promesse invérifiable…). Au-delà de ${MAX_REJECTIONS} rejets sur le même angle, on ne réécrit plus : la créa part « À valider » marquée rejetée.`,
    input_schema: {
      type: "object",
      properties: { crea: { type: ["number", "string"] }, verdict: { type: "string", enum: ["accepte", "rejete"] }, motif: { type: "string" }, appuis: APPUIS },
      required: ["crea", "verdict", "motif", "appuis"],
    },
  },
  async run(ctx, input) {
    const appuis = appuisOf(ctx, input);
    if (isOutcome(appuis)) return appuis;
    const [c] = await ctx.deps.atelier.creatives(ctx.run.campaign, [idOf(input.crea)]);
    if (!c) return { kind: "ok", isError: true, output: { refus: "Créa introuvable." }, line: `${who(ctx)} : créa ${String(input.crea)} introuvable.` };
    const motif = String(input.motif ?? "").trim();
    if (input.verdict !== "rejete") return { kind: "ok", output: { accepte: true }, line: `${who(ctx)} accepte la créa « ${clip(c.angle, 60)} ».` };
    if (!motif) return { kind: "ok", isError: true, output: { refus: "Un rejet porte un motif." }, line: `${who(ctx)} : rejet sans motif, refusé.` };
    const angle = c.requestedAngle ?? c.angle;
    const n = (await rejectionsOf(ctx, angle)) + 1;
    const last = n >= MAX_REJECTIONS;
    await decide(ctx, "rejet-controleur", "executee", motif, { crea: c.id, angle, rejet: n, limiteAtteinte: last }, appuis);
    return {
      kind: "ok",
      output: last ? { rejete: true, limiteAtteinte: true, consigne: "Ne pas réécrire cet angle : la créa part « À valider » marquée rejetée, avec les motifs." } : { rejete: true, rejet: n, rejetsMax: MAX_REJECTIONS },
      line: `${who(ctx)} rejette la créa « ${clip(c.angle, 50)} » (${n}/${MAX_REJECTIONS}) : ${clip(motif, 80)}`,
    };
  },
};

const proposerPositionnement: AgentTool = {
  definition: {
    name: "proposer_positionnement",
    description: "Pose le positionnement de la campagne : ce qu'on promet, à qui, contre quoi. Journalisé avec sa justification.",
    input_schema: {
      type: "object",
      properties: { positionnement: { type: "string" }, concurrents: CONCURRENTS, justification: { type: "string" }, appuis: APPUIS },
      required: ["positionnement", "concurrents", "justification", "appuis"],
    },
  },
  async run(ctx, input) {
    const appuis = appuisOf(ctx, input);
    if (isOutcome(appuis)) return appuis;
    if (!(await competitorsRead(ctx))) return NO_COMPETITORS;
    const concurrents = String(input.concurrents ?? "").trim();
    if (!concurrents) return { kind: "ok", isError: true, output: { refus: "Dis ce que font les concurrents et en quoi ce positionnement s'en démarque." }, line: `${who(ctx)} : positionnement refusé, sans comparaison aux concurrents.` };
    const positionnement = String(input.positionnement ?? "").trim();
    await decide(ctx, "positionnement", "executee", String(input.justification ?? ""), { positionnement, concurrents }, appuis);
    return { kind: "ok", output: { ok: true }, line: `${who(ctx)} pose le positionnement : « ${clip(positionnement, 90)} »` };
  },
};

const proposerAngles: AgentTool = {
  definition: {
    name: "proposer_angles",
    description: "Choisit les angles de la campagne (1 à 3), chacun en une ligne. Journalisé avec sa justification.",
    input_schema: {
      type: "object",
      properties: { angles: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 }, concurrents: CONCURRENTS, justification: { type: "string" }, appuis: APPUIS },
      required: ["angles", "concurrents", "justification", "appuis"],
    },
  },
  async run(ctx, input) {
    const appuis = appuisOf(ctx, input);
    if (isOutcome(appuis)) return appuis;
    if (!(await competitorsRead(ctx))) return NO_COMPETITORS;
    const concurrents = String(input.concurrents ?? "").trim();
    if (!concurrents) return { kind: "ok", isError: true, output: { refus: "Dis ce que font les concurrents et en quoi ces angles s'en démarquent." }, line: `${who(ctx)} : angles refusés, sans comparaison aux concurrents.` };
    const angles = (Array.isArray(input.angles) ? input.angles : []).map((a) => String(a).trim()).filter(Boolean).slice(0, 3);
    if (!angles.length) return { kind: "ok", isError: true, output: { refus: "Aucun angle." }, line: `${who(ctx)} : aucun angle proposé.` };
    await decide(ctx, "angle", "executee", String(input.justification ?? ""), { angles, concurrents }, appuis);
    return { kind: "ok", output: { ok: true, angles }, line: `${who(ctx)} choisit ${angles.length} angle(s) : ${angles.map((a) => `« ${clip(a, 40)} »`).join(", ")}.` };
  },
};

const MODES = { "advantage-plus": "Advantage+ seul", "test-detaille-vs-advantage-plus": "ciblage détaillé contre Advantage+" } as const;

const proposerAudiences: AgentTool = {
  definition: {
    name: "proposer_audiences",
    description:
      "Propose les audiences Meta. Un test « ciblage détaillé contre Advantage+ » n'est permis que si le budget Meta alimente les deux ensembles : donne les chiffres (budget, CPL cible, conversions attendues par semaine et par ensemble) et justifie le seuil. Sinon, Advantage+ seul. Une proposition : rien n'est envoyé à Meta.",
    input_schema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: Object.keys(MODES) },
        budget_meta_quotidien_eur: { type: "number" },
        ensembles: { type: "number", description: "1 pour Advantage+ seul, 2 pour le test." },
        cpl_cible_eur: { type: "number" },
        conversions_semaine_par_ensemble: { type: "number" },
        ciblage_detaille: { type: "string", description: "Métiers, âges, lieux — pour le test." },
        justification: { type: "string", description: "Et le seuil retenu, chiffres à l'appui." },
        appuis: APPUIS,
      },
      required: ["mode", "budget_meta_quotidien_eur", "ensembles", "justification", "appuis"],
    },
  },
  async run(ctx, input) {
    const appuis = appuisOf(ctx, input);
    if (isOutcome(appuis)) return appuis;
    const mode = String(input.mode) as keyof typeof MODES;
    const num = (k: string) => (typeof input[k] === "number" && Number.isFinite(input[k]) && (input[k] as number) > 0 ? (input[k] as number) : null);
    const after = {
      mode,
      budgetMetaQuotidienEur: num("budget_meta_quotidien_eur"),
      ensembles: num("ensembles"),
      cplCibleEur: num("cpl_cible_eur"),
      conversionsSemaineParEnsemble: num("conversions_semaine_par_ensemble"),
      ciblageDetaille: input.ciblage_detaille ? String(input.ciblage_detaille) : null,
    };
    // Décision 7 du 29/09/2026 : le test exige ses chiffres, en champs structurés. Le seuil reste le jugement de l'agent.
    const missing =
      mode === "test-detaille-vs-advantage-plus"
        ? [
            after.ensembles !== 2 && "2 ensembles",
            !after.budgetMetaQuotidienEur && "le budget Meta quotidien",
            !after.cplCibleEur && "le CPL cible",
            !after.conversionsSemaineParEnsemble && "les conversions attendues par semaine et par ensemble",
            !after.ciblageDetaille && "le ciblage détaillé",
          ].filter(Boolean)
        : mode === "advantage-plus"
          ? [!after.budgetMetaQuotidienEur && "le budget Meta quotidien"].filter(Boolean)
          : ["un mode connu"];
    if (missing.length) {
      const reason = `Il manque ${missing.join(", ")}.`;
      await decide(ctx, "audience", "bloquee", String(input.justification ?? ""), after, appuis, reason);
      return { kind: "ok", isError: true, output: { refus: reason }, line: `${who(ctx)} : proposition d'audience refusée — ${reason}` };
    }
    await decide(ctx, "audience", "proposee", String(input.justification ?? ""), after, appuis);
    return { kind: "ok", output: { ok: true }, line: `${who(ctx)} propose ${MODES[mode]} (${eur(after.budgetMetaQuotidienEur!)} par jour chez Meta).` };
  },
};

const repartirBudget: AgentTool = {
  definition: {
    name: "repartir_budget",
    description:
      "Partage le budget quotidien total de la campagne entre l'IA (après publication) et la dépense Meta. Les bornes sont vérifiées en code (part IA maximale, plancher Meta, total). Une proposition : rien n'est envoyé à Meta.",
    input_schema: {
      type: "object",
      properties: { ia_eur_jour: { type: "number" }, meta_eur_jour: { type: "number" }, justification: { type: "string" }, appuis: APPUIS },
      required: ["ia_eur_jour", "meta_eur_jour", "justification", "appuis"],
    },
  },
  async run(ctx, input) {
    const appuis = appuisOf(ctx, input);
    if (isOutcome(appuis)) return appuis;
    const split = { aiDailyEur: Number(input.ia_eur_jour), metaDailyEur: Number(input.meta_eur_jour) };
    const why = String(input.justification ?? "");
    const b = await ctx.deps.atelier.campaignBudget(ctx.run.campaign);
    const problems = !b ? ["Aucun budget quotidien total n'est saisi sur la campagne (onglet Agent)."] : splitViolations(b, split);
    if (problems.length) {
      await decide(ctx, "repartition-budget", "bloquee", why, split, appuis, problems.join(" "));
      return { kind: "ok", isError: true, output: { refus: problems }, line: `${who(ctx)} : répartition refusée — ${clip(problems.join(" "), 100)}` };
    }
    const decision = await decide(ctx, "repartition-budget", "proposee", why, split, appuis);
    await ctx.deps.atelier.setSplit(ctx.run.campaign, split, decision, ctx.deps.now());
    return { kind: "ok", output: { ok: true }, line: `${who(ctx)} propose ${eur(split.aiDailyEur)} par jour pour l'IA et ${eur(split.metaDailyEur)} pour Meta.` };
  },
};

const deposerAValider: AgentTool = {
  definition: {
    name: "deposer_a_valider",
    description: "Dépose les créas retenues dans « À valider » et termine le passage, avec un résumé de ce qui a été préparé. Une créa non publiable (textes insuffisants) reste en brouillon, avec la raison.",
    input_schema: {
      type: "object",
      properties: { creas: { type: "array", items: { type: ["number", "string"] } }, resume: { type: "string", description: "Positionnement, audiences, répartition, créas : en quelques lignes." } },
      required: ["creas", "resume"],
    },
  },
  async run(ctx, input) {
    const ids = (Array.isArray(input.creas) ? input.creas : []).map(idOf);
    const r = await ctx.deps.atelier.submit(ctx.run.campaign, ids);
    const resume = String(input.resume ?? "").trim();
    return {
      kind: "finish",
      output: r,
      result: { resume, deposees: r.submitted, ecartees: r.skipped },
      line: `${who(ctx)} dépose ${r.submitted.length} créa(s) « À valider »${r.skipped.length ? ` (${r.skipped.length} écartée(s))` : ""} : ${clip(resume || "sans résumé", 90)}`,
    };
  },
};

export const ATELIER_TOOLS: AgentTool[] = [
  lireBrief,
  genererTextes,
  rendreVisuels,
  lireRushes,
  monterVideo,
  verifierCrea,
  jugerCrea,
  proposerPositionnement,
  proposerAngles,
  proposerAudiences,
  repartirBudget,
  deposerAValider,
];
