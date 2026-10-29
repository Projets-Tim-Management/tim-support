import type { Payload } from "payload";

import { adminUrl, internalNotice } from "@/core/lib/email-template";
import { parisNow, periodKey } from "@/modules/ads/agent/followup";
import { payloadSuivi } from "@/modules/ads/agent/suivi-port";
import { ALERT_KINDS } from "@/modules/ads/lib/alerts";
import { adminEmails } from "@/modules/marketing/lib/notify";

/**
 * Le récapitulatif du lundi (plan Publicité, §9 nonies, étape 7 — décision du
 * 29/10/2026). Une fois par semaine, dès que les passages du lundi ont fini
 * (au plus tard à midi) : pour chaque campagne en diffusion, les chiffres de la
 * semaine face à la précédente, ce que l'analyste a fait, ce qui attend Charlie
 * (actions proposées, créas à valider, campagne Prospects à publier), les
 * alertes ouvertes et le test en cours.
 */

export const RECAP_HOUR = 10;
const RECAP_LATEST_HOUR = 12;

const eur = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(2).replace(".", ",")} €`);
const pct = (n: number | null | undefined) => (n == null ? "" : ` (${n > 0 ? "+" : ""}${n} %)`);
const label = (kind: string) => ALERT_KINDS.find((k) => k.value === kind)?.label ?? kind;

export type CampaignRecap = {
  id: number | string;
  name: string;
  lines: string[];
  waiting: string[];
};

/** Le texte d'une campagne, à partir de ce que le support sait. Pure. */
export function campaignRecap(c: {
  id: number | string;
  name: string;
  totals: { depenseEur: number; vuesPage: number; leadsSite: number; leadsQualifies: number; coutParLeadEur: number | null; tauxClicPct: number | null };
  trends: { depensePct: number | null; leadsPct: number | null };
  summary: string | null;
  actions: { summary: string; status: string }[];
  proposed: number;
  toValidate: number;
  alerts: { kind: string; detail: string }[];
  test: string | null;
  prospects: { id: number | string } | null;
}): CampaignRecap {
  const t = c.totals;
  const lines = [
    `Semaine : ${eur(t.depenseEur)}${pct(c.trends.depensePct)}, ${t.vuesPage} vues de la page, ${t.leadsSite} lead(s)${pct(c.trends.leadsPct)}, dont ${t.leadsQualifies} qualifié(s) ; coût par lead ${eur(t.coutParLeadEur)}, taux de clic ${t.tauxClicPct == null ? "—" : `${String(t.tauxClicPct).replace(".", ",")} %`}.`,
    ...(c.summary ? [`L'analyste : ${c.summary}`] : ["Pas de passage du lundi cette semaine."]),
    ...c.actions.map((a) => `• ${a.summary} — ${a.status === "executee" ? "fait" : a.status === "proposee" ? "à valider" : "bloqué"}`),
    ...c.alerts.map((a) => `⚠ ${label(a.kind)} : ${a.detail}`),
    ...(c.test ? [`Test en cours : ${c.test}`] : []),
  ];
  const waiting = [
    ...(c.proposed ? [`${c.proposed} action(s) de l'agent à valider`] : []),
    ...(c.toValidate ? [`${c.toValidate} créa(s) à valider (visuels à faire dans Claude Design)`] : []),
    ...(c.prospects ? [`la campagne Prospects n° ${c.prospects.id} à publier`] : []),
  ];
  return { id: c.id, name: c.name, lines, waiting };
}

/** Le récapitulatif est-il dû maintenant ? Lundi, après 10 h, quand le lundi a fini (ou à midi au plus tard). Pure. */
export const recapDue = (now: Date, mondayRunsBusy: boolean): boolean => {
  const p = parisNow(now);
  return p.weekday === 1 && p.hour >= RECAP_HOUR && (!mondayRunsBusy || p.hour >= RECAP_LATEST_HOUR);
};

export async function maybeSendWeeklyRecap(payload: Payload, now = new Date()): Promise<"envoye" | "vide" | "pas-encore" | "deja-fait" | "echec"> {
  const p = parisNow(now);
  if (p.weekday !== 1 || p.hour < RECAP_HOUR) return "pas-encore";
  const week = periodKey("hebdomadaire", p);
  const done = await payload.count({ collection: "ad-recaps", where: { week: { equals: week } }, overrideAccess: true });
  if (done.totalDocs) return "deja-fait";
  const monday = new Date(Date.parse(`${week}T00:00:00Z`) - 2 * 3_600_000).toISOString();
  const busy = await payload.count({ collection: "ad-agent-runs", where: { and: [{ kind: { in: ["hebdomadaire", "mensuel"] } }, { status: { in: ["en-cours", "en-pause-budget"] } }, { startedAt: { greater_than_equal: monday } }] }, overrideAccess: true });
  if (!recapDue(now, busy.totalDocs > 0)) return "pas-encore";

  // La semaine se réserve AVANT l'envoi (clé unique) : un second cron perd la course et s'arrête.
  let recap: { id: number | string };
  try {
    recap = await payload.create({ collection: "ad-recaps", data: { week, status: "vide" } as never, overrideAccess: true });
  } catch {
    return "deja-fait";
  }

  const live = await payload.find({ collection: "ad-campaigns", where: { publicationStatus: { equals: "active" } }, pagination: false, depth: 0, overrideAccess: true });
  const suivi = payloadSuivi(payload, () => now);
  const recaps: CampaignRecap[] = [];
  for (const c of live.docs as unknown as { id: number; name: string }[]) {
    const [report, runs, decisions, toValidate, tests, prospects] = await Promise.all([
      suivi.report(c.id, 7),
      payload.find({ collection: "ad-agent-runs", where: { and: [{ campaign: { equals: c.id } }, { kind: { in: ["hebdomadaire", "mensuel"] } }, { startedAt: { greater_than_equal: monday } }] }, sort: "-startedAt", limit: 1, depth: 0, overrideAccess: true }),
      payload.find({ collection: "ad-decisions", where: { and: [{ campaign: { equals: c.id } }, { kind: { in: ["budget", "pause", "activation"] } }, { createdAt: { greater_than_equal: new Date(now.getTime() - 7 * 86_400_000).toISOString() } }] }, pagination: false, depth: 0, overrideAccess: true }),
      payload.count({ collection: "ad-creatives", where: { and: [{ campaign: { equals: c.id } }, { status: { equals: "a-valider" } }] }, overrideAccess: true }),
      suivi.tests(c.id),
      payload.find({ collection: "ad-decisions", where: { and: [{ campaign: { equals: c.id } }, { kind: { equals: "bascule" } }, { status: { equals: "executee" } }] }, sort: "-createdAt", limit: 1, depth: 0, overrideAccess: true }),
    ]);
    const acts = decisions.docs as { status: string; after?: { summary?: string } }[];
    const draft = (prospects.docs[0] as { after?: { campagne?: number } } | undefined)?.after?.campagne;
    const draftDoc = draft ? ((await payload.findByID({ collection: "ad-campaigns", id: draft, depth: 0, overrideAccess: true }).catch(() => null)) as { status?: string } | null) : null;
    const open = tests.find((t) => t.etat === "en-cours" || t.etat === "en-attente-de-volume");
    recaps.push(
      campaignRecap({
        id: c.id,
        name: c.name,
        totals: report.totaux,
        trends: { depensePct: report.tendances.depensePct, leadsPct: report.tendances.leadsPct },
        summary: (runs.docs[0] as { summary?: string | null } | undefined)?.summary ?? null,
        actions: acts.map((a) => ({ summary: a.after?.summary ?? "action", status: a.status })),
        proposed: acts.filter((a) => a.status === "proposee").length,
        toValidate: toValidate.totalDocs,
        alerts: report.alertesOuvertes.map((a) => ({ kind: a.type, detail: a.constat })),
        test: open ? `${open.hypothese} — ${open.ouEnEst ?? open.etat}` : null,
        prospects: draftDoc?.status === "brouillon" ? { id: draft! } : null,
      }),
    );
  }
  if (!recaps.length) return "vide";

  const to = await adminEmails(payload);
  const waiting = recaps.flatMap((r) => r.waiting.map((w) => `${r.name} : ${w}`));
  const text = [
    `Publicité — semaine du ${week.split("-").reverse().join("/")}`,
    "",
    ...recaps.flatMap((r) => [`■ ${r.name}`, ...r.lines, ""]),
    waiting.length ? ["Ce qui vous attend :", ...waiting.map((w) => `• ${w}`)].join("\n") : "Rien ne vous attend cette semaine.",
    "",
    `Valider : ${adminUrl("/publicite/a-valider")}`,
  ].join("\n");
  const sent =
    to.length > 0 &&
    (await payload
      .sendEmail({
        to: to.join(","),
        subject: waiting.length ? `Publicité — récap du lundi : ${waiting.length} chose(s) vous attendent` : "Publicité — récap du lundi",
        html: internalNotice({
          kicker: "Publicité · Récap du lundi",
          heading: `Semaine du ${week.split("-").reverse().join("/")}`,
          // Une ligne par campagne (les chiffres) et ce qui attend ; le détail, dans l'encadré (qui garde les retours à la ligne).
          rows: [...recaps.map((r) => [r.name, r.lines[0]] as [string, string]), ["Ce qui vous attend", waiting.length ? waiting.join(" ; ") : "Rien cette semaine."]],
          message: recaps.map((r) => [`■ ${r.name}`, ...r.lines.slice(1)].join("\n")).join("\n\n"),
          cta: { label: "Ouvrir la publicité", url: adminUrl(`/collections/ad-campaigns/${recaps[0].id}`) },
        }),
        text,
      })
      .then(() => true)
      .catch((e) => {
        payload.logger.error(`[publicité] récap du lundi non envoyé : ${e}`);
        return false;
      }));
  await payload.update({ collection: "ad-recaps", id: recap.id, data: { status: sent ? "envoye" : "echec", text, sentAt: now.toISOString() } as never, overrideAccess: true });
  return sent ? "envoye" : "echec";
}
