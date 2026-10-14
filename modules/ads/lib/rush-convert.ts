/**
 * La conversion d'un rush, partie pure (plan Publicité, §9 sexies, D1b) :
 * lire la fiche technique de ffprobe, écrire les commandes ffmpeg. Le
 * lancement (Vercel Sandbox) est ailleurs, pour que ceci se teste sans réseau.
 *
 * Le format de travail commun : MP4 H.264, 1080p au plus sur le grand côté
 * (1920 px), 30 images/s au plus, couleurs SDR, lecture progressive. C'est
 * ce que lit le montage (Remotion), sans surprise d'un téléphone à l'autre.
 */

export const MAX_SIDE = 1920;
export const MAX_FPS = 30;
export const KEYFRAMES = 6;
/** Un rush est un extrait : au-delà de 3 minutes, c'est un film à découper avant. */
export const MAX_DURATION_SEC = 180;

export type RushMeta = {
  durationSec: number | null;
  width: number;
  height: number;
  orientation: "vertical" | "horizontal" | "carre";
  fps: number | null;
  hasAudio: boolean;
  videoCodec: string | null;
  hdr: boolean;
};

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  color_transfer?: string;
  tags?: { rotate?: string };
  side_data_list?: { rotation?: number }[];
};
type Probe = { streams?: ProbeStream[]; format?: { duration?: string } };

const ratio = (s?: string): number | null => {
  if (!s) return null;
  const [a, b] = s.split("/").map(Number);
  return b ? Math.round((a / b) * 100) / 100 : Number.isFinite(a) && a > 0 ? a : null;
};

export const orientationOf = (w: number, h: number): RushMeta["orientation"] => (Math.abs(w - h) <= Math.max(w, h) * 0.02 ? "carre" : h > w ? "vertical" : "horizontal");

/**
 * La fiche technique d'une vidéo, à partir du JSON de ffprobe. Une vidéo de
 * l'iPhone tenue droite est souvent enregistrée couchée avec une rotation :
 * les dimensions sont rendues telles qu'on la VOIT. Pure.
 */
export function parseProbe(json: unknown): RushMeta {
  const p = (json ?? {}) as Probe;
  const v = p.streams?.find((s) => s.codec_type === "video");
  if (!v?.width || !v.height) throw new Error("Aucune piste vidéo lisible dans ce fichier.");
  const rotation = Number(v.side_data_list?.find((d) => d.rotation != null)?.rotation ?? v.tags?.rotate ?? 0);
  const turned = Math.abs(rotation) % 180 === 90;
  const width = turned ? v.height : v.width;
  const height = turned ? v.width : v.height;
  const duration = Number(p.format?.duration);
  return {
    durationSec: Number.isFinite(duration) && duration > 0 ? Math.round(duration * 100) / 100 : null,
    width,
    height,
    orientation: orientationOf(width, height),
    fps: ratio(v.avg_frame_rate) ?? ratio(v.r_frame_rate),
    hasAudio: Boolean(p.streams?.some((s) => s.codec_type === "audio")),
    videoCodec: v.codec_name ?? null,
    // HLG (iPhone) ou PQ : à ramener en SDR, sinon les couleurs sortent délavées.
    hdr: v.color_transfer === "arib-std-b67" || v.color_transfer === "smpte2084",
  };
}

/** La durée refusée, ou `null`. Pure. */
export const durationRefusal = (m: RushMeta): string | null =>
  m.durationSec != null && m.durationSec > MAX_DURATION_SEC ? `Vidéo trop longue (${Math.round(m.durationSec)} s) : un rush fait ${MAX_DURATION_SEC / 60} minutes au plus. Coupez-la avant de l'importer.` : null;

/** Le passage en SDR d'une vidéo HDR (tonemapping), avant tout le reste. */
const TONEMAP = "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv";

/** La chaîne de filtres vidéo : SDR si besoin, 1920 px au plus sur le grand côté, 30 i/s au plus. Pure. */
export function videoFilters(m: RushMeta, opts: { tonemap: boolean }): string {
  const f: string[] = [];
  if (m.hdr && opts.tonemap) f.push(TONEMAP);
  if (Math.max(m.width, m.height) > MAX_SIDE) {
    f.push(m.width >= m.height ? `scale=${MAX_SIDE}:-2` : `scale=-2:${MAX_SIDE}`);
  }
  if (m.fps != null && m.fps > MAX_FPS + 0.5) f.push(`fps=${MAX_FPS}`);
  f.push("format=yuv420p");
  return f.join(",");
}

/** Les arguments de ffmpeg pour la version de travail. Pure. */
export function transcodeArgs(input: string, output: string, m: RushMeta, opts: { tonemap: boolean }): string[] {
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    input,
    "-map",
    "0:v:0",
    ...(m.hasAudio ? ["-map", "0:a:0"] : []),
    "-vf",
    videoFilters(m, opts),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-profile:v",
    "high",
    ...(m.hasAudio ? ["-c:a", "aac", "-b:a", "128k"] : ["-an"]),
    "-movflags",
    "+faststart",
    output,
  ];
}

/** Les instants des images clés : répartis au milieu de chaque sixième de la vidéo. Pure. */
export function keyframeTimes(durationSec: number | null, n = KEYFRAMES): number[] {
  const d = durationSec && durationSec > 0 ? durationSec : 1;
  return Array.from({ length: n }, (_, i) => Math.round(((i + 0.5) * d * 100) / n) / 100);
}

/** Les arguments de ffmpeg pour une image extraite de la version de travail, 720 px sur le grand côté. Pure. */
export function stillArgs(input: string, output: string, atSec: number, m: Pick<RushMeta, "width" | "height">): string[] {
  const scale = m.width >= m.height ? "scale=720:-2" : "scale=-2:720";
  return ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(atSec), "-i", input, "-frames:v", "1", "-vf", scale, "-q:v", "3", output];
}
