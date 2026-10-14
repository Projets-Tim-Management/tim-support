import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

import { execSql, rowsOf } from "@/core/lib/raw-sql";
import { describeRush } from "@/modules/ads/lib/rush-describe";
import { durationRefusal, keyframeTimes, orientationOf, parseProbe, stillArgs, transcodeArgs, type RushMeta } from "@/modules/ads/lib/rush-convert";

/**
 * La conversion d'un rush (plan Publicité, §9 sexies, D1b) : le cron prend le
 * plus ancien rush en attente, le convertit, range les sorties sur le stockage
 * et remplit la fiche.
 *
 * - Une VIDÉO se convertit dans Vercel Sandbox : une machine éphémère où l'on
 *   installe ffmpeg et ffprobe (paquets npm épinglés, binaires dans le paquet),
 *   le temps d'une conversion. Une fonction Vercel n'a ni ffmpeg, ni le temps.
 * - Une IMAGE se traite ici, avec sharp (déjà dans le projet).
 *
 * Le verrou est une requête SQL conditionnelle : deux crons ne convertissent
 * jamais le même rush. Trois échecs, et le rush passe « Échec » avec la raison.
 */

export const LEASE_MS = 15 * 60_000;
export const MAX_ATTEMPTS = 3;
const FFMPEG = "node_modules/@ffmpeg-installer/linux-x64/ffmpeg";
const FFPROBE = "node_modules/@ffprobe-installer/linux-x64/ffprobe";
const FFMPEG_PACKAGES = ["@ffmpeg-installer/linux-x64@4.1.0", "@ffprobe-installer/linux-x64@5.2.0"];

export type Still = { atSec: number; data: Buffer };
export type Outputs = {
  meta: RushMeta & { kind: "video" | "image" };
  working: { data: Buffer; contentType: string; ext: string };
  poster: Buffer;
  keyframes: Still[];
};
export type Claimed = { id: number; url: string; contentType: string; mediaType: "video" | "image" | null; attempts: number };
export type Store = (pathname: string, data: Buffer, contentType: string) => Promise<string>;

/** Prend le plus ancien rush à convertir (en attente, ou dont le verrou a expiré). Atomique. */
export async function claimNextRush(payload: Payload, now: Date): Promise<Claimed | null> {
  const until = new Date(now.getTime() + LEASE_MS).toISOString();
  const rows = rowsOf(
    await execSql(
      payload,
      sql`UPDATE "ad_rushes" SET "processing_status" = 'en-cours', "processing_lease_until" = ${until}::timestamptz,
            "processing_attempts" = COALESCE("processing_attempts", 0) + 1
          WHERE "id" = (
            SELECT "id" FROM "ad_rushes"
            WHERE "processing_status" = 'en-attente'
               OR ("processing_status" = 'en-cours' AND ("processing_lease_until" IS NULL OR "processing_lease_until" < ${now.toISOString()}::timestamptz))
            ORDER BY "created_at" LIMIT 1 FOR UPDATE SKIP LOCKED)
          RETURNING "id", "original_url", "original_content_type", "media_type", "processing_attempts"`,
    ),
  ) as Record<string, unknown>[];
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    url: String(r.original_url ?? ""),
    contentType: String(r.original_content_type ?? ""),
    mediaType: (r.media_type as Claimed["mediaType"]) ?? null,
    attempts: Number(r.processing_attempts ?? 1),
  };
}

/** Une vidéo, convertie dans une Sandbox Vercel ; la machine s'arrête quoi qu'il arrive. */
export async function convertVideoInSandbox(url: string): Promise<Outputs> {
  const { Sandbox } = await import("@vercel/sandbox");
  const sandbox = await Sandbox.create({ runtime: "node24", resources: { vcpus: 4 }, timeout: LEASE_MS });
  try {
    const run = async (cmd: string, args: string[]) => {
      const r = await sandbox.runCommand({ cmd, args });
      if (r.exitCode !== 0) throw new Error(`${cmd.split("/").pop()} : ${(await r.stderr()).trim().slice(-400) || `code ${r.exitCode}`}`);
      return r;
    };
    await run("npm", ["install", "--no-save", "--no-audit", "--no-fund", "--loglevel=error", ...FFMPEG_PACKAGES]);
    await run("curl", ["-fsSL", "--max-time", "600", "-o", "in.src", url]);
    const probe = await run(FFPROBE, ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", "in.src"]);
    const meta = parseProbe(JSON.parse(await probe.stdout()));
    const refusal = durationRefusal(meta);
    if (refusal) throw new FinalError(refusal);
    // HDR : le passage en SDR peut manquer à ffmpeg (bibliothèque absente) — on retente sans, plutôt qu'échouer.
    try {
      await run(FFMPEG, transcodeArgs("in.src", "work.mp4", meta, { tonemap: true }));
    } catch (e) {
      if (!meta.hdr) throw e;
      await run(FFMPEG, transcodeArgs("in.src", "work.mp4", meta, { tonemap: false }));
    }
    const read = async (path: string) => {
      const b = await sandbox.readFileToBuffer({ path });
      if (!b) throw new Error(`Sortie introuvable : ${path}`);
      return b;
    };
    const times = keyframeTimes(meta.durationSec);
    const posterAt = Math.min(1, (meta.durationSec ?? 1) / 10);
    await run(FFMPEG, stillArgs("work.mp4", "poster.jpg", posterAt, meta));
    for (const [i, t] of times.entries()) await run(FFMPEG, stillArgs("work.mp4", `kf-${i + 1}.jpg`, t, meta));
    // Une image clé manquante est ignorée : la vignette et les autres suffisent à décrire le rush.
    const keyframes: Still[] = [];
    for (const [i, t] of times.entries()) {
      const data = await sandbox.readFileToBuffer({ path: `kf-${i + 1}.jpg` });
      if (data?.length) keyframes.push({ atSec: t, data });
    }
    const poster = await read("poster.jpg");
    return {
      meta: { ...meta, kind: "video" },
      working: { data: await read("work.mp4"), contentType: "video/mp4", ext: "mp4" },
      poster,
      keyframes: keyframes.length ? keyframes : [{ atSec: posterAt, data: poster }],
    };
  } finally {
    await sandbox.stop().catch(() => undefined);
  }
}

/** Une image : redressée, 2160 px au plus, vignette de 720 px. Ici, avec sharp. */
export async function convertImage(url: string, fetcher: typeof fetch = fetch): Promise<Outputs> {
  const res = await fetcher(url);
  if (!res.ok) throw new Error(`Fichier introuvable sur le stockage (HTTP ${res.status}).`);
  const input = Buffer.from(await res.arrayBuffer());
  const sharp = (await import("sharp")).default;
  const working = await sharp(input).rotate().resize({ width: 2160, height: 2160, fit: "inside", withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
  const poster = await sharp(working.data).resize({ width: 720, height: 720, fit: "inside" }).jpeg({ quality: 82 }).toBuffer();
  const { width, height } = working.info;
  return {
    meta: { kind: "image", durationSec: null, width, height, orientation: orientationOf(width, height), fps: null, hasAudio: false, videoCodec: null, hdr: false },
    working: { data: working.data, contentType: "image/png", ext: "png" },
    poster,
    keyframes: [{ atSec: 0, data: poster }],
  };
}

/** Une erreur qui ne se règle pas en réessayant (vidéo trop longue, fichier illisible). */
export class FinalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinalError";
  }
}

/** Range les sorties sur le stockage public, à part des originaux. */
export async function storeOnBlob(pathname: string, data: Buffer, contentType: string): Promise<string> {
  const { put } = await import("@vercel/blob");
  const r = await put(pathname, data, { access: "public", contentType, addRandomSuffix: true, token: process.env.BLOB_READ_WRITE_TOKEN });
  return r.url;
}

export type ProcessDeps = {
  now?: () => Date;
  convertVideo?: (url: string) => Promise<Outputs>;
  convertImage?: (url: string) => Promise<Outputs>;
  store?: Store;
  /** La description proposée par l'IA après la conversion (D1c). */
  describe?: (payload: Payload, id: number) => Promise<unknown>;
};

/**
 * Convertit le prochain rush, s'il y en a un. Renvoie ce qui s'est passé, pour
 * le journal du cron. Ne lève pas : une conversion ratée s'écrit sur la fiche.
 */
export async function processNextRush(payload: Payload, deps: ProcessDeps = {}): Promise<{ id: number; outcome: "pret" | "reessai" | "echec"; error?: string } | null> {
  const now = deps.now ?? (() => new Date());
  const claimed = await claimNextRush(payload, now());
  if (!claimed) return null;
  const update = (data: Record<string, unknown>) => payload.update({ collection: "ad-rushes", id: claimed.id, data: data as never, depth: 0, overrideAccess: true });
  try {
    const kind = claimed.mediaType ?? (claimed.contentType.startsWith("image/") ? "image" : "video");
    const out = kind === "image" ? await (deps.convertImage ?? convertImage)(claimed.url) : await (deps.convertVideo ?? convertVideoInSandbox)(claimed.url);
    const store = deps.store ?? storeOnBlob;
    const dir = `ads/rushes/travail/${claimed.id}`;
    const workingUrl = await store(`${dir}/travail.${out.working.ext}`, out.working.data, out.working.contentType);
    const posterUrl = await store(`${dir}/vignette.jpg`, out.poster, "image/jpeg");
    const keyframes = [];
    for (const [i, k] of out.keyframes.entries()) keyframes.push({ atSec: k.atSec, url: kind === "image" ? posterUrl : await store(`${dir}/image-${i + 1}.jpg`, k.data, "image/jpeg") });
    await update({
      processing: { status: "pret", error: null, attempts: claimed.attempts, processedAt: now().toISOString(), leaseUntil: null },
      working: { url: workingUrl, posterUrl, keyframes, meta: out.meta },
    });
    // La description proposée par l'IA : un plus, jamais une condition. En cas d'échec, le rush reste prêt
    // et la proposition se relance depuis sa fiche.
    await (deps.describe ?? describeRush)(payload, claimed.id).catch((e) => payload.logger.warn(`[publicité] rush ${claimed.id} : description IA non proposée (${(e as Error).message})`));
    return { id: claimed.id, outcome: "pret" };
  } catch (e) {
    const message = (e as Error).message.slice(0, 500);
    const final = e instanceof FinalError || claimed.attempts >= MAX_ATTEMPTS;
    await update({ processing: { status: final ? "echec" : "en-attente", error: message, attempts: claimed.attempts, processedAt: null, leaseUntil: null } }).catch((err) =>
      payload.logger.error(`[publicité] rush ${claimed.id} : état d'échec non écrit (${(err as Error).message})`),
    );
    return { id: claimed.id, outcome: final ? "echec" : "reessai", error: message };
  }
}
