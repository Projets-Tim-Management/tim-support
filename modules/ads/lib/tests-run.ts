import type { Payload } from "payload";

import { OPEN_TEST_STATUSES } from "@/modules/ads/collections/AdTests";
import { judgeTest, metricValue, MAX_DAYS, MIN_DAYS, MIN_RESULTS, resultsOf, TEST_METRICS, type TestMetric, type VariantData } from "@/modules/ads/lib/ab-verdict";
import { ActionError } from "@/modules/ads/lib/actions-run";
import { dayInTz } from "@/modules/ads/lib/sync";

/**
 * Ouvrir et juger les tests A/B (plan Publicité, §9 nonies, étape 4).
 *
 * Le jugement tourne après chaque synchro, sur les chiffres de chaque pub
 * depuis l'ouverture du test : le verdict est celui du code (lib/ab-verdict.ts),
 * écrit sur le test ; l'analyste le lit au passage suivant et l'interprète.
 */

export type Variant = { label: string; ads: string[]; creatives?: (number | string)[] };
type TestDoc = { id: number; campaign: number; metric: TestMetric; variants: Variant[]; status: string; openedAt: string; minResults?: number | null; minDays?: number | null; maxDays?: number | null };

const num = (v: unknown) => Number(v ?? 0) || 0;

/** Ouvre un test, après les vérifications du code. Rend son identifiant. */
export async function openTest(
  payload: Payload,
  input: { campaign: number | string; hypothesis: string; dimension: string; metric: string; variants: Variant[]; run?: number | string | null },
  now = new Date(),
): Promise<number | string> {
  const hypothesis = input.hypothesis.trim();
  if (!hypothesis) throw new ActionError("Un test commence par son hypothèse, en une phrase.");
  if (!TEST_METRICS.some((m) => m.value === input.metric)) throw new ActionError(`Métrique inconnue : ${TEST_METRICS.map((m) => m.value).join(", ")}.`);
  const variants = input.variants.map((v) => ({ label: String(v.label ?? "").trim(), ads: [...new Set((v.ads ?? []).map(String))], creatives: v.creatives ?? [] }));
  if (variants.length < 2 || variants.length > 4) throw new ActionError("Un test compare 2 à 4 variantes.");
  if (variants.some((v) => !v.label || !v.ads.length)) throw new ActionError("Chaque variante a un nom et au moins une publicité.");
  const all = variants.flatMap((v) => v.ads);
  if (new Set(all).size !== all.length) throw new ActionError("Une publicité n'appartient qu'à une variante.");

  const open = await payload.count({ collection: "ad-tests", where: { and: [{ campaign: { equals: input.campaign } }, { status: { in: OPEN_TEST_STATUSES } }] }, overrideAccess: true });
  if (open.totalDocs) throw new ActionError("Un test est déjà en cours sur cette campagne : un seul à la fois (décision du 29/09/2026).");
  const c = (await payload.findByID({ collection: "ad-campaigns", id: input.campaign, depth: 0, overrideAccess: true })) as { externalId?: string | null };
  const ads = await payload.find({ collection: "ad-objects", where: { and: [{ level: { equals: "ad" } }, { campaignExternalId: { equals: c.externalId ?? "" } }, { externalId: { in: all } }] }, pagination: false, depth: 0, overrideAccess: true });
  const known = new Set((ads.docs as { externalId: string }[]).map((a) => a.externalId));
  const strangers = all.filter((a) => !known.has(a));
  if (strangers.length) throw new ActionError(`Publicité(s) hors de cette campagne : ${strangers.join(", ")}.`);

  const metric = input.metric as TestMetric;
  const doc = await payload.create({
    collection: "ad-tests",
    data: {
      campaign: input.campaign,
      run: input.run ?? null,
      hypothesis,
      dimension: input.dimension,
      metric,
      variants,
      minResults: MIN_RESULTS[metric],
      minDays: MIN_DAYS[metric],
      maxDays: MAX_DAYS,
      status: "en-attente-de-volume",
      openedAt: now.toISOString(),
    } as never,
    overrideAccess: true,
  });
  return doc.id as number;
}

/** Juge chaque test ouvert. Rend le nombre de tests clos à ce passage. */
export async function evaluateTests(payload: Payload, now = new Date()): Promise<{ judged: number; closed: number }> {
  const open = await payload.find({ collection: "ad-tests", where: { status: { in: OPEN_TEST_STATUSES } }, pagination: false, depth: 0, overrideAccess: true });
  let closed = 0;
  for (const t of open.docs as unknown as TestDoc[]) {
    const since = dayInTz(new Date(t.openedAt), "Europe/Paris");
    const ads = t.variants.flatMap((v) => v.ads);
    const rows = await payload.find({ collection: "ad-metrics-daily", where: { and: [{ level: { equals: "ad" } }, { externalId: { in: ads } }, { day: { greater_than_equal: since } }] }, pagination: false, depth: 0, overrideAccess: true });
    const data: VariantData[] = t.variants.map((v) => {
      const mine = (rows.docs as unknown as Record<string, unknown>[]).filter((r) => v.ads.includes(String(r.externalId)));
      const s = (k: string) => mine.reduce((sum, r) => sum + num(r[k]), 0);
      return { label: v.label, spend: Math.round(s("spend") * 100) / 100, impressions: s("impressions"), linkClicks: s("linkClicks"), landingViews: s("landingViews"), leads: Math.max(s("siteLeads"), s("leads")), qualifiedLeads: s("qualifiedLeads") };
    });
    const days = Math.floor((now.getTime() - Date.parse(t.openedAt)) / 86_400_000);
    const v = judgeTest(data, t.metric, days, { minResults: t.minResults ?? undefined, minDays: t.minDays ?? undefined, maxDays: t.maxDays ?? undefined });
    const results = data.map((d, i) => ({ ...d, resultats: resultsOf(d, t.metric), valeur: metricValue(d, t.metric), probabilite: v.probabilities[i] ?? null }));
    const done = v.status === "conclu" || v.status === "sans-verdict";
    await payload.update({
      collection: "ad-tests",
      id: t.id,
      data: {
        status: v.status,
        results,
        reason: v.status === "conclu" ? `${data[v.winner].label} gagne à ${Math.round(v.probability * 100)} %` : v.reason,
        ...(v.status === "conclu" ? { winner: data[v.winner].label, probability: v.probability, confidence: v.confidence } : {}),
        ...(done ? { closedAt: now.toISOString() } : {}),
      } as never,
      overrideAccess: true,
    });
    if (done) closed++;
  }
  return { judged: open.docs.length, closed };
}
