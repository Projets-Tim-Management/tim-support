import type { Payload } from "payload";

import { WON_STATUSES } from "@/modules/ads/agent/sources/acquisition";
import { accountContext } from "@/modules/ads/lib/account-access";
import { buildEvent, type ConversionEvent, type MetaEvent, type SubmissionIn } from "@/modules/ads/lib/conversions";
import { QUALIFIED_STATUSES } from "@/modules/ads/lib/site-leads";

/**
 * L'envoi des conversions à Meta (plan Publicité, §9 nonies, étape 6), après
 * chaque synchro : les leads arrivés depuis 7 jours, puis les fiches qualifiées
 * ou signées depuis le dernier passage. Seulement avec l'accord « Publicité »
 * du visiteur (décision du 29/10/2026) ; chaque envoi, ou chaque refus de
 * l'envoyer, est noté une fois (ad-conversions) et n'est jamais refait.
 *
 * Le pixel est celui choisi sur le compte publicitaire (« Vérifier les droits »).
 * Sans pixel, rien ne part.
 */

const LOOKBACK_DAYS = 90;
const BATCH = 100;

type Sub = SubmissionIn & { answers?: Record<string, unknown> | null };

export async function sendConversions(payload: Payload, now = new Date()): Promise<{ sent: number; skipped: number; failed: number }> {
  const out = { sent: 0, skipped: 0, failed: 0 };
  const settings = (await payload.findGlobal({ slug: "ads-settings", overrideAccess: true })) as { enabled?: boolean | null };
  if (settings.enabled === false) return out;
  const accounts = await payload.find({ collection: "ad-accounts", where: { "diffusion.pixelId": { exists: true } }, pagination: false, depth: 0, overrideAccess: true });
  const account = (accounts.docs as { id: number; status?: string; diffusion?: { pixelId?: string | null } }[]).find((a) => a.diffusion?.pixelId && a.status !== "archive");
  if (!account) return out;
  const pixelId = account.diffusion!.pixelId!;

  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const subs = await payload.find({
    collection: "form-submissions",
    where: { and: [{ adsConsent: { equals: true } }, { createdAt: { greater_than_equal: since } }] },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });
  if (!subs.docs.length) return out;
  const ids = subs.docs.map((d) => d.id);
  const [done, files] = await Promise.all([
    payload.find({ collection: "ad-conversions", where: { submission: { in: ids } }, pagination: false, depth: 0, overrideAccess: true }),
    payload.find({ collection: "partner-clients", where: { formSubmission: { in: ids } }, pagination: false, depth: 0, overrideAccess: true, select: { formSubmission: true, clientStatus: true } as never }),
  ]);
  const seen = new Set((done.docs as { submission: number | { id: number }; event: string }[]).map((d) => `${typeof d.submission === "object" ? d.submission.id : d.submission}|${d.event}`));
  const statusOf = new Map((files.docs as { formSubmission?: number | null; clientStatus?: string | null }[]).map((f) => [String(f.formSubmission), f.clientStatus ?? ""]));

  // Ce qui est dû : chaque étape franchie qui n'a pas encore sa ligne.
  const due: { sub: Sub; event: ConversionEvent; at: Date }[] = [];
  for (const raw of subs.docs as unknown as Sub[]) {
    const s: Sub = { ...raw, email: String(raw.answers?.email ?? "") || null, phone: String(raw.answers?.telephone ?? "") || null };
    const status = statusOf.get(String(s.id)) ?? "";
    if (!seen.has(`${s.id}|Lead`)) due.push({ sub: s, event: "Lead", at: new Date(s.createdAt) });
    if (QUALIFIED_STATUSES.includes(status) && !seen.has(`${s.id}|QualifiedLead`)) due.push({ sub: s, event: "QualifiedLead", at: now });
    if (WON_STATUSES.includes(status) && !seen.has(`${s.id}|WonDeal`)) due.push({ sub: s, event: "WonDeal", at: now });
  }
  if (!due.length) return out;

  const record = (sub: Sub, event: ConversionEvent, eventId: string, status: "envoye" | "ignore" | "echec", detail: string) =>
    payload.create({ collection: "ad-conversions", data: { submission: sub.id, event, eventId, pixelId, status, detail: detail.slice(0, 250), sentAt: now.toISOString() } as never, overrideAccess: true });

  const ready: { sub: Sub; event: ConversionEvent; e: MetaEvent }[] = [];
  for (const d of due) {
    const e = buildEvent(d.event, d.sub, d.at, now);
    if ("skip" in e) {
      await record(d.sub, d.event, `${d.event}-${d.sub.submissionId}`, "ignore", e.skip);
      out.skipped++;
    } else ready.push({ sub: d.sub, event: d.event, e });
  }
  if (!ready.length) return out;

  const { ctx, platform } = await accountContext(payload, account.id);
  if (!platform.sendEvents) return out;
  for (let i = 0; i < ready.length; i += BATCH) {
    const batch = ready.slice(i, i + BATCH);
    try {
      const r = await platform.sendEvents(ctx, pixelId, batch.map((b) => b.e));
      for (const b of batch) await record(b.sub, b.event, b.e.event_id, "envoye", `reçu par Meta (${r.received}/${batch.length} du lot)`);
      out.sent += batch.length;
    } catch (e) {
      // Un échec n'est PAS noté comme fait : le passage suivant réessaie (un Lead, tant qu'il a moins de 7 jours).
      payload.logger.warn(`[publicité] conversions non envoyées à Meta : ${(e as Error).message}`);
      out.failed += batch.length;
    }
  }
  return out;
}
