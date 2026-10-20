import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

import { execSql, rowsOf } from "@/core/lib/raw-sql";
import { accessVerdict, accountProblem } from "@/modules/ads/lib/access-verdict";
import { accountContext } from "@/modules/ads/lib/account-access";
import { ctaMeta } from "@/modules/ads/lib/cta";
import { readPlan, type MediaPlan } from "@/modules/ads/lib/media-plan";
import { advance, emptyState, kindsOf, publishProblems, type PubCrea, type PubFile, type PubInput, type PubState } from "@/modules/ads/lib/publish/engine";
import type { AccountState } from "@/modules/ads/platforms/types";

/**
 * Publier une campagne chez Meta — la couche qui lit et écrit la base autour du
 * moteur (voir engine.ts). Trois gestes de Charlie, jamais d'un agent (plan :
 * créer une campagne n'est jamais autonome) : Publier (tout EN PAUSE),
 * Activer, Mettre en pause. Le cron ads-publish reprend chaque minute une
 * publication qui attend (vidéo en traitement) ; un bail en base empêche deux
 * exécutions simultanées de créer deux fois la même chose.
 */

export class PublishError extends Error {}

const LEASE_MIN = 5;
const STEP_BUDGET_MS = 45_000;

type RawCampaign = {
  id: number;
  name: string;
  brief?: { landingUrl?: string | null; cta?: string | null } | null;
  agentBudget?: { split?: { metaDailyEur?: number | null } | null } | null;
  account?: { id: number; diffusion?: { pageId?: string | null; instagramId?: string | null; pixelId?: string | null; scopes?: string[] | null; found?: { account?: AccountState | null } | null } | null } | number | null;
  publicationStatus?: string | null;
  publication?: PubState | null;
};

/** Le dernier plan de diffusion proposé pour la campagne (une décision bloquée n'en est pas un). */
async function latestPlan(payload: Payload, campaign: number): Promise<MediaPlan | null> {
  const r = await payload.find({
    collection: "ad-decisions",
    where: { and: [{ campaign: { equals: campaign } }, { kind: { equals: "audience" } }, { status: { not_equals: "bloquee" } }] },
    sort: "-createdAt",
    limit: 10,
    depth: 0,
    overrideAccess: true,
  });
  const d = (r.docs as unknown as { after?: Record<string, unknown> | null }[]).find((x) => x.after && typeof x.after.objectif === "string");
  return d ? readPlan(d.after as Record<string, unknown>) : null;
}

export async function loadInput(payload: Payload, id: number | string): Promise<{ input: PubInput; campaign: RawCampaign }> {
  const campaign = (await payload.findByID({ collection: "ad-campaigns", id, depth: 1, overrideAccess: true }).catch(() => null)) as RawCampaign | null;
  if (!campaign) throw new PublishError("Campagne introuvable.");
  const account = typeof campaign.account === "object" && campaign.account ? campaign.account : null;
  const diff = account?.diffusion ?? {};
  const [plan, settings, creas] = await Promise.all([
    latestPlan(payload, campaign.id),
    payload.findGlobal({ slug: "ads-settings", overrideAccess: true }) as Promise<{ enabled?: boolean | null }>,
    payload.find({ collection: "ad-creatives", where: { and: [{ campaign: { equals: campaign.id } }, { status: { equals: "validee" } }] }, pagination: false, depth: 0, overrideAccess: true }),
  ]);
  const verdict = account ? accessVerdict(diff.scopes ?? [], { pageId: diff.pageId, account: diff.found?.account }) : null;
  const first = (copy: { kind: string; text: string; status: string }[] | null | undefined, kind: string) => (copy ?? []).find((t) => t.kind === kind && t.status === "ok")?.text ?? null;
  const pubCreas: PubCrea[] = (creas.docs as unknown as { id: number; angle: string; cta?: string | null; copy?: { kind: string; text: string; status: string }[] | null; files?: PubFile[] | null }[])
    .filter((c) => (c.files ?? []).length > 0)
    .map((c) => ({
      id: c.id,
      angle: c.angle,
      cta: ctaMeta(c.cta ?? campaign.brief?.cta),
      body: first(c.copy, "principal"),
      title: first(c.copy, "titre"),
      description: first(c.copy, "description"),
      files: (c.files ?? []).map((f) => ({ format: f.format, kind: f.kind, url: f.url, filename: f.filename ?? null })),
    }));
  return {
    campaign,
    input: {
      campaign: { id: campaign.id, name: campaign.name, landingUrl: campaign.brief?.landingUrl ?? null },
      account: {
        pageId: diff.pageId ?? null,
        instagramId: diff.instagramId ?? null,
        pixelId: diff.pixelId ?? null,
        canPublish: Boolean(verdict?.canPublish),
        problems: account ? (verdict?.problems ?? []) : ["Aucun compte publicitaire choisi pour la campagne (onglet « Chez la régie »)."],
      },
      plan,
      metaDailyEur: campaign.agentBudget?.split?.metaDailyEur ?? null,
      creas: pubCreas,
      enabled: settings.enabled !== false,
    },
  };
}

/** Prend la main sur la publication (bail de quelques minutes) ; faux si une autre exécution l'a déjà. */
async function claim(payload: Payload, id: number): Promise<boolean> {
  const rows = rowsOf(
    await execSql(
      payload,
      sql`UPDATE "ad_campaigns" SET "publication_lease_until" = now() + make_interval(mins => ${LEASE_MIN})
          WHERE "id" = ${id} AND ("publication_lease_until" IS NULL OR "publication_lease_until" < now()) RETURNING "id"`,
    ),
  );
  return rows.length > 0;
}

const release = (payload: Payload, id: number) => execSql(payload, sql`UPDATE "ad_campaigns" SET "publication_lease_until" = NULL WHERE "id" = ${id}`);

async function write(payload: Payload, id: number, state: PubState, extra: Record<string, unknown> = {}) {
  await payload.update({ collection: "ad-campaigns", id, data: { publication: state, publicationStatus: state.status, ...extra } as never, overrideAccess: true });
}

const OBJECTIVE_OF: Record<string, string> = { prospects: "leads", trafic: "trafic", notoriete: "notoriete", interaction: "autre" };

/** Une passe du moteur, sous bail : avance, enregistre, et dit où l'on en est. */
async function run(payload: Payload, id: number, input: PubInput, state: PubState): Promise<PubState> {
  if (!(await claim(payload, id))) return state;
  try {
    const { ctx, platform } = await accountContext(payload, await accountOf(payload, id));
    const saved = await advance(state, input, { platform, acc: ctx, now: () => new Date(), deadline: Date.now() + STEP_BUDGET_MS }, (s) => write(payload, id, s));
    const done = saved.status === "en-pause";
    await write(
      payload,
      id,
      saved,
      done && saved.campaignId ? { externalId: saved.campaignId, status: "en-pause", objective: OBJECTIVE_OF[saved.plan?.objectif ?? ""] ?? "autre" } : {},
    );
    return saved;
  } catch (e) {
    const failed: PubState = { ...state, ...(await current(payload, id)), status: "echec", error: (e as Error).message };
    failed.history = [...(failed.history ?? []), { at: new Date().toISOString(), line: `Échec : ${(e as Error).message}` }];
    await write(payload, id, failed);
    payload.logger.warn(`[publicité] publication de la campagne ${id} : ${(e as Error).message}`);
    return failed;
  } finally {
    await release(payload, id);
  }
}

/**
 * L'état du compte, relu chez Meta juste avant de publier ou d'activer : un compte
 * fermé (56 jours sans dépense) accepte encore campagne et ensembles, puis refuse
 * les créas d'une erreur de droits illisible. On le dit avant de rien créer.
 */
async function assertAccountCanRun(payload: Payload, id: number): Promise<void> {
  const { ctx, platform } = await accountContext(payload, await accountOf(payload, id));
  if (!platform.accountState) return;
  const state = await platform.accountState(ctx);
  if (!state.ok) throw new PublishError(accountProblem(state));
}

async function accountOf(payload: Payload, id: number): Promise<number> {
  const c = (await payload.findByID({ collection: "ad-campaigns", id, depth: 0, overrideAccess: true })) as { account?: number | null };
  if (!c.account) throw new PublishError("Aucun compte publicitaire choisi pour la campagne.");
  return c.account;
}

/** L'état tel qu'il est en base (les identifiants obtenus avant une erreur y sont déjà). */
async function current(payload: Payload, id: number): Promise<PubState | null> {
  const c = (await payload.findByID({ collection: "ad-campaigns", id, depth: 0, overrideAccess: true })) as RawCampaign;
  return c.publication ?? null;
}

/** « Publier chez Meta » (ou « Reprendre » après un échec) : vérifie tout, puis lance la première passe. */
export async function startPublication(payload: Payload, id: number | string, who: string): Promise<PubState> {
  const { input, campaign } = await loadInput(payload, id);
  const prior = campaign.publication ?? null;
  if (prior && (prior.status === "en-pause" || prior.status === "active")) throw new PublishError("Déjà publiée chez Meta.");
  if (prior?.status === "en-cours") throw new PublishError("Publication déjà en cours.");
  const problems = publishProblems(input);
  if (problems.length) throw new PublishError(problems.join(" "));
  await assertAccountCanRun(payload, campaign.id);
  // Une reprise garde les identifiants déjà obtenus — et le plan d'origine : on ne change pas de plan au milieu.
  const state: PubState = prior ? { ...prior, status: "en-cours", error: null } : emptyState(input);
  state.history = [...state.history, { at: new Date().toISOString(), line: `${prior ? "Reprise" : "Publication"} demandée par ${who}.` }];
  await write(payload, campaign.id, state);
  return run(payload, campaign.id, { ...input, creas: prior ? input.creas.filter((c) => prior.creas.map(String).includes(String(c.id))) : input.creas }, state);
}

/** Le cron : chaque publication en cours avance d'une passe. */
export async function tickPublications(payload: Payload): Promise<{ checked: number; done: number }> {
  const r = await payload.find({ collection: "ad-campaigns", where: { publicationStatus: { equals: "en-cours" } }, pagination: false, depth: 0, overrideAccess: true });
  let done = 0;
  for (const c of r.docs as unknown as RawCampaign[]) {
    if (!c.publication) continue;
    const { input } = await loadInput(payload, c.id);
    const kept = { ...input, creas: input.creas.filter((x) => c.publication!.creas.map(String).includes(String(x.id))) };
    const s = await run(payload, c.id, kept, c.publication);
    if (s.status === "en-pause") done++;
  }
  return { checked: r.docs.length, done };
}

/** « Activer » : publicités, ensembles puis campagne passent actifs ; les créas « En ligne ». */
export async function activatePublication(payload: Payload, id: number | string, who: string): Promise<PubState> {
  const c = (await payload.findByID({ collection: "ad-campaigns", id, depth: 0, overrideAccess: true })) as RawCampaign;
  const s = c.publication;
  if (!s || s.status !== "en-pause" || !s.campaignId) throw new PublishError("Rien à activer : publiez d'abord la campagne (elle naît en pause).");
  const { input } = await loadInput(payload, id);
  if (!input.enabled) throw new PublishError("L'interrupteur général de la publicité est coupé.");
  await assertAccountCanRun(payload, c.id);
  const { ctx, platform } = await accountContext(payload, await accountOf(payload, c.id));
  if (!platform.setStatus) throw new PublishError(`${platform.label} : l'activation n'est pas branchée.`);
  if (!s.activatedAt) {
    for (const ad of Object.values(s.ads)) await platform.setStatus(ctx, { level: "ad", externalId: ad }, "active");
    for (const set of s.adsets) await platform.setStatus(ctx, { level: "adset", externalId: set }, "active");
  }
  await platform.setStatus(ctx, { level: "campaign", externalId: s.campaignId }, "active");
  const now = new Date().toISOString();
  const next: PubState = { ...s, status: "active", activatedAt: s.activatedAt ?? now, history: [...s.history, { at: now, line: `Activée par ${who} : la diffusion démarre.` }] };
  await write(payload, c.id, next, { status: "active" });
  for (const creaId of s.creas) await payload.update({ collection: "ad-creatives", id: creaId, data: { status: "en-ligne" } as never, overrideAccess: true }).catch(() => null);
  return next;
}

/** « Mettre en pause » : la campagne s'arrête chez Meta (ensembles et pubs gardent leur état). */
export async function pausePublication(payload: Payload, id: number | string, who: string): Promise<PubState> {
  const c = (await payload.findByID({ collection: "ad-campaigns", id, depth: 0, overrideAccess: true })) as RawCampaign;
  const s = c.publication;
  if (!s || s.status !== "active" || !s.campaignId) throw new PublishError("La campagne n'est pas en diffusion.");
  const { ctx, platform } = await accountContext(payload, await accountOf(payload, c.id));
  if (!platform.setStatus) throw new PublishError(`${platform.label} : la mise en pause n'est pas branchée.`);
  await platform.setStatus(ctx, { level: "campaign", externalId: s.campaignId }, "pause");
  const now = new Date().toISOString();
  const next: PubState = { ...s, status: "en-pause", history: [...s.history, { at: now, line: `Mise en pause par ${who}.` }] };
  await write(payload, c.id, next, { status: "en-pause" });
  return next;
}

/** Les aperçus Meta de chaque publicité : fil d'actualité, et Stories pour une créa qui a son 9:16. */
export async function publicationPreviews(payload: Payload, id: number | string): Promise<{ key: string; label: string; html: string }[]> {
  const c = (await payload.findByID({ collection: "ad-campaigns", id, depth: 0, overrideAccess: true })) as RawCampaign;
  const s = c.publication;
  if (!s?.campaignId) throw new PublishError("Pas encore publiée.");
  const { ctx, platform } = await accountContext(payload, await accountOf(payload, c.id));
  if (!platform.adPreview) return [];
  const out: { key: string; label: string; html: string }[] = [];
  // Un aperçu par créa et par nature (le premier ensemble suffit : la créa est la même dans tous).
  for (const [key, adId] of Object.entries(s.ads)) {
    if (!key.endsWith(":0")) continue;
    const [creaId, kind] = key.split(":");
    for (const [format, label] of [
      ["MOBILE_FEED_STANDARD", "Fil Facebook"],
      ["INSTAGRAM_STORY", "Story Instagram"],
    ] as const) {
      const html = await platform.adPreview(ctx, adId, format).catch(() => "");
      if (html) out.push({ key: `${key}:${format}`, label: `C${creaId} ${kind === "video" ? "vidéo" : "image"} — ${label}`, html });
    }
  }
  return out;
}

export { kindsOf, publishProblems };
