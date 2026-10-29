import type { Payload } from "payload";

import type { Id, SuiviPort } from "@/modules/ads/agent/types";
import { ALERT_KINDS } from "@/modules/ads/lib/alerts";
import { ActionError, submitAction } from "@/modules/ads/lib/actions-run";
import { actionSummary, readAction } from "@/modules/ads/lib/actions";
import { buildReport, type CreativeIn, type MetricIn, type ObjectIn } from "@/modules/ads/lib/followup-report";
import { dayInTz } from "@/modules/ads/lib/sync";
import { REVALIDATE_DAYS } from "@/modules/ads/collections/AdLearnings";

/**
 * Le suivi d'une campagne en ligne, branché sur la base (plan, §9 nonies,
 * étape 3). Chaque lecture ne voit QUE la campagne du passage ; chaque action
 * vise un objet de cette campagne, relu en base, et passe par `submitAction`.
 */

type RawCampaign = {
  id: number;
  name: string;
  externalId?: string | null;
  autonomy?: string | null;
  publication?: { activatedAt?: string | null; ads?: Record<string, string>; plan?: { objectif?: string; optimisation?: string } } | null;
  agentBudget?: { metaFloorEur?: number | null; split?: { aiDailyEur?: number | null } | null } | null;
  brief?: { landingUrl?: string | null } | null;
  account?: { timezone?: string | null } | number | null;
};

const label = (kind: string) => ALERT_KINDS.find((k) => k.value === kind)?.label ?? kind;
const num = (v: unknown) => Number(v ?? 0) || 0;

async function campaignOf(payload: Payload, id: Id): Promise<RawCampaign & { externalId: string }> {
  const c = (await payload.findByID({ collection: "ad-campaigns", id, depth: 1, overrideAccess: true }).catch(() => null)) as RawCampaign | null;
  if (!c?.externalId) throw new ActionError("Cette campagne n'est pas en ligne chez Meta.");
  return c as RawCampaign & { externalId: string };
}

export function payloadSuivi(payload: Payload, now: () => Date = () => new Date()): SuiviPort {
  return {
    async report(campaignId, days) {
      const c = await campaignOf(payload, campaignId);
      const tz = (typeof c.account === "object" && c.account?.timezone) || "Europe/Paris";
      const at = now();
      const today = dayInTz(at, tz);
      const since = dayInTz(new Date(at.getTime() - (2 * days + 1) * 86_400_000), tz);
      const [objects, metrics, decisions, alerts] = await Promise.all([
        payload.find({ collection: "ad-objects", where: { campaignExternalId: { equals: c.externalId } }, pagination: false, depth: 0, overrideAccess: true }),
        payload.find({ collection: "ad-metrics-daily", where: { and: [{ campaignExternalId: { equals: c.externalId } }, { day: { greater_than_equal: since } }] }, pagination: false, depth: 0, overrideAccess: true }),
        payload.find({ collection: "ad-decisions", where: { and: [{ campaign: { equals: c.id } }, { executedAt: { exists: true } }] }, sort: "-executedAt", limit: 50, depth: 0, overrideAccess: true }),
        payload.find({ collection: "ad-alerts", where: { and: [{ campaign: { equals: c.id } }, { resolvedAt: { exists: false } }] }, pagination: false, depth: 0, overrideAccess: true }),
      ]);
      // La pub chez Meta → la créa du support (« 17:video:0 » → identifiant de la pub).
      const adToCrea = new Map(Object.entries(c.publication?.ads ?? {}).map(([k, ad]) => [ad, Number(k.split(":")[0])]));
      const creaIds = [...new Set(adToCrea.values())].filter((n) => Number.isFinite(n));
      const creas = creaIds.length ? await payload.find({ collection: "ad-creatives", where: { id: { in: creaIds } }, pagination: false, depth: 0, overrideAccess: true }) : { docs: [] };
      const first = (copy: unknown, kind: string) => ((copy as { kind: string; status: string; text: string }[] | null) ?? []).find((t) => t.kind === kind && t.status === "ok")?.text ?? null;
      const byId = new Map(
        (creas.docs as { id: number; angle?: string; copy?: unknown; tests?: { dimension: string; value: string }[] }[]).map((d) => [
          d.id,
          { id: d.id, angle: d.angle ?? "", title: first(d.copy, "titre"), body: first(d.copy, "principal"), tests: (d.tests ?? []).map((t) => `${t.dimension} : ${t.value}`) } satisfies CreativeIn,
        ]),
      );
      const creatives = new Map<string, CreativeIn>();
      for (const [ad, crea] of adToCrea) if (byId.has(crea)) creatives.set(ad, byId.get(crea)!);

      return buildReport({
        campaign: {
          id: c.id,
          name: c.name,
          externalId: c.externalId,
          autonomy: c.autonomy ?? "proposer",
          activatedAt: c.publication?.activatedAt ?? null,
          floorEur: c.agentBudget?.metaFloorEur ?? null,
          aiDailyEur: c.agentBudget?.split?.aiDailyEur ?? null,
          objective: c.publication?.plan?.objectif ?? null,
          optimisation: c.publication?.plan?.optimisation ?? null,
          landingUrl: c.brief?.landingUrl ?? null,
        },
        today,
        days,
        metrics: (metrics.docs as unknown as Record<string, unknown>[]).map(
          (m): MetricIn => ({
            level: m.level as MetricIn["level"],
            externalId: String(m.externalId),
            day: String(m.day),
            spend: num(m.spend),
            impressions: num(m.impressions),
            clicks: num(m.clicks),
            linkClicks: num(m.linkClicks),
            landingViews: num(m.landingViews),
            leads: num(m.leads),
            siteLeads: num(m.siteLeads),
            qualifiedLeads: num(m.qualifiedLeads),
            won: num(m.won),
          }),
        ),
        objects: (objects.docs as unknown as Record<string, unknown>[]).map(
          (o): ObjectIn => ({
            level: o.level as ObjectIn["level"],
            externalId: String(o.externalId),
            name: String(o.name ?? ""),
            adsetExternalId: (o.adsetExternalId as string | null) ?? null,
            status: String(o.status ?? ""),
            effectiveStatus: String(o.effectiveStatus ?? ""),
            dailyBudget: o.dailyBudget == null ? null : num(o.dailyBudget),
            issues: Array.isArray(o.issues) ? (o.issues as string[]) : [],
            frequency7d: num(o.frequency7d),
            reach7d: num(o.reach7d),
          }),
        ),
        creatives,
        changes: (decisions.docs as { target?: string; kind: string; after?: { summary?: string }; executedAt: string }[])
          .filter((d) => d.target)
          .map((d) => ({ target: d.target!, kind: d.kind, summary: d.after?.summary ?? d.kind, executedAt: d.executedAt })),
        alerts: (alerts.docs as { kind: string; detail: string; detectedAt: string }[]).map((a) => ({ kind: label(a.kind), detail: a.detail, detectedAt: a.detectedAt })),
        now: at,
      });
    },

    async journal(campaignId, days) {
      const since = new Date(now().getTime() - days * 86_400_000).toISOString();
      const [decisions, alerts] = await Promise.all([
        payload.find({
          collection: "ad-decisions",
          where: { and: [{ campaign: { equals: campaignId } }, { createdAt: { greater_than_equal: since } }, { kind: { in: ["budget", "pause", "activation", "attente"] } }] },
          sort: "-createdAt",
          limit: 40,
          depth: 0,
          overrideAccess: true,
        }),
        payload.find({ collection: "ad-alerts", where: { and: [{ campaign: { equals: campaignId } }, { detectedAt: { greater_than_equal: since } }] }, sort: "-detectedAt", limit: 20, depth: 0, overrideAccess: true }),
      ]);
      return {
        decisions: (decisions.docs as { createdAt: string; kind: string; status: string; after?: { summary?: string }; rationale: string; guardrail?: string | null }[]).map((d) => ({
          le: d.createdAt.slice(0, 16).replace("T", " "),
          type: d.kind,
          etat: d.status,
          quoi: d.after?.summary ?? d.kind,
          pourquoi: d.rationale,
          gardeFou: d.guardrail ?? null,
        })),
        alertes: (alerts.docs as { detectedAt: string; kind: string; detail: string; resolvedAt?: string | null }[]).map((a) => ({ le: a.detectedAt.slice(0, 10), type: label(a.kind), constat: a.detail, close: Boolean(a.resolvedAt) })),
      };
    },

    async act(campaignId, req, rationale, origin, extra) {
      const c = await campaignOf(payload, campaignId);
      // L'objet visé appartient-il à CETTE campagne ? Et son budget de départ : celui que la synchro a lu, pas celui du modèle.
      let name = c.name;
      let fromEur = 0;
      if (req.level === "campaign") {
        if (req.externalId !== c.externalId) throw new ActionError("Cet identifiant n'est pas celui de la campagne.");
      } else {
        const o = await payload.find({ collection: "ad-objects", where: { and: [{ externalId: { equals: req.externalId } }, { campaignExternalId: { equals: c.externalId } }, { level: { equals: req.level } }] }, limit: 1, depth: 0, overrideAccess: true });
        const obj = o.docs[0] as { name?: string; dailyBudget?: number | null } | undefined;
        if (!obj) throw new ActionError(`Aucun ${req.level === "ad" ? "publicité" : "ensemble"} de cette campagne n'a cet identifiant.`);
        name = obj.name ?? req.externalId;
        fromEur = num(obj.dailyBudget);
      }
      if (req.kind === "budget" && req.level === "campaign") throw new ActionError("Le budget vit sur l'ensemble de publicités : vise un ensemble.");
      const action = readAction({ kind: req.kind, level: req.level, externalId: req.externalId, name, fromEur, toEur: req.toEur });
      if (!action) throw new ActionError("Action illisible : vérifie le type, le niveau et l'identifiant.");
      if (action.kind === "budget" && !(fromEur > 0)) throw new ActionError("Le budget actuel de cet ensemble n'est pas connu : attends la prochaine synchro.");
      const r = await submitAction(payload, { campaign: c.id, action, rationale, origin, extra }, now());
      return { decision: r.decision, outcome: r.verdict.outcome, reasons: r.verdict.reasons, error: r.error, summary: actionSummary(action) };
    },

    async learn(campaignId, l) {
      const at = now();
      const doc = await payload.create({
        collection: "ad-learnings",
        data: {
          statement: l.statement,
          scope: "campagne",
          campaign: campaignId,
          confidence: l.confidence,
          status: l.global ? "global-propose" : "actif",
          source: "resultat-decision",
          sourceDecision: l.decision,
          learnedAt: at.toISOString(),
          revalidateAt: new Date(at.getTime() + REVALIDATE_DAYS * 86_400_000).toISOString(),
        } as never,
        overrideAccess: true,
      });
      return doc.id as Id;
    },
  };
}
