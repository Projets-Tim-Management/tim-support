import { sql } from "@payloadcms/db-postgres";
import path from "node:path";
import type { Payload } from "payload";

import { execSql, rowsOf } from "@/core/lib/raw-sql";
import { loadGenerationContext } from "@/modules/ads/lib/copy/generate";
import { ctaLabel } from "@/modules/ads/lib/cta";
import type { Framing } from "@/modules/ads/lib/framing";
import { FinalError, storeOnBlob, type Store } from "@/modules/ads/lib/rush-process";
import { isInspiration } from "@/modules/ads/lib/rushes";
import { beatAlign } from "@/modules/ads/video/beat";
import { defaultScore, featuresOf } from "@/modules/ads/video/default-score";
import { paceOf } from "@/modules/ads/video/pace";
import { loadAnimatedLogo } from "@/modules/ads/video/logo-server";
import { buildPosterProps, buildRenderProps, type RenderProps } from "@/modules/ads/video/props";
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

type RushDoc = { id: number; use?: string | null; processing?: { status?: string } | null; working?: { url?: string | null; meta?: { width?: number; height?: number; durationSec?: number | null } | null } | null; framing?: Framing | null; features?: string[] | null; ai?: { status?: string | null } | null; source?: string | null };

/** Ce qu'il faut pour vérifier et traduire une partition : rushes, faits du brief, offre, interdits, style, kit. */
export async function loadVideoContext(payload: Payload, creative: Raw) {
  const campaignId = idOf(creative.campaign);
  if (campaignId == null) throw new FinalError("Créa sans campagne.");
  const styleId = idOf(creative.style);
  if (styleId == null) throw new FinalError("Choisissez d'abord le style de la vidéo.");
  // Tout part en même temps : rien ici ne dépend d'une autre lecture (musique, éléments et visages ne lèvent pas).
  const [gen, style, kit, appearance, rushes, music, elements, faces] = await Promise.all([
    loadGenerationContext(payload, campaignId),
    payload.findByID({ collection: "ad-styles", id: styleId, depth: 0, overrideAccess: true }) as unknown as Promise<Raw>,
    payload.findGlobal({ slug: "ads-brand-kit", depth: 1, overrideAccess: true }) as unknown as Promise<Raw>,
    payload.findGlobal({ slug: "appearance", depth: 0, overrideAccess: true }).catch(() => null) as unknown as Promise<Raw | null>,
    payload.find({ collection: "ad-rushes", pagination: false, depth: 0, overrideAccess: true }).then((r) => r.docs as unknown as RushDoc[]),
    musicOf(payload, idOf((creative.video as Raw | null | undefined)?.music)),
    payload
      .find({ collection: "ad-elements", pagination: false, depth: 0, overrideAccess: true })
      .catch(() => ({ docs: [] }))
      .then((r) => r.docs as unknown as ElementDoc[]),
    facesOf(payload),
  ]);
  // Une inspiration (souvent la pub d'un autre) n'est jamais montée : elle n'est pas « prête » pour un montage.
  const ready = rushes.filter((r) => !isInspiration(r) && r.processing?.status === "pret" && r.working?.url && r.working.meta?.width && r.working.meta?.height);
  return { gen, style, kit, appearance, rushes, ready, music, elements, faces };
}

type ElementDoc = { id: number; name?: string; base: string; status: string; params?: unknown; versions?: { n: number }[] | null };
export type VideoContext = Awaited<ReturnType<typeof loadVideoContext>>;

/**
 * La photo des éléments d'un rendu : pour chaque élément posé, sa variante, son
 * nom, sa VERSION et ses réglages du moment. Gardée avec la vidéo, elle dit à
 * l'analyse quelle version a produit quel résultat, même si l'élément change
 * ou est retiré ensuite. Pure.
 */
export function elementsUsed(score: Score, elements: { id: number; name?: string; base: string; params?: unknown; versions?: { n: number }[] | null }[]) {
  const byId = new Map(elements.map((e) => [Number(e.id), e]));
  const out: { type: string; variante: number | null; nom: string | null; version: number | null; params: unknown }[] = [];
  for (const shot of score.shots) {
    if (shot.kind !== "compo") continue;
    for (const e of shot.elements) {
      const v = e.variante != null ? byId.get(e.variante) : undefined;
      out.push({ type: e.type, variante: v ? Number(v.id) : null, nom: v?.name ?? null, version: v ? (v.versions?.length ?? 1) : null, params: v?.params ?? {} });
    }
  }
  return out;
}

/** Les visages des avatars (Médias publicitaires, nature « Visage »), les plus récents d'abord, 12 au plus. */
export async function facesOf(payload: Payload): Promise<string[]> {
  const r = await payload.find({ collection: "ad-media", where: { kind: { equals: "visage" } }, sort: "-createdAt", limit: 12, depth: 0, overrideAccess: true }).catch(() => ({ docs: [] }));
  return (r.docs as unknown as { url?: string | null }[]).map((m) => m.url ?? "").filter(Boolean);
}

type MusicDoc = { id: number; kind?: string; active?: boolean | null; url?: string | null; filename?: string | null; beat?: { bpm?: number | null; bestStartSec?: number | null } | null };

/** La musique d'une vidéo, telle que le rendu la lit ; `null` sans musique (ou si elle a disparu). */
async function musicOf(payload: Payload, id: number | null): Promise<{ url: string; startSec: number; bpm: number | null } | null> {
  if (id == null) return null;
  const m = (await payload.findByID({ collection: "ad-media", id, depth: 0, overrideAccess: true }).catch(() => null)) as unknown as MusicDoc | null;
  if (!m?.url || m.kind !== "musique") return null;
  return { url: m.url, startSec: m.beat?.bestStartSec ?? 0, bpm: m.beat?.bpm && m.beat.bpm > 0 ? m.beat.bpm : null };
}

/**
 * La musique demandée : celle du kit si rien n'est précisé, aucune pour `null`.
 * Une musique choisie exprès doit être active ; celle du kit sert telle quelle.
 */
async function resolveMusic(payload: Payload, kit: Raw, asked: number | string | null | undefined): Promise<number | null> {
  const id = asked === undefined ? idOf(kit.music) : asked === null ? null : Number(asked);
  if (id == null || !Number.isFinite(id)) return null;
  const m = (await payload.findByID({ collection: "ad-media", id, depth: 0, overrideAccess: true }).catch(() => null)) as unknown as MusicDoc | null;
  if (!m || m.kind !== "musique") throw new FinalError(`Musique ${id} introuvable.`);
  if (asked !== undefined && m.active === false) throw new FinalError(`La musique « ${m.filename ?? id} » est désactivée.`);
  return id;
}

export type VideoCreative = Raw & {
  hook?: string | null;
  angle?: string | null;
  copy?: { kind: string; text: string; status: string }[] | null;
  facts?: unknown[] | null;
};

/**
 * Prépare la vidéo d'une créa dans un style : sa partition (celle fournie, ou
 * la partition par défaut), vérifiée, puis mise en file de rendu. Lève avec la
 * raison si la partition ne passe pas.
 *
 * `preloaded` : la créa (ou celle dont elle est la copie : mêmes textes, même
 * campagne) et son contexte, déjà lus — dont le style `input.styleId`, déjà
 * trouvé. Plusieurs variantes d'un montage ne relisent ainsi pas tout à chaque fois.
 */
export async function requestVideo(
  payload: Payload,
  creativeId: number | string,
  input: { styleId: number | string; score?: unknown; music?: number | string | null; requireActiveElements?: boolean; requireBase?: boolean },
  preloaded?: { creative: VideoCreative; ctx: VideoContext },
): Promise<{ score: Score; music: number | null }> {
  let creative: VideoCreative;
  let ctx: VideoContext;
  if (preloaded) {
    ({ creative, ctx } = preloaded);
    if (ctx.style.active === false) throw new FinalError(`Le style « ${String(ctx.style.name)} » est désactivé.`);
  } else {
    creative = (await payload.findByID({ collection: "ad-creatives", id: creativeId, depth: 0, overrideAccess: true })) as unknown as VideoCreative;
    const style = (await payload.findByID({ collection: "ad-styles", id: input.styleId, depth: 0, overrideAccess: true }).catch(() => null)) as unknown as Raw | null;
    if (!style) throw new FinalError("Style introuvable.");
    if (style.active === false) throw new FinalError(`Le style « ${String(style.name)} » est désactivé.`);
    ctx = await loadVideoContext(payload, { ...creative, style: input.styleId });
  }

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
  const problems = scoreProblems(score, scoreContextOf(ctx, { requireActive: input.requireActiveElements, requireBase: input.requireBase, angle: `${creative.angle ?? ""} ${creative.hook ?? ""}` }));
  if (problems.length) throw new FinalError(`Partition refusée : ${problems.join(" ")}`);
  const music = await resolveMusic(payload, ctx.kit, input.music);
  await payload.update({
    collection: "ad-creatives",
    id: creativeId,
    data: { style: input.styleId, video: { status: "en-attente", error: null, score, music, renders: null, attempts: 0, renderedAt: null, leaseUntil: null } } as never,
    depth: 0,
    overrideAccess: true,
  });
  return { score, music };
}

export function scoreContextOf(ctx: VideoContext, opts: { requireActive?: boolean; requireBase?: boolean; angle?: string } = {}) {
  const forbidden = [...((ctx.kit.forbidden as { term?: string }[] | undefined) ?? []).map((f) => f.term ?? "").filter(Boolean), ...ctx.gen.forbidden];
  return {
    rushes: new Map(
      ctx.rushes.map((r) => {
        const m = r.working?.meta;
        return [r.id, { id: r.id, ready: ctx.ready.includes(r), durationSec: m?.durationSec ?? null, framing: r.framing ?? null, srcAspect: m?.width && m?.height ? m.width / m.height : null }];
      }),
    ),
    facts: new Map(ctx.gen.brief.facts.map((f) => [Number(f.id), { id: Number(f.id), statement: f.statement, source: f.source }])),
    offer: ctx.gen.brief.offer ?? null,
    forbidden,
    variants: new Map(ctx.elements.map((e) => [Number(e.id), { type: e.base, status: e.status }])),
    requireActive: opts.requireActive ?? false,
    requireBase: opts.requireBase ?? false,
    // La Base V1 relie le rush du geste à la fonctionnalité de l'angle.
    base: {
      angleFeatures: featuresOf(opts.angle ?? ""),
      rushFeatures: new Map(ctx.rushes.map((r) => [r.id, (r.features ?? []) as string[]])),
      // Le temps de lecture se compte comme le moteur l'anime : rythme du style, vitesse de chaque variante.
      pace: paceOf((ctx.style as { pace?: unknown }).pace),
      speeds: new Map(ctx.elements.map((e) => [Number(e.id), Number((e.params as { vitesse?: unknown } | null)?.vitesse ?? 1) || 1])),
    },
  };
}

/** Les vidéos de chaque format, et l'affiche (image fixe) de chaque format quand on en demande. */
export type RenderOne = (props: RenderProps[], posters?: RenderProps[]) => Promise<{ format: FormatKey; data: Buffer; poster?: Buffer | null }[]>;

/** Rend les formats (vidéos puis affiches) dans UNE Sandbox (installation partagée), et l'arrête quoi qu'il arrive. */
export const renderInSandbox: RenderOne = async (list, posters = []) => {
  const { createSandbox, addBundleToSandbox, renderMediaOnVercel, renderStillOnVercel } = await import("@remotion/vercel");
  const sandbox = await createSandbox({ resources: { vcpus: 4 } });
  try {
    // @remotion/vercel 4.0.530 crée les sous-dossiers du projet (public/…) mais pas sa racine : sans elle, le dépôt échoue.
    await sandbox.mkDir("remotion-bundle");
    await addBundleToSandbox({ sandbox, bundleDir: path.join(process.cwd(), "remotion-bundle") });
    const out: { format: FormatKey; data: Buffer; poster?: Buffer | null }[] = [];
    for (const props of list) {
      const r = await renderMediaOnVercel({ sandbox, compositionId: "Pub", inputProps: props as unknown as Record<string, unknown>, codec: "h264", outputFile: `/tmp/pub-${props.format}.mp4` });
      const data = await sandbox.readFileToBuffer({ path: r.sandboxFilePath });
      if (!data) throw new Error(`Vidéo ${props.format} introuvable dans la Sandbox.`);
      out.push({ format: props.format, data, poster: null });
    }
    // Les affiches : une image n'empêche jamais la vidéo d'exister — une affiche ratée est simplement absente.
    for (const props of posters) {
      try {
        const r = await renderStillOnVercel({ sandbox, compositionId: "Affiche", inputProps: props as unknown as Record<string, unknown>, imageFormat: "jpeg", jpegQuality: 90, outputFile: `/tmp/affiche-${props.format}.jpg` });
        const data = await sandbox.readFileToBuffer({ path: r.sandboxFilePath });
        const row = out.find((o) => o.format === props.format);
        if (row && data) row.poster = data;
      } catch {
        /* sans affiche pour ce format */
      }
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
    const scoreCtx = scoreContextOf(ctx, { angle: `${String(creative.angle ?? "")} ${String(creative.hook ?? "")}` });
    const problems = scoreProblems(score, scoreCtx);
    if (problems.length) throw new FinalError(`Partition refusée : ${problems.join(" ")}`);
    const rushes = new Map(ctx.ready.map((r) => [r.id, { url: r.working!.url!, width: r.working!.meta!.width!, height: r.working!.meta!.height!, framing: r.framing ?? null }]));
    const facts = new Map(ctx.gen.brief.facts.map((f) => [Number(f.id), { statement: f.statement, source: f.source }]));
    // Sur une musique au tempo connu, chaque coupe va sur un temps. La partition calée est revérifiée : si le
    // calage la fait sortir des règles (Base V1, temps de lecture), on garde la sienne, et la musique joue quand même.
    const aligned = ctx.music?.bpm ? beatAlign(score, ctx.music.bpm) : score;
    const timed = aligned !== score && scoreProblems(aligned, scoreCtx).length ? score : aligned;
    const logoAnimated = await loadAnimatedLogo(ctx.kit.logoAnimated);
    const variants = new Map(ctx.elements.map((e) => [Number(e.id), { type: e.base, params: e.params ?? {} }]));
    const cta = ctaLabel(creative.cta) ?? "En savoir plus";
    const props = FORMAT_KEYS.map((format) =>
      buildRenderProps(timed, { format, style: ctx.style, kit: ctx.kit, appearance: ctx.appearance, cta, rushes, facts, music: ctx.music, logoAnimated, variants, faces: ctx.faces }),
    );
    const hook = String((creative as Raw).hook ?? "");
    const posters = FORMAT_KEYS.map((format) =>
      buildPosterProps(timed, { format, style: ctx.style, kit: ctx.kit, appearance: ctx.appearance, cta, rushes, facts, logoAnimated, variants, faces: ctx.faces }, hook),
    );
    const files = await (deps.render ?? renderInSandbox)(props, posters);
    const store = deps.store ?? storeOnBlob;
    const slug = String(ctx.style.name ?? "style").normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase().replace(/^-|-$/g, "");
    const seconds = Math.round(timed.shots.reduce((t, s) => t + s.seconds, 0) * 100) / 100;
    // Les envois partent ensemble ; Promise.all garde l'ordre des formats.
    const renders = await Promise.all(
      files.map(async (f) => ({ format: f.format, url: await store(`ads/creas/videos/${claimed.id}/${slug}-${f.format}.mp4`, f.data, "video/mp4"), seconds, bytes: f.data.length })),
    );
    await write({ status: "prete", error: null, renders, elements: elementsUsed(timed, ctx.elements), attempts: claimed.attempts, renderedAt: now().toISOString(), leaseUntil: null });
    // Les affiches, dans le style, remplacent les visuels de la créa (les anciens gabarits) quand les trois formats sont là.
    if (files.length && files.every((f) => f.poster)) {
      const assets = await Promise.all(
        files.map(async (f) => {
          const media = await payload.create({
            collection: "ad-media",
            data: { kind: "crea", alt: `Affiche ${String(ctx.style.name ?? "")} — ${f.format}` } as never,
            file: { data: f.poster!, mimetype: "image/jpeg", name: `affiche_${claimed.id}_${slug}_${f.format}.jpg`, size: f.poster!.length },
            overrideAccess: true,
          });
          return { format: f.format, type: "image", template: `affiche-${slug}`, media: media.id };
        }),
      );
      await payload.update({ collection: "ad-creatives", id: claimed.id, data: { assets } as never, depth: 0, overrideAccess: true });
    }
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

/**
 * Après « Générer des créas » : chaque nouvelle créa reçoit son PREMIER
 * MONTAGE par l'IA — une retouche automatique, visible dans son historique,
 * qui écrit la partition (scènes de motion design, rushes, logo, musique du
 * kit) dans un style, en alternant les styles actifs. Le code la vérifie, puis
 * vidéo et affiches sont rendues. Sans style actif, les créas gardent leurs
 * visuels de gabarit. Ne lève pas.
 */
export async function queueVideosFor(payload: Payload, ids: (number | string)[]): Promise<{ queued: number; skipped: string | null }> {
  const styles = (await payload.find({ collection: "ad-styles", where: { active: { equals: true } }, sort: "name", pagination: false, depth: 0, overrideAccess: true })).docs as unknown as Raw[];
  if (!styles.length) return { queued: 0, skipped: "Aucun style actif." };
  const { firstMontageInstruction, requestRetouch } = await import("@/modules/ads/lib/retouch");
  let queued = 0;
  let skipped: string | null = null;
  for (const [i, id] of ids.entries()) {
    const st = styles[i % styles.length];
    try {
      await requestRetouch(payload, id, { instruction: firstMontageInstruction({ id: Number(st.id), name: String(st.name ?? "") }), generalize: false, author: null });
      queued++;
    } catch (e) {
      skipped = (e as Error).message;
    }
  }
  return { queued, skipped };
}
