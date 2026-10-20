import type { Payload } from "payload";

import type { AtelierPort, CreativeView, Id } from "@/modules/ads/agent/types";
import { AGENT_CLIENT_OPTIONS } from "@/modules/ads/agent/claude";
import { callClaudeWithin } from "@/modules/ads/lib/copy/claude";
import { generateCreatives, loadGenerationContext, publishable, weeklyUsed } from "@/modules/ads/lib/copy/generate";
import { briefLines } from "@/modules/ads/lib/copy/prompt";
import { missingFiles, type CreativeFile } from "@/modules/ads/lib/creative-files";
import { loadRushes } from "@/modules/ads/lib/design-brief/load";
import { writeDesignBrief } from "@/modules/ads/lib/design-brief/write";

/**
 * L'atelier de créas, branché pour l'agent de campagne : chaque méthode
 * APPELLE le code de l'atelier — génération et garde-fous des textes, brief
 * Claude Design, statut des créas. Rien n'est recopié ici.
 */

type RawCreative = {
  id: Id;
  angle: string;
  requestedAngle?: string | null;
  status?: string | null;
  copy?: { kind: string; text: string; status: string; reason?: string | null }[] | null;
  brief?: { prompt?: string | null; kind?: string | null; formats?: string[] | null } | null;
  files?: CreativeFile[] | null;
};

const view = (c: RawCreative): CreativeView => ({
  id: c.id,
  angle: c.angle,
  requestedAngle: c.requestedAngle ?? null,
  status: c.status ?? "brouillon",
  publishable: publishable(c.copy ?? []),
  hasBrief: Boolean(c.brief?.prompt),
  missingFiles: missingFiles(c),
  texts: (c.copy ?? []).map((t) => ({ kind: t.kind, text: t.text, status: t.status, reason: t.reason ?? null })),
});

/**
 * Une créa se dépose si ses textes passent et que son brief Claude Design est
 * écrit. Les fichiers finis viennent ensuite, de Charlie, dans « À valider ». Pure.
 */
export function submitRefusal(c: CreativeView): string | null {
  if (c.status !== "brouillon") return `Déjà « ${c.status} ».`;
  if (!c.publishable) return "Il manque un texte principal ou un titre passé aux garde-fous.";
  if (!c.hasBrief) return "Le brief Claude Design n'est pas écrit (ecrire_brief_design).";
  return null;
}

export function payloadAtelier(payload: Payload): AtelierPort {
  /** Les créas demandées, de CETTE campagne seulement ; un identifiant qui n'est pas un nombre est ignoré (il ne désigne rien). */
  const creatives = async (campaign: Id, ids: Id[]) => {
    const numeric = ids.map((i) => Number(i)).filter((n) => Number.isInteger(n) && n > 0);
    if (!numeric.length) return [];
    const r = await payload.find({ collection: "ad-creatives", where: { and: [{ id: { in: numeric } }, { campaign: { equals: campaign } }] }, pagination: false, depth: 0, overrideAccess: true });
    return (r.docs as unknown as RawCreative[]).map(view);
  };

  return {
    async brief(campaign) {
      const ctx = await loadGenerationContext(payload, campaign);
      const used = await weeklyUsed(payload, campaign, new Date());
      return {
        resume: [
          ...briefLines(ctx.brief),
          "",
          `Ton : ${ctx.brief.tone === "vous" ? "vouvoiement" : "tutoiement"}.`,
          ctx.forbidden.length ? `Interdits (kit et campagne) : ${ctx.forbidden.join(", ")}.` : "",
          // Les textes à l'écran (accroche, titres de la vidéo) s'écrivent dans cette voix.
          ctx.voice.voice ? `VOIX DE LA MARQUE : ${ctx.voice.voice}` : "",
          ctx.voice.goodExamples ? `Phrases justes :\n${ctx.voice.goodExamples}` : "",
          ctx.voice.badExamples ? `Phrases à éviter :\n${ctx.voice.badExamples}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        quotaRestant: Math.max(0, ctx.weeklyLimit - used),
      };
    },

    async generate(campaign, req) {
      const r = await generateCreatives(
        payload,
        campaign,
        { angles: 1, toneTest: req.toneTest, agent: { run: req.run, agent: req.agent, angles: req.angles, preCheck: req.preCheck } },
        // Les bornes d'une étape d'agent : pas de nouvelle tentative, délai sous STEP_MAX_MS.
        { call: callClaudeWithin(AGENT_CLIENT_OPTIONS) },
      );
      return { creatives: await creatives(campaign, r.created), costEur: r.costEur };
    },

    creatives,

    rushes: () => loadRushes(payload),

    writeBrief: (campaign, creative, req) => writeDesignBrief(payload, campaign, creative, req),

    async submit(campaign, ids) {
      const submitted: Id[] = [];
      const skipped: { id: Id; reason: string }[] = [];
      for (const c of await creatives(campaign, ids)) {
        const reason = submitRefusal(c);
        if (reason) {
          skipped.push({ id: c.id, reason });
          continue;
        }
        await payload.update({ collection: "ad-creatives", id: c.id, data: { status: "a-valider" } as never, overrideAccess: true });
        submitted.push(c.id);
      }
      // Comparés en texte : le modèle envoie parfois « 12 » là où la base répond 12 (relecture du 01/10/2026, F3).
      const seen = new Set([...submitted, ...skipped.map((s) => s.id)].map(String));
      for (const id of ids) if (!seen.has(String(id))) skipped.push({ id, reason: "Créa introuvable dans cette campagne." });
      return { submitted, skipped };
    },

    async campaignBudget(campaign) {
      const c = (await payload.findByID({ collection: "ad-campaigns", id: campaign, depth: 0, overrideAccess: true })) as {
        agentBudget?: { totalDailyEur?: number | null; maxAiSharePct?: number | null; metaFloorEur?: number | null } | null;
      };
      const b = c.agentBudget;
      if (!b?.totalDailyEur) return null;
      return { totalDailyEur: b.totalDailyEur, maxAiSharePct: b.maxAiSharePct ?? 15, metaFloorEur: b.metaFloorEur ?? 5 };
    },

    async setSplit(campaign, split, decision, at) {
      const c = (await payload.findByID({ collection: "ad-campaigns", id: campaign, depth: 0, overrideAccess: true })) as { agentBudget?: Record<string, unknown> | null };
      await payload.update({
        collection: "ad-campaigns",
        id: campaign,
        data: { agentBudget: { ...(c.agentBudget ?? {}), split: { ...split, decidedAt: at.toISOString(), decision } } } as never,
        overrideAccess: true,
      });
    },
  };
}
