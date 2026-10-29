import type { Payload } from "payload";

import { adminUrl, internalNotice } from "@/core/lib/email-template";
import { submitAction } from "@/modules/ads/lib/actions-run";
import { ALERT_KINDS, alertKey, CONFIRM_AFTER_MS, detectAlerts, needsConfirmation, URGENT_KINDS, type CampaignIn, type DayIn, type Detected, type ObjectIn } from "@/modules/ads/lib/alerts";
import { dayInTz } from "@/modules/ads/lib/sync";
import { adminEmails } from "@/modules/marketing/lib/notify";

/**
 * Les alertes, après chaque synchro (plan Publicité, §9 nonies, étape 2) :
 * recalculées, puis comparées à celles qui sont ouvertes — une nouvelle
 * s'ouvre (et agit), une qui ne se constate plus se clôt.
 *
 * L'action passe par `submitAction` : jugée par les garde-fous, journalisée,
 * appliquée chez Meta si l'autonomie le permet. Les urgences confirmées partent
 * en UN e-mail aux admins, une fois par alerte.
 */

type Fetch = typeof fetch;
const LANDING_TIMEOUT_MS = 10_000;
const label = (kind: string) => ALERT_KINDS.find((k) => k.value === kind)?.label ?? kind;

type RawCampaign = {
  id: number;
  name: string;
  externalId?: string | null;
  status?: string | null;
  publicationStatus?: string | null;
  publication?: { activatedAt?: string | null } | null;
  brief?: { landingUrl?: string | null } | null;
  account?: { timezone?: string | null } | number | null;
};
type OpenAlert = { id: number; campaign: number; kind: string; objectExternalId: string; stage?: string | null; detectedAt: string; detail: string; notifiedAt?: string | null };

/** La page d'arrivée répond-elle ? Une redirection suivie jusqu'au bout ; au-delà de 10 s, c'est non. */
export async function checkLanding(url: string, f: Fetch = fetch): Promise<{ ok: boolean; detail: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LANDING_TIMEOUT_MS);
  try {
    const res = await f(url, { redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": "TIM-Support/alertes-publicite" } });
    return res.status < 400 ? { ok: true, detail: `HTTP ${res.status}` } : { ok: false, detail: `réponse HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: (e as Error).name === "AbortError" ? "pas de réponse en 10 s" : `inaccessible (${(e as Error).message})` };
  } finally {
    clearTimeout(timer);
  }
}

export type AlertsResult = { opened: number; confirmed: number; resolved: number; notified: number };

export async function runAlerts(payload: Payload, now = new Date(), deps: { fetch?: Fetch } = {}): Promise<AlertsResult> {
  const result: AlertsResult = { opened: 0, confirmed: 0, resolved: 0, notified: 0 };
  const res = await payload.find({ collection: "ad-campaigns", where: { status: { equals: "active" } }, pagination: false, depth: 1, overrideAccess: true });
  const raw = (res.docs as unknown as RawCampaign[]).filter((c) => c.externalId);
  const tz = (c: RawCampaign) => (typeof c.account === "object" && c.account?.timezone) || "Europe/Paris";

  const campaigns: CampaignIn[] = raw.map((c) => ({ id: c.id, name: c.name, externalId: c.externalId!, activatedAt: c.publication?.activatedAt ?? null }));
  const externalIds = campaigns.map((c) => c.externalId);
  const tzOf = raw.length ? tz(raw[0]) : "Europe/Paris";
  const today = dayInTz(now, tzOf);
  const yesterday = dayInTz(new Date(now.getTime() - 86_400_000), tzOf);
  const since = dayInTz(new Date(now.getTime() - 8 * 86_400_000), tzOf);

  const [objects, days, open] = await Promise.all([
    externalIds.length
      ? payload.find({ collection: "ad-objects", where: { campaignExternalId: { in: externalIds } }, pagination: false, depth: 0, overrideAccess: true })
      : Promise.resolve({ docs: [] }),
    externalIds.length
      ? payload.find({
          collection: "ad-metrics-daily",
          where: { and: [{ level: { equals: "campaign" } }, { externalId: { in: externalIds } }, { day: { greater_than_equal: since } }] },
          pagination: false,
          depth: 0,
          overrideAccess: true,
        })
      : Promise.resolve({ docs: [] }),
    payload.find({ collection: "ad-alerts", where: { resolvedAt: { exists: false } }, pagination: false, depth: 0, overrideAccess: true }),
  ]);

  // La page d'arrivée de chaque campagne publiée depuis le support.
  const landing = new Map<number | string, { ok: boolean; detail: string }>();
  for (const c of raw) {
    const url = c.brief?.landingUrl?.trim();
    if (c.publicationStatus === "active" && url && /^https:\/\//.test(url)) landing.set(c.id, await checkLanding(url, deps.fetch));
  }

  const detected = detectAlerts({
    campaigns,
    objects: (objects.docs as unknown as (ObjectIn & { issues?: unknown })[]).map((o) => ({ ...o, issues: Array.isArray(o.issues) ? (o.issues as string[]) : [] })),
    days: (days.docs as unknown as Record<string, unknown>[]).map(
      (d): DayIn => ({
        campaignExternalId: String(d.externalId),
        day: String(d.day),
        spend: Number(d.spend ?? 0),
        impressions: Number(d.impressions ?? 0),
        landingViews: Number(d.landingViews ?? 0),
        leads: Number(d.leads ?? 0),
        siteLeads: Number(d.siteLeads ?? 0),
      }),
    ),
    today,
    yesterday,
    now,
    landing,
  });

  const openByKey = new Map((open.docs as unknown as OpenAlert[]).map((a) => [alertKey({ campaign: a.campaign, kind: a.kind, externalId: a.objectExternalId }), a]));
  const toNotify: { id: number; d: Detected }[] = [];

  const act = async (d: Detected): Promise<number | string | null> => {
    if (!d.action) return null;
    try {
      return (await submitAction(payload, { campaign: d.campaign, action: d.action, rationale: `${label(d.kind)} — ${d.detail}` }, now)).decision;
    } catch (e) {
      payload.logger.error(`[publicité] alerte « ${label(d.kind)} » : action impossible — ${(e as Error).message}`);
      return null;
    }
  };

  for (const d of detected) {
    const key = alertKey(d);
    const prev = openByKey.get(key);
    openByKey.delete(key);
    if (!prev) {
      const waits = needsConfirmation(d.kind);
      const decision = waits ? null : await act(d);
      const created = await payload.create({
        collection: "ad-alerts",
        data: {
          campaign: d.campaign,
          kind: d.kind,
          level: d.level,
          objectExternalId: d.externalId,
          objectName: d.name,
          detail: d.detail,
          stage: waits ? "a-confirmer" : "confirmee",
          detectedAt: now.toISOString(),
          ...(waits ? {} : { confirmedAt: now.toISOString() }),
          decision,
        } as never,
        overrideAccess: true,
      });
      result.opened++;
      if (!waits && URGENT_KINDS.includes(d.kind)) toNotify.push({ id: created.id as number, d });
      continue;
    }
    if (prev.stage === "a-confirmer" && now.getTime() - Date.parse(prev.detectedAt) >= CONFIRM_AFTER_MS) {
      const decision = await act(d);
      await payload.update({ collection: "ad-alerts", id: prev.id, data: { stage: "confirmee", confirmedAt: now.toISOString(), detail: d.detail, decision } as never, overrideAccess: true });
      result.confirmed++;
      if (URGENT_KINDS.includes(d.kind)) toNotify.push({ id: prev.id, d });
      continue;
    }
    if (prev.detail !== d.detail) await payload.update({ collection: "ad-alerts", id: prev.id, data: { detail: d.detail } as never, overrideAccess: true });
  }

  for (const a of openByKey.values()) {
    await payload.update({ collection: "ad-alerts", id: a.id, data: { resolvedAt: now.toISOString() } as never, overrideAccess: true });
    result.resolved++;
  }

  if (toNotify.length) result.notified = await notify(payload, toNotify, now);
  return result;
}

/** Un e-mail pour toutes les urgences du passage ; chaque alerte le note pour ne jamais le renvoyer. */
async function notify(payload: Payload, alerts: { id: number; d: Detected }[], now: Date): Promise<number> {
  const to = await adminEmails(payload);
  if (!to.length) return 0;
  const first = alerts[0].d;
  const subject = alerts.length === 1 ? `Publicité — ${label(first.kind)} : « ${first.name} »` : `Publicité — ${alerts.length} urgences sur vos campagnes`;
  const url = adminUrl(`/collections/ad-campaigns/${first.campaign}`);
  const lines = alerts.map(({ d }) => `• ${label(d.kind)} — ${d.detail}${d.action ? " Pause demandée (voir le journal de l'agent)." : ""}`);
  const sent = await payload
    .sendEmail({
      to: to.join(","),
      subject,
      html: internalNotice({
        kicker: "Publicité · Alertes",
        heading: alerts.length === 1 ? label(first.kind) : `${alerts.length} urgences`,
        rows: alerts.map(({ d }) => [label(d.kind), d.detail] as [string, string]),
        message: "Détectées par le code à la synchro. Une pause demandée suit le niveau d'autonomie de la campagne (une pub refusée est toujours coupée) ; tout est dans l'onglet Agent de la campagne.",
        cta: { label: "Ouvrir la campagne", url },
      }),
      text: [subject, "", ...lines, "", `Ouvrir : ${url}`].join("\n"),
    })
    .then(() => true)
    .catch((e) => {
      payload.logger.error(`[publicité] e-mail d'alerte non envoyé : ${e}`);
      return false;
    });
  if (!sent) return 0;
  for (const a of alerts) await payload.update({ collection: "ad-alerts", id: a.id, data: { notifiedAt: now.toISOString() } as never, overrideAccess: true });
  return alerts.length;
}
