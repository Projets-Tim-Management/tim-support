import { claudeCostUsd, claudeMaxCostUsd, estimateTokens, usdToEur } from "@/core/lib/ai-pricing";
import { canSpend } from "@/modules/ads/agent/budget";
import { ROLE_SUBJECT } from "@/modules/ads/agent/roles";
import type { LibraryAd } from "@/modules/ads/agent/sources/ad-library";
import { clip, type AgentTool, type ToolContext, type ToolOutcome } from "@/modules/ads/agent/tools";
import { PAGE_ID } from "@/modules/ads/lib/ad-library";
import { ADS_EXTRACTION_MAX_TOKENS, ADS_EXTRACTION_MODEL } from "@/modules/ads/lib/models";
import { eur } from "@/modules/ads/lib/spend";

/**
 * Les outils de lecture du stratège (plan Publicité, §9 quater, commit 5) : le
 * site de TIM, les leads et clients en chiffres anonymes, les publicités des
 * concurrents. Le texte brut est résumé par Haiku (moins cher qu'Opus pour lire),
 * au prix vérifié avant l'appel et compté dans le budget de l'agent comme tout
 * autre appel.
 */

const who = (ctx: ToolContext) => ROLE_SUBJECT[ctx.agent.role];
const refusal = (ctx: ToolContext, e: unknown, what: string): ToolOutcome => ({
  kind: "ok",
  isError: true,
  output: { refus: (e as Error).message },
  line: `${who(ctx)} : ${what} impossible — ${clip((e as Error).message, 100)}`,
});

/** Un résumé par Haiku, sous le budget de l'agent et le plafond global des agents. */
async function extract(ctx: ToolContext, consigne: string, texte: string, detail: string): Promise<{ resume: string; costEur: number }> {
  const req = {
    model: ADS_EXTRACTION_MODEL,
    system: `Tu extrais, pour un stratège publicitaire, ce qui compte dans un texte. ${consigne} N'invente rien : pas de chiffre ni de citation absents du texte. Réponds en français, en lignes courtes.`,
    messages: [{ role: "user" as const, content: texte }],
    tools: [],
    maxTokens: ADS_EXTRACTION_MAX_TOKENS,
  };
  const maxEur = usdToEur(claudeMaxCostUsd(ADS_EXTRACTION_MODEL, estimateTokens(JSON.stringify(req)), ADS_EXTRACTION_MAX_TOKENS));
  const own = canSpend(ctx.ledger(ctx.agent), maxEur);
  if (own !== true) throw new Error(own);
  await ctx.deps.budget.assert(maxEur, ctx.deps.now());
  const res = await ctx.deps.model(req);
  const usd = claudeCostUsd(ADS_EXTRACTION_MODEL, res.usage);
  await ctx.deps.budget.record({ run: ctx.run.id, agent: ctx.agent.id, campaign: ctx.run.campaign, model: ADS_EXTRACTION_MODEL, usd, usage: res.usage, detail: `extraction — ${detail}` });
  const resume = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
  return { resume, costEur: Math.round(usdToEur(usd) * 10_000) / 10_000 };
}

const lireSite: AgentTool = {
  definition: {
    name: "lire_site",
    description:
      "Lit des pages de tim-management.co (et seulement ce domaine) et en résume l'offre, les arguments, les preuves et le ton. Sans adresse : l'accueil et les pages du plan du site (6 au plus).",
    input_schema: { type: "object", properties: { pages: { type: "array", items: { type: "string" }, description: "Adresses https://tim-management.co/… (facultatif)." } } },
  },
  async run(ctx, input) {
    const urls = Array.isArray(input.pages) ? input.pages.map(String) : undefined;
    try {
      const r = await ctx.deps.sources.site(urls);
      if (!r.pages.length) return { kind: "ok", isError: true, output: r, line: `${who(ctx)} : aucune page du site lisible.` };
      const texte = r.pages.map((p) => `### ${p.title || p.url}\n${p.url}\n${p.text}`).join("\n\n");
      const { resume, costEur } = await extract(ctx, "Pour chaque page : l'offre, les arguments, les preuves chiffrées telles qu'écrites, le ton, les appels à l'action.", texte, "site");
      return {
        kind: "ok",
        costEur,
        output: { pages: r.pages.map((p) => ({ url: p.url, titre: p.title })), resume, refusees: r.refused, enErreur: r.failed },
        line: `${who(ctx)} lit ${r.pages.length} page(s) du site (${eur(costEur)})${r.refused.length ? ` — ${r.refused.length} adresse(s) hors du site refusée(s)` : ""}.`,
      };
    } catch (e) {
      return refusal(ctx, e, "la lecture du site");
    }
  },
};

const lireAcquisition: AgentTool = {
  definition: {
    name: "lire_acquisition",
    description:
      "Les leads par canal (volume, opportunités, affaires gagnées, conversion) et les clients signés en chiffres anonymes : par canal, effectif, région, délai de signature. Jamais de nom. Les groupes de moins de 3 sont regroupés.",
    input_schema: { type: "object", properties: { mois: { type: "number", description: "Période, en mois (12 par défaut)." } } },
  },
  async run(ctx, input) {
    const months = typeof input.mois === "number" && input.mois > 0 ? Math.min(36, Math.round(input.mois)) : 12;
    const s = await ctx.deps.sources.acquisition(months);
    return { kind: "ok", output: s, line: `${who(ctx)} lit les leads des ${months} derniers mois et ${s.signes.total} client(s) signé(s), en chiffres anonymes.` };
  },
};

/** Ce qu'un modèle doit voir d'une pub : ses mots, sa durée, ses plateformes — pas un identifiant de trop. */
const adLines = (ads: LibraryAd[]) =>
  ads
    .map((a) => `- ${a.pageName} · ${a.runningDays ?? "?"} j de diffusion${a.stop ? "" : " (en cours)"} · ${a.platforms.join(", ")}\n  ${[...a.titles, ...a.texts, ...a.descriptions].join(" | ")}`)
    .join("\n");

const lirePubsConcurrents: AgentTool = {
  definition: {
    name: "lire_pubs_concurrents",
    description:
      "Les publicités diffusées en France par les concurrents suivis (bibliothèque publicitaire Meta) : angles, promesses, appels à l'action, et durée de diffusion — l'indice de ce qui marche (Meta ne publie ni dépense ni résultats). À analyser, jamais à recopier.",
    input_schema: { type: "object", properties: {} },
  },
  async run(ctx) {
    try {
      const followed = await ctx.deps.sources.competitors();
      if (!followed.length) {
        return { kind: "ok", output: { concurrents: 0, note: "Aucun concurrent suivi : Charlie les ajoute dans Publicité › Paramètres › Concurrents." }, line: `${who(ctx)} : aucun concurrent suivi pour l'instant.` };
      }
      const ads = await ctx.deps.sources.adLibrary({ pageIds: followed.slice(0, 10).map((c) => c.pageId) });
      if (!ads.length) return { kind: "ok", output: { concurrents: followed.length, pubs: 0 }, line: `${who(ctx)} : aucune publicité en France chez les ${followed.length} concurrent(s) suivi(s).` };
      const { resume, costEur } = await extract(
        ctx,
        "Par concurrent : les angles, promesses et appels à l'action, en signalant ceux des publicités diffusées le plus longtemps. Signale aussi ce que personne ne dit.",
        adLines(ads),
        "publicités concurrentes",
      );
      const simulated = ads.some((a) => a.simulated);
      return {
        kind: "ok",
        costEur,
        output: { concurrents: followed.length, pubs: ads.length, plusLongueDiffusionJours: Math.max(...ads.map((a) => a.runningDays ?? 0)), resume, ...(simulated ? { simule: true } : {}) },
        line: `${who(ctx)} lit ${ads.length} publicité(s) de ${followed.length} concurrent(s)${simulated ? " [SIMULÉ]" : ""} (${eur(costEur)}).`,
      };
    } catch (e) {
      return refusal(ctx, e, "la lecture des publicités concurrentes");
    }
  },
};

const rechercherConcurrents: AgentTool = {
  definition: {
    name: "rechercher_concurrents",
    description: "Cherche, par mots-clés, des annonceurs qui diffusent en France dans la bibliothèque publicitaire Meta. Pour en proposer un, utilise ensuite « proposer_concurrent ».",
    input_schema: { type: "object", properties: { mots_cles: { type: "string" } }, required: ["mots_cles"] },
  },
  async run(ctx, input) {
    const terms = String(input.mots_cles ?? "").trim();
    try {
      const [ads, followed] = await Promise.all([ctx.deps.sources.adLibrary({ searchTerms: terms }), ctx.deps.sources.competitors()]);
      const known = new Set(followed.map((c) => c.pageId));
      const pages = new Map<string, { pageId: string; nom: string; pubs: number; plusLongueDiffusionJours: number }>();
      for (const a of ads) {
        if (!a.pageId || known.has(a.pageId)) continue;
        const p = pages.get(a.pageId) ?? { pageId: a.pageId, nom: a.pageName, pubs: 0, plusLongueDiffusionJours: 0 };
        p.pubs++;
        p.plusLongueDiffusionJours = Math.max(p.plusLongueDiffusionJours, a.runningDays ?? 0);
        pages.set(a.pageId, p);
      }
      const list = [...pages.values()].sort((a, b) => b.pubs - a.pubs);
      return { kind: "ok", output: { annonceurs: list }, line: `${who(ctx)} cherche « ${clip(terms, 40)} » : ${list.length} annonceur(s) non suivi(s).` };
    } catch (e) {
      return refusal(ctx, e, "la recherche");
    }
  },
};

const proposerConcurrent: AgentTool = {
  definition: {
    name: "proposer_concurrent",
    description: "Propose d'ajouter un annonceur à la liste des concurrents suivis. Il n'y entre qu'après validation de Charlie ; en attendant, ses publicités ne sont pas lues.",
    input_schema: {
      type: "object",
      properties: { page_id: { type: "string" }, nom: { type: "string" }, mots_cles: { type: "string" }, justification: { type: "string" } },
      required: ["page_id", "nom", "mots_cles", "justification"],
    },
  },
  async run(ctx, input) {
    const pageId = String(input.page_id ?? "").trim();
    const name = String(input.nom ?? "").trim() || pageId;
    const rationale = String(input.justification ?? "").trim();
    if (!PAGE_ID.test(pageId)) return { kind: "ok", isError: true, output: { refus: "Identifiant de page invalide (des chiffres)." }, line: `${who(ctx)} : identifiant de page invalide.` };
    const r = await ctx.deps.sources.proposeCompetitor({ pageId, name, keywords: String(input.mots_cles ?? ""), rationale, run: ctx.run.id });
    if (r === "deja-connu") return { kind: "ok", output: { dejaConnu: true }, line: `${who(ctx)} : « ${clip(name, 40)} » est déjà dans la liste.` };
    await ctx.deps.store.createDecision({ campaign: ctx.run.campaign, run: ctx.run.id, agent: ctx.agent.id, step: ctx.step.id, kind: "concurrent", status: "proposee", rationale: rationale || "—", after: { pageId, name } });
    return { kind: "ok", output: { propose: true }, line: `${who(ctx)} propose un concurrent à valider : « ${clip(name, 50)} ».` };
  },
};

export const SOURCE_TOOLS: AgentTool[] = [lireSite, lireAcquisition, lirePubsConcurrents, rechercherConcurrents, proposerConcurrent];
