import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

import { execSql, rowsOf } from "@/core/lib/raw-sql";
import { FFMPEG, FFMPEG_PACKAGES, FinalError } from "@/modules/ads/lib/rush-process";
import { analyseBeat, ANALYSIS_RATE, type Beat } from "@/modules/ads/video/beat";

/**
 * L'analyse des musiques (plan Publicité, §9 sexies, M) : une musique déposée
 * dans les Médias publicitaires passe « en attente d'analyse » ; le cron la
 * décode dans une Sandbox Vercel (ffmpeg : mono, 11 025 Hz, 5 minutes au plus)
 * et en tire ici le tempo, le premier temps et le meilleur passage.
 *
 * Même verrou SQL conditionnel que les rushes ; trois échecs, ou un fichier
 * illisible, et l'analyse passe « Échec » avec la raison.
 */

export const LEASE_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 3;
/** Au-delà, ce n'est plus un fond de pub : on n'analyse que les 5 premières minutes. */
export const MAX_DECODE_SEC = 300;

/** Les arguments de ffmpeg : le morceau décodé, mono, à la fréquence de l'analyse, en entiers 16 bits bruts. Pure. */
export const decodeArgs = (input: string, output: string): string[] => [
  "-y",
  "-hide_banner",
  "-loglevel",
  "error",
  "-i",
  input,
  "-t",
  String(MAX_DECODE_SEC),
  "-vn",
  "-ac",
  "1",
  "-ar",
  String(ANALYSIS_RATE),
  "-f",
  "s16le",
  output,
];

/** Prend la plus ancienne musique à analyser (en attente, ou dont le verrou a expiré). Atomique. */
export async function claimNextMusic(payload: Payload, now: Date): Promise<{ id: number; attempts: number } | null> {
  const until = new Date(now.getTime() + LEASE_MS).toISOString();
  const rows = rowsOf(
    await execSql(
      payload,
      sql`UPDATE "ad_media" SET "beat_status" = 'en-cours', "beat_lease_until" = ${until}::timestamptz,
            "beat_attempts" = COALESCE("beat_attempts", 0) + 1
          WHERE "id" = (
            SELECT "id" FROM "ad_media"
            WHERE "kind" = 'musique' AND ("beat_status" = 'en-attente'
               OR ("beat_status" = 'en-cours' AND ("beat_lease_until" IS NULL OR "beat_lease_until" < ${now.toISOString()}::timestamptz)))
            ORDER BY "created_at" LIMIT 1 FOR UPDATE SKIP LOCKED)
          RETURNING "id", "beat_attempts"`,
    ),
  ) as Record<string, unknown>[];
  const r = rows[0];
  return r ? { id: Number(r.id), attempts: Number(r.beat_attempts ?? 1) } : null;
}

/** Le morceau décodé dans une Sandbox ; la machine s'arrête quoi qu'il arrive. */
export async function decodeInSandbox(url: string): Promise<Int16Array> {
  const { Sandbox } = await import("@vercel/sandbox");
  const sandbox = await Sandbox.create({ runtime: "node24", resources: { vcpus: 2 }, timeout: LEASE_MS });
  try {
    const run = async (cmd: string, args: string[]) => {
      const r = await sandbox.runCommand({ cmd, args });
      if (r.exitCode !== 0) throw new Error(`${cmd.split("/").pop()} : ${(await r.stderr()).trim().slice(-400) || `code ${r.exitCode}`}`);
    };
    await run("npm", ["install", "--no-save", "--no-audit", "--no-fund", "--loglevel=error", ...FFMPEG_PACKAGES]);
    await run("curl", ["-fsSL", "--max-time", "300", "-o", "in.src", url]);
    try {
      await run(FFMPEG, decodeArgs("in.src", "pcm.raw"));
    } catch (e) {
      throw new FinalError(`Fichier audio illisible : ${(e as Error).message}`);
    }
    const data = await sandbox.readFileToBuffer({ path: "pcm.raw" });
    if (!data?.length) throw new FinalError("Aucun son décodé : le fichier est-il bien une musique ?");
    // Une copie alignée : un Buffer peut commencer à un octet impair de son tampon.
    const copy = new Uint8Array(data.length - (data.length % 2));
    copy.set(data.subarray(0, copy.length));
    return new Int16Array(copy.buffer);
  } finally {
    await sandbox.stop().catch(() => undefined);
  }
}

export type MusicDeps = { now?: () => Date; decode?: (url: string) => Promise<Int16Array> };

/** Analyse la prochaine musique en attente, s'il y en a une. Ne lève pas : l'échec s'écrit sur le média. */
export async function processNextMusic(payload: Payload, deps: MusicDeps = {}): Promise<{ id: number; outcome: "pret" | "reessai" | "echec"; error?: string; beat?: Beat } | null> {
  const now = deps.now ?? (() => new Date());
  const claimed = await claimNextMusic(payload, now());
  if (!claimed) return null;
  const write = (beat: Record<string, unknown>) => payload.update({ collection: "ad-media", id: claimed.id, data: { beat } as never, depth: 0, overrideAccess: true });
  try {
    const media = (await payload.findByID({ collection: "ad-media", id: claimed.id, depth: 0, overrideAccess: true })) as unknown as { url?: string | null };
    if (!media.url) throw new FinalError("Fichier introuvable sur le stockage.");
    const url = media.url.startsWith("http") ? media.url : `${process.env.NEXT_PUBLIC_SERVER_URL ?? ""}${media.url}`;
    let beat: Beat;
    try {
      beat = analyseBeat(await (deps.decode ?? decodeInSandbox)(url));
    } catch (e) {
      // Un morceau trop court ne le sera pas moins au deuxième essai.
      if (/trop court/.test((e as Error).message)) throw new FinalError((e as Error).message);
      throw e;
    }
    await write({ status: "pret", error: null, attempts: claimed.attempts, leaseUntil: null, ...beat });
    return { id: claimed.id, outcome: "pret", beat };
  } catch (e) {
    const message = (e as Error).message.slice(0, 500);
    const final = e instanceof FinalError || claimed.attempts >= MAX_ATTEMPTS;
    await write({ status: final ? "echec" : "en-attente", error: message, attempts: claimed.attempts, leaseUntil: null }).catch((err) =>
      payload.logger.error(`[publicité] musique ${claimed.id} : état d'échec non écrit (${(err as Error).message})`),
    );
    return { id: claimed.id, outcome: final ? "echec" : "reessai", error: message };
  }
}
