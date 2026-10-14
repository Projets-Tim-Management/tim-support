import { sql } from "@payloadcms/db-postgres";
import path from "node:path";
import type { Payload } from "payload";

import { execSql, rowsOf } from "@/core/lib/raw-sql";
import { loadGenerationContext } from "@/modules/ads/lib/copy/generate";
import { ctaLabel } from "@/modules/ads/lib/cta";
import type { Framing } from "@/modules/ads/lib/framing";
import { FinalError, storeOnBlob, type Store } from "@/modules/ads/lib/rush-process";
import { defaultScore } from "@/modules/ads/video/default-score";
import { buildRenderProps, type RenderProps } from "@/modules/ads/video/props";
import { FORMAT_KEYS, parseScore, scoreProblems, type FormatKey, type Score } from "@/modules/ads/video/score";

/**
 * Le rendu des vidéos (plan Publicité, §9 sexies, D3) : le cron prend la plus
 * ancienne créa en attente, revérifie sa partition, la traduit pour chaque
 * format et la fait rendre dans UNE Sandbox Vercel (Chrome et le moteur de
 * Remotion y sont installés par @remotion/vercel, le projet vidéo compilé y
 * est déposé). Les trois MP4 vont sur le stockage, à côté des visuels.
 *
 * Verrou SQL conditionnel, comme pour les rushes ; trois échecs, ou une
 * partition refusée, et la vidéo passe « Échec » avec la raison.
 */

export const LEASE_MS = 20 * 60_000;
export const MAX_ATTEMPTS = 3;

type Raw = Record<string, unknown>;
const idOf = (v: unknown): number | null => (v && typeof v === "object" ? Number((v as { id: unknown }).id) : v == null ? null : Number(v));

/** Prend la plus ancienne vidéo à rendre (en attente, ou dont le verrou a expiré). Atomique. */
export async function claimNextRender(payload: Payload, now: Date): Promise<{ id: number; attempts: number } | null> {
  const until = new Date(now.getTime() + LEASE_MS).toISOString();
  const rows = rowsOf(
    await execSql(
      payload,
      sql`UPDATE "ad_creatives" SET "video_status" = 'en-cours', "video_lease_until" = ${until}::timestamptz,
            "video_attempts" = COALESCE("video_attempts", 0) + 1
          WHERE "id" = (
            SELECT "id" FROM "ad_creatives"
            WHERE "video_status" = 'en-attente'
               OR ("video_status" = 'en-cours' AND ("video_lease_until" IS NULL OR "video_lease_until" < ${now.toISOString()}::timestamptz))
            ORDER BY "updated_at" LIMIT 1 FOR UPDATE SKIP LOCKED)
          RETURNING "id", "video_attempts"`,
    ),
  ) as Raw[];
  const r = rows[0];
  return r ? { id: Number(r.id), attempts: Number(r.video_attempts ?? 1) } : null;
}

type RushDoc = { id: number; processing?: { status?: string } | null; working?: { url?: string | null; meta?: { width?: number; height?: number; durationSec?: number | null } | null } | null; framing?: Framing | null; features?: string[] | null; ai?: { status?: string | null } | null; source?: string | null };

/** Ce qu'il faut pour vérifier et traduire une partition : rushes, faits du brief, offre, interdits, style, kit. */
export async function loadVideoContext(payload: Payload, creative: Raw) {
  const campaignId = idOf(creative.campaign);
  if (campaignId == null) throw new FinalError("Créa sans campagne.");
  const styleId = idOf(creative.style);
  if (styleId == null) throw new FinalError("Choisissez d'abord le style de la vidéo.");
  const [gen, style, kit, appearance, rushes] = await Promise.all([
    loadGenerationContext(payload, campaignId),
    payload.findByID({ collection: "ad-styles", id: styleId, depth: 0, overrideAccess: true }) as unknown as Promise<Raw>,
    payload.findGlobal({ slug: "ads-brand-kit", depth: 1, overrideAccess: true }) as unknown as Promise<Raw>,
    payload.findGlobal({ slug: "appearance", depth: 0, overrideAccess: true }).catch(() => null) as unknown as Promise<Raw | null>,
    payload.find({ collection: "ad-rushes", pagination: false, depth: 0, overrideAccess: true }).then((r) => r.docs as unknown as RushDoc[]),
  ]);
  const ready = rushes.filter((r) => r.processing?.status === "pret" && r.working?.url && r.working.meta?.width && r.working.meta?.height);
  return { gen, style, kit, appearance, rushes, ready };
}

/**
 * Prépare la vidéo d'une créa dans un style : sa partition (celle fournie, ou
 * la partition par défaut), vérifiée, puis mise en file de rendu. Lève avec la
 * raison si la partition ne passe pas.
 */
export async function requestVideo(payload: Payload, creativeId: number | string, input: { styleId: number | string; score?: unknown }): Promise<{ score: Score }> {
  const creative = (await payload.findByID({ collection: "ad-creatives", id: creativeId, depth: 0, overrideAccess: true })) as unknown as Raw & {
    hook?: string | null;
    angle?: string | null;
    copy?: { kind: string; text: string; status: string }[] | null;
    facts?: unknown[] | null;
  };
  const style = (await payload.findByID({ collection: "ad-styles", id: input.styleId, depth: 0, overrideAccess: true }).catch(() => null)) as unknown as Raw | null;
  if (!style) throw new FinalError("Style introuvable.");
  if (style.active === false) throw new FinalError(`Le style « ${String(style.name)} » est désactivé.`);
  const ctx = await loadVideoContext(payload, { ...creative, style: input.styleId });

  let score: Score;
  if (input.score) score = parseScore(input.score);
  else {
    const ok = (k: string) => (creative.copy ?? []).filter((t) => t.kind === k && t.status === "ok").map((t) => t.text);
    const factIds = (creative.facts ?? []).map(idOf).filter((n): n is number => n != null && ctx.gen.brief.facts.some((f) => Number(f.id) === n));
    const d = defaultScore({
      hook: creative.hook ?? "",
      angle: creative.angle ?? "",
      titles: ok("titre"),
      descriptions: ok("description"),
      factIds,
      rushes: ctx.ready.map((r) => ({ id: r.id, durationSec: r.working?.meta?.durationSec ?? 0, features: r.features ?? [], validated: r.ai?.status === "validee", source: r.source ?? null })),
    });
    if (!d.ok) throw new FinalError(d.error);
    score = d.score;
  }
  const problems = scoreProblems(score, scoreContextOf(ctx));
  if (problems.length) throw new FinalError(`Partition refusée : ${problems.join(" ")}`);
  await payload.update({
    collection: "ad-creatives",
    id: creativeId,
    data: { style: input.styleId, video: { status: "en-attente", error: null, score, renders: null, attempts: 0, renderedAt: null, leaseUntil: null } } as never,
    depth: 0,
    overrideAccess: true,
  });
  return { score };
}

export function scoreContextOf(ctx: Awaited<ReturnType<typeof loadVideoContext>>) {
  const forbidden = [...((ctx.kit.forbidden as { term?: string }[] | undefined) ?? []).map((f) => f.term ?? "").filter(Boolean), ...ctx.gen.forbidden];
  return {
    rushes: new Map(ctx.rushes.map((r) => [r.id, { id: r.id, ready: ctx.ready.includes(r), durationSec: r.working?.meta?.durationSec ?? null, framing: r.framing ?? null }])),
    facts: new Map(ctx.gen.brief.facts.map((f) => [Number(f.id), { id: Number(f.id), statement: f.statement, source: f.source }])),
    offer: ctx.gen.brief.offer ?? null,
    forbidden,
  };
}

export type RenderOne = (props: RenderProps[]) => Promise<{ format: FormatKey; data: Buffer }[]>;

/** Rend les formats dans UNE Sandbox (installation partagée), et l'arrête quoi qu'il arrive. */
export const renderInSandbox: RenderOne = async (list) => {
  const { createSandbox, addBundleToSandbox, renderMediaOnVercel } = await import("@remotion/vercel");
  const sandbox = await createSandbox({ resources: { vcpus: 4 } });
  try {
    // @remotion/vercel 4.0.530 crée les sous-dossiers du projet (public/…) mais pas sa racine : sans elle, le dépôt échoue.
    await sandbox.mkDir("remotion-bundle");
    await addBundleToSandbox({ sandbox, bundleDir: path.join(process.cwd(), "remotion-bundle") });
    const out: { format: FormatKey; data: Buffer }[] = [];
    for (const props of list) {
      const r = await renderMediaOnVercel({ sandbox, compositionId: "Pub", inputProps: props as unknown as Record<string, unknown>, codec: "h264", outputFile: `/tmp/pub-${props.format}.mp4` });
      const data = await sandbox.readFileToBuffer({ path: r.sandboxFilePath });
      if (!data) throw new Error(`Vidéo ${props.format} introuvable dans la Sandbox.`);
      out.push({ format: props.format, data });
    }
    return out;
  } finally {
    await sandbox.stop().catch(() => undefined);
  }
};

export type RenderDeps = { now?: () => Date; render?: RenderOne; store?: Store };

/** Rend la prochaine vidéo en attente, s'il y en a une. Ne lève pas : l'échec s'écrit sur la créa. */
export async function processNextRender(payload: Payload, deps: RenderDeps = {}): Promise<{ id: number; outcome: "prete" | "reessai" | "echec"; error?: string } | null> {
  const now = deps.now ?? (() => new Date());
  const claimed = await claimNextRender(payload, now());
  if (!claimed) return null;
  const creative = (await payload.findByID({ collection: "ad-creatives", id: claimed.id, depth: 0, overrideAccess: true })) as unknown as Raw & { cta?: string | null; video?: { score?: unknown } | null };
  const write = (video: Record<string, unknown>) =>
    payload.update({ collection: "ad-creatives", id: claimed.id, data: { video: { ...(creative.video ?? {}), ...video } } as never, depth: 0, overrideAccess: true });
  try {
    const ctx = await loadVideoContext(payload, creative);
    const score = parseScore(creative.video?.score);
    const problems = scoreProblems(score, scoreContextOf(ctx));
    if (problems.length) throw new FinalError(`Partition refusée : ${problems.join(" ")}`);
    const rushes = new Map(ctx.ready.map((r) => [r.id, { url: r.working!.url!, width: r.working!.meta!.width!, height: r.working!.meta!.height!, framing: r.framing ?? null }]));
    const facts = new Map(ctx.gen.brief.facts.map((f) => [Number(f.id), { statement: f.statement, source: f.source }]));
    const props = FORMAT_KEYS.map((format) =>
      buildRenderProps(score, { format, style: ctx.style, kit: ctx.kit, appearance: ctx.appearance, cta: ctaLabel(creative.cta) ?? "En savoir plus", rushes, facts }),
    );
    const files = await (deps.render ?? renderInSandbox)(props);
    const store = deps.store ?? storeOnBlob;
    const slug = String(ctx.style.name ?? "style").normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase().replace(/^-|-$/g, "");
    const seconds = score.shots.reduce((t, s) => t + s.seconds, 0);
    const renders = [];
    for (const f of files) renders.push({ format: f.format, url: await store(`ads/creas/videos/${claimed.id}/${slug}-${f.format}.mp4`, f.data, "video/mp4"), seconds, bytes: f.data.length });
    await write({ status: "prete", error: null, renders, attempts: claimed.attempts, renderedAt: now().toISOString(), leaseUntil: null });
    return { id: claimed.id, outcome: "prete" };
  } catch (e) {
    const message = (e as Error).message.slice(0, 900);
    const final = e instanceof FinalError || claimed.attempts >= MAX_ATTEMPTS;
    await write({ status: final ? "echec" : "en-attente", error: message, attempts: claimed.attempts, leaseUntil: null }).catch((err) =>
      payload.logger.error(`[publicité] vidéo de la créa ${claimed.id} : état d'échec non écrit (${(err as Error).message})`),
    );
    return { id: claimed.id, outcome: final ? "echec" : "reessai", error: message };
  }
}
