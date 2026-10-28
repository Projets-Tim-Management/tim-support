/**
 * Capture d'écran vidéo (.mov, .mp4) → courte vidéo MP4 sans son, à jouer en
 * boucle à la place d'un GIF. DANS LE NAVIGATEUR, avec son encodeur matériel.
 *
 * POURQUOI PAS UN GIF. Un GIF n'a que 256 couleurs et ne sait pas qu'une image
 * ressemble à la précédente : chaque image est stockée entière. Une capture de
 * 20 s en 1200 px pesait 10 à 30 Mo, avec des aplats qui bavent. Une vidéo ne
 * stocke que ce qui CHANGE d'une image à l'autre — sur une capture d'écran,
 * presque rien — et garde toutes les couleurs : le même extrait tient en 1 à
 * 3 Mo, plus net.
 *
 * POURQUOI ICI. La conversion se fait sur l'ordinateur de celui qui dépose : le
 * serveur ne voit passer que la vidéo finale, déposée directement sur le CDN
 * comme n'importe quel média. La capture d'origine n'est jamais envoyée.
 *
 * LES DEUX FORMATS. On ramène la LARGEUR à 1200 px (jamais au-delà de
 * l'original) et la hauteur suit : une capture d'ordinateur reste en paysage,
 * une capture de l'app mobile reste en portrait — les deux formats de la doc.
 */

import { ArrayBufferTarget, Muxer } from "mp4-muxer";

import { keptDuration, sourceTimes, type Range } from "@/core/lib/video-trim";

export const LOOP_MAX_WIDTH = 1200;
/** 24 images/s : fluide pour un curseur qui bouge, sans rien coûter de plus sur un écran fixe. */
export const LOOP_FPS = 24;
/** Au-delà, ce n'est plus une démonstration mais un tutoriel : on refuse plutôt que de produire un fichier énorme. */
export const LOOP_MAX_SECONDS = 120;

export type LoopFormat = "ordinateur" | "mobile";
export type LoopResult = { blob: Blob; width: number; height: number; format: LoopFormat; seconds: number };

/** Une vidéo déposée est-elle à convertir ? (et non une image, ni un GIF) */
export const isVideoFile = (f: File): boolean =>
  f.type.startsWith("video/") || /\.(mov|mp4|m4v|webm)$/i.test(f.name);

/** Dimensions de sortie : 1200 px de large au plus, proportions gardées, nombres pairs (exigés par H.264). */
export function loopSize(srcW: number, srcH: number, maxW = LOOP_MAX_WIDTH): { width: number; height: number } {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const width = even(Math.min(maxW, srcW));
  return { width, height: even((srcH * width) / srcW) };
}

/**
 * Codecs essayés, du meilleur au plus répandu. Le niveau 5.1 est nécessaire
 * pour le portrait mobile (1200 × 2600 dépasse la taille d'image des niveaux
 * inférieurs).
 */
const CODECS = ["avc1.640033", "avc1.4d0033", "avc1.420033"];

/**
 * Qualité CONSTANTE quand le navigateur sait la faire (`quantizer`) : chaque
 * image reçoit la même netteté, et un écran immobile ne coûte presque rien.
 * Sinon, un débit cible proportionné à la surface.
 */
const QUANTIZER = 26;
const bitrateFor = (w: number, h: number) => Math.min(4_000_000, Math.round(w * h * LOOP_FPS * 0.045));

async function pickConfig(width: number, height: number): Promise<{ config: VideoEncoderConfig; quantizer: boolean }> {
  if (typeof VideoEncoder === "undefined") {
    throw new Error("Ce navigateur ne sait pas encoder de vidéo. Utilisez Chrome, Edge ou Safari à jour.");
  }
  for (const quantizer of [true, false]) {
    for (const codec of CODECS) {
      const config: VideoEncoderConfig = {
        codec,
        width,
        height,
        framerate: LOOP_FPS,
        avc: { format: "avc" },
        ...(quantizer ? { bitrateMode: "quantizer" as VideoEncoderBitrateMode } : { bitrate: bitrateFor(width, height) }),
      };
      const support = await VideoEncoder.isConfigSupported(config).catch(() => null);
      if (support?.supported) return { config, quantizer };
    }
  }
  throw new Error("Ce navigateur ne sait pas produire de vidéo MP4 à cette taille.");
}

/** Charge la vidéo et attend ses dimensions ; refuse ce que le navigateur ne sait pas lire. */
export async function load(file: File): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = URL.createObjectURL(file);
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () =>
      reject(new Error("Cette vidéo n'est pas lisible par le navigateur (format ou codec non pris en charge)."));
  });
  if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration)) {
    throw new Error("Cette vidéo n'a pas pu être lue (dimensions ou durée inconnues).");
  }
  return video;
}

/** Place la lecture à `t` secondes et attend l'image correspondante. */
export function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      video.removeEventListener("seeked", done);
      resolve();
    };
    // Un `seeked` qui ne vient pas (même position) ne doit pas bloquer la conversion.
    const timer = setTimeout(done, 2000);
    video.addEventListener("seeked", done);
    video.currentTime = t;
  });
}

/**
 * Convertit. `onProgress` reçoit une fraction entre 0 et 1.
 *
 * Image par image, en se plaçant à chaque instant voulu : c'est plus lent que
 * de lire la vidéo, mais ne dépend pas de l'onglet (un onglet en arrière-plan
 * ralentit la lecture et sauterait des images).
 */
export async function convertToLoop(
  file: File,
  onProgress?: (f: number) => void,
  /** Passages à garder (voir video-trim) ; absent = toute la vidéo. */
  keep?: Range[] | null,
): Promise<LoopResult> {
  const video = await load(file);
  try {
    const ranges = keep?.length ? keep : [{ start: 0, end: video.duration }];
    const seconds = keptDuration(ranges);
    if (seconds > LOOP_MAX_SECONDS) {
      throw new Error(
        `Vidéo trop longue (${Math.round(seconds)} s) : une démonstration tient en ${LOOP_MAX_SECONDS} s au plus. Retirez des passages avant de la convertir.`,
      );
    }
    const { width, height } = loopSize(video.videoWidth, video.videoHeight);
    const { config, quantizer } = await pickConfig(width, height);

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: "avc", width, height, frameRate: LOOP_FPS },
      // Index en tête de fichier : la lecture démarre avant la fin du téléchargement.
      fastStart: "in-memory",
    });
    let failure: Error | null = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => {
        failure = e instanceof Error ? e : new Error(String(e));
      },
    });
    encoder.configure(config);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Le navigateur n'a pas pu préparer la conversion.");
    ctx.imageSmoothingQuality = "high";

    // Les instants à encoder : ceux des passages gardés, recollés bout à bout.
    const times = sourceTimes(ranges, LOOP_FPS);
    if (!times.length) throw new Error("Tous les passages ont été retirés : il ne reste rien à convertir.");
    const frames = times.length;
    const step = 1_000_000 / LOOP_FPS;
    for (let i = 0; i < frames; i++) {
      if (failure) throw failure;
      await seek(video, Math.min(times[i], Math.max(0, video.duration - 0.001)));
      ctx.drawImage(video, 0, 0, width, height);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * step), duration: Math.round(step) });
      // Une image clé toutes les 2 s : la boucle repart proprement, le fichier reste léger.
      encoder.encode(frame, {
        keyFrame: i % (LOOP_FPS * 2) === 0,
        ...(quantizer ? { avc: { quantizer: QUANTIZER } } : {}),
      } as VideoEncoderEncodeOptions);
      frame.close();
      // L'encodeur a du retard : on l'attend plutôt que d'empiler les images en mémoire.
      while (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 5));
      onProgress?.((i + 1) / frames);
    }
    await encoder.flush();
    encoder.close();
    if (failure) throw failure;
    muxer.finalize();

    const blob = new Blob([muxer.target.buffer], { type: "video/mp4" });
    return { blob, width, height, format: height > width ? "mobile" : "ordinateur", seconds };
  } finally {
    URL.revokeObjectURL(video.src);
    video.removeAttribute("src");
    video.load();
  }
}

/**
 * Quelques IMAGES de la capture, pour que Claude voie ce qu'elle montre.
 *
 * Réparties au milieu de tranches égales (pas la toute première ni la toute
 * dernière image, souvent un écran de transition), réduites à 1000 px de large
 * (1 568 px de haut au plus) et en JPEG : une image coûte alors ~800 jetons en
 * paysage, ~1 500 en portrait mobile, pour la même lecture.
 */
export const FRAME_MAX_WIDTH = 1000;
const FRAME_QUALITY = 0.72;

/**
 * Hauteur maximale : Claude ramène de toute façon le grand côté d'une image à
 * 1 568 px. Au-delà, on paierait l'envoi d'un portrait mobile (1000 × 2166)
 * sans rien gagner à la lecture — et quinze d'entre eux frôleraient la limite
 * de taille d'une requête (4,5 Mo).
 */
export const FRAME_MAX_HEIGHT = 1568;

function canvasFor(srcW: number, srcH: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const scale = Math.min(1, FRAME_MAX_WIDTH / srcW, FRAME_MAX_HEIGHT / srcH);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(srcW * scale);
  canvas.height = Math.round(srcH * scale);
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Le navigateur n'a pas pu lire les images de la vidéo.");
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}

/** `n` images d'une vidéo, en data URL JPEG. */
export async function extractFrames(file: File, n: number): Promise<string[]> {
  const video = await load(file);
  try {
    const { canvas, ctx } = canvasFor(video.videoWidth, video.videoHeight);
    const out: string[] = [];
    for (let k = 0; k < n; k++) {
      await seek(video, (video.duration * (k + 0.5)) / n);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      out.push(canvas.toDataURL("image/jpeg", FRAME_QUALITY));
    }
    return out;
  } finally {
    URL.revokeObjectURL(video.src);
    video.removeAttribute("src");
    video.load();
  }
}

/** Une image (PNG, JPG, première image d'un GIF), dans le même format que les images de vidéo. */
export async function imageToFrame(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const { canvas, ctx } = canvasFor(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", FRAME_QUALITY);
  } finally {
    URL.revokeObjectURL(url);
  }
}
