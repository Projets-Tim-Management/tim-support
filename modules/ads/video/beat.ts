import { MAX_SHOT, MAX_TOTAL, MIN_SHOT, MIN_TOTAL, type Score } from "@/modules/ads/video/score";

/**
 * Le rythme d'une musique, et une partition calée dessus (plan Publicité,
 * §9 sexies, M). Tout est pur : l'échantillon audio arrive déjà décodé
 * (ffmpeg, dans une Sandbox), mono, en entiers 16 bits.
 *
 * L'analyse cherche ce qu'un monteur cherche à l'oreille : le tempo, où tombe
 * le premier temps, et le passage le plus porteur (souvent le refrain, pas
 * l'intro). Le calage déplace chaque coupe sur le temps le plus proche ; un
 * plan ne descend jamais sous sa durée minimale.
 */

export const BEAT_STATUSES = [
  { label: "En attente d'analyse", value: "en-attente" },
  { label: "Analyse en cours", value: "en-cours" },
  { label: "Analysée", value: "pret" },
  { label: "Échec de l'analyse", value: "echec" },
] as const;

export const ANALYSIS_RATE = 11_025;
const HOP = 256;
const WINDOW = 512;
export const MIN_BPM = 70;
export const MAX_BPM = 180;
/** Le passage retenu : de quoi couvrir la plus longue vidéo. */
export const SECTION_SEC = MAX_TOTAL;

export type Beat = {
  bpm: number;
  /** Le premier temps, en secondes depuis le début du morceau. */
  firstBeatSec: number;
  /** Le début du passage le plus porteur, posé sur un temps. */
  bestStartSec: number;
  durationSec: number;
  /** 0 à 1 : à quel point la pulsation ressort. Sous 0,15, le tempo est douteux. */
  confidence: number;
};

/** L'énergie de chaque trame, puis sa montée (l'attaque d'une note, d'un coup de caisse). */
function envelopes(pcm: Int16Array): { rms: Float64Array; onset: Float64Array } {
  const n = Math.max(0, Math.floor((pcm.length - WINDOW) / HOP) + 1);
  const rms = new Float64Array(n);
  const log = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (let j = 0; j < WINDOW; j++) {
      const v = pcm[i * HOP + j] / 32768;
      e += v * v;
    }
    rms[i] = Math.sqrt(e / WINDOW);
    log[i] = Math.log(1e-6 + e);
  }
  const raw = new Float64Array(n);
  for (let i = 1; i < n; i++) raw[i] = Math.max(0, log[i] - log[i - 1]);
  // Moins la moyenne locale (une seconde) : on garde les attaques qui dépassent, pas le niveau général.
  const fps = ANALYSIS_RATE / HOP;
  const half = Math.round(fps / 2);
  const onset = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < Math.min(n, half); i++) sum += raw[i];
  for (let i = 0; i < n; i++) {
    if (i + half < n) sum += raw[i + half];
    if (i - half - 1 >= 0) sum -= raw[i - half - 1];
    const width = Math.min(n - 1, i + half) - Math.max(0, i - half) + 1;
    onset[i] = Math.max(0, raw[i] - sum / width);
  }
  return { rms, onset };
}

const at = (a: Float64Array, x: number): number => {
  const i = Math.floor(x);
  if (i < 0 || i + 1 >= a.length) return 0;
  const f = x - i;
  return a[i] * (1 - f) + a[i + 1] * f;
};

function autocorr(onset: Float64Array, lag: number): number {
  let s = 0;
  for (let i = 0; i + lag + 1 < onset.length; i++) s += onset[i] * at(onset, i + lag);
  return s;
}

/** Le tempo, le premier temps et le meilleur passage d'un morceau décodé. Pure. */
export function analyseBeat(pcm: Int16Array): Beat {
  // Toujours échantillonné à ANALYSIS_RATE (le décodage de lib/music.ts le garantit) : les fenêtres d'analyse sont calées dessus.
  const durationSec = Math.round((pcm.length / ANALYSIS_RATE) * 100) / 100;
  const { rms, onset } = envelopes(pcm);
  const fps = ANALYSIS_RATE / HOP;
  if (onset.length < fps * 4) throw new Error("Morceau trop court pour en tirer un tempo (4 s au moins).");

  // Le tempo : la période où la montée d'énergie se répète le mieux, en préférant les tempos courants (~120).
  const scores: { bpm: number; s: number }[] = [];
  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += 0.5) {
    const lag = (60 / bpm) * fps;
    const s = autocorr(onset, lag) + 0.5 * autocorr(onset, 2 * lag);
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    scores.push({ bpm, s: s * prior });
  }
  const coarse = scores.reduce((a, b) => (b.s > a.s ? b : a));
  const mean = scores.reduce((t, x) => t + x.s, 0) / scores.length;
  const confidence = coarse.s > 0 ? Math.max(0, Math.min(1, 1 - mean / coarse.s)) : 0;
  // Puis au dixième près autour du pic, SANS la préférence : elle choisit l'octave, pas la valeur exacte.
  let best = { bpm: coarse.bpm, s: -1 };
  for (let bpm = coarse.bpm - 3; bpm <= coarse.bpm + 3; bpm += 0.1) {
    const lag = (60 / bpm) * fps;
    const s = autocorr(onset, lag) + 0.5 * autocorr(onset, 2 * lag) + 0.25 * autocorr(onset, 4 * lag);
    if (s > best.s) best = { bpm: Math.round(bpm * 10) / 10, s };
  }
  const period = (60 / best.bpm) * fps;

  // Le premier temps : le décalage qui fait tomber le plus d'attaques sur la grille.
  let phase = 0;
  let phaseScore = -1;
  for (let o = 0; o < period; o += 0.5) {
    let s = 0;
    for (let x = o; x < onset.length; x += period) s += at(onset, x);
    if (s > phaseScore) {
      phaseScore = s;
      phase = o;
    }
  }
  const firstBeatSec = phase / fps;

  // Le passage : la fenêtre de SECTION_SEC la plus forte, commencée sur un temps.
  const periodSec = 60 / best.bpm;
  const window = Math.round(SECTION_SEC * fps);
  const prefix = new Float64Array(rms.length + 1);
  for (let i = 0; i < rms.length; i++) prefix[i + 1] = prefix[i] + rms[i];
  let bestStartSec = firstBeatSec;
  let loudest = -1;
  for (let t = firstBeatSec; t * fps + Math.min(window, rms.length) <= rms.length + 0.5; t += periodSec) {
    const a = Math.round(t * fps);
    const b = Math.min(rms.length, a + window);
    const level = (prefix[b] - prefix[a]) / Math.max(1, b - a);
    if (level > loudest * 1.02) {
      loudest = level;
      bestStartSec = t;
    }
  }
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return { bpm: best.bpm, firstBeatSec: r2(firstBeatSec), bestStartSec: r2(bestStartSec), durationSec, confidence: r2(confidence) };
}

/**
 * Cale les coupes d'une partition sur les temps d'une musique qui démarre sur
 * un temps (bestStartSec) : chaque fin de plan va sur le temps SUIVANT (jamais
 * avant : un plan raccourci n'aurait plus le temps d'être lu — revue du
 * 16/10/2026),
 * sans qu'aucun plan ne passe sous MIN_SHOT ni au-dessus de MAX_SHOT, et sans
 * sortir de MIN_TOTAL–MAX_TOTAL. Un plan de rush garde son passage : sa vitesse
 * s'ajuste d'autant (le moteur la borne). Pure.
 */
export function beatAlign(score: Score, bpm: number): Score {
  const period = 60 / bpm;
  // Sous 0,4 s (tempo très rapide), on cale sur un temps sur deux : une coupe à chaque temps serait illisible.
  const grid = period < 0.4 ? period * 2 : period;
  // La partition garde tout ce qu'elle porte (sa base, notamment) ; seules les durées changent.
  const out: Score = { ...score, shots: [] };
  let cursor = 0;
  let planned = 0;
  score.shots.forEach((shot, i) => {
    planned += shot.seconds;
    const last = i === score.shots.length - 1;
    let end = Math.ceil(planned / grid - 1e-9) * grid;
    const min = cursor + MIN_SHOT;
    const max = cursor + MAX_SHOT;
    while (end < min - 1e-9) end += grid;
    while (end > max + 1e-9) end -= grid;
    if (end < min - 1e-9) end = min; // la grille ne tombe pas dans les bornes : la durée prime
    if (last) {
      while (end < MIN_TOTAL - 1e-9) end += grid;
      while (end > MAX_TOTAL + 1e-9) end -= grid;
      end = Math.min(Math.max(end, MIN_TOTAL, min), MAX_TOTAL);
    }
    out.shots.push({ ...shot, seconds: Math.round((end - cursor) * 1000) / 1000 });
    cursor = end;
  });
  return out;
}
