/**
 * La vidéo regardée avant une demande de démo (vitrine, 19/10/2026) : la
 * vitrine retient pendant la visite — sans cookie ni stockage — quelle vidéo
 * a été regardée, jusqu'où, et si la demande a été ouverte depuis un bouton de
 * la vidéo. Rien ne part tant que la personne n'envoie pas le formulaire : ces
 * trois champs voyagent dans le bloc `attribution` de la demande.
 *
 * Absents = pas de vidéo regardée. Une valeur hors format est ignorée : on perd
 * la précision, jamais le lead. Pure.
 */

export const VIDEO_POURCENTAGES = ["0", "25", "50", "75", "100"] as const;
export type VideoPourcentage = (typeof VIDEO_POURCENTAGES)[number];

/** `fin` : écran de fin ; `pause` : pastille affichée à la pause. */
export const VIDEO_CTAS = ["fin", "pause"] as const;
export type VideoCta = (typeof VIDEO_CTAS)[number];

export const VIDEO_POURCENTAGE_LABELS: Record<VideoPourcentage, string> = {
  "0": "Pas lancée",
  "25": "Jusqu'à 25 %",
  "50": "Jusqu'à 50 %",
  "75": "Jusqu'à 75 %",
  "100": "En entier",
};

export const VIDEO_CTA_LABELS: Record<VideoCta, string> = {
  fin: "Depuis l'écran de fin",
  pause: "Depuis la pause",
};

export type VideoLead = {
  videoId?: string;
  videoPourcentage?: VideoPourcentage;
  videoCta?: VideoCta;
};

const VIDEO_ID = /^[a-z0-9-]{1,64}$/;
const oneOf = <T extends string>(
  v: unknown,
  list: readonly T[],
): T | undefined =>
  typeof v === "string" && (list as readonly string[]).includes(v)
    ? (v as T)
    : undefined;

/** Les trois champs du bloc d'attribution, validés. Sans vidéo valide, rien du tout. */
export function parseVideoLead(a: Record<string, unknown>): VideoLead {
  const id = a.video_id ?? a.videoId;
  const videoId = typeof id === "string" && VIDEO_ID.test(id) ? id : undefined;
  if (!videoId) return {};
  const videoPourcentage = oneOf(
    a.video_pourcentage ?? a.videoPourcentage,
    VIDEO_POURCENTAGES,
  );
  const videoCta = oneOf(a.video_cta ?? a.videoCta, VIDEO_CTAS);
  return {
    videoId,
    ...(videoPourcentage ? { videoPourcentage } : {}),
    ...(videoCta ? { videoCta } : {}),
  };
}

/** Le nom parlé des vidéos connues ; une autre garde son identifiant. */
const VIDEO_NAMES: Record<string, string> = {
  "pointage-demo": "la démo pointage",
  "planning-ouvriers-demo": "la démo planning",
};

/** « la démo planning », « la démo planning (version 2) », « la vidéo nouvelle-demo ». Pure. */
export function videoName(videoId: string): string {
  const m = /^(.*)-v(\d+)$/.exec(videoId);
  const base = m ? m[1] : videoId;
  const name = VIDEO_NAMES[base] ?? `la vidéo ${base}`;
  return m && Number(m[2]) > 1 ? `${name} (version ${m[2]})` : name;
}

/**
 * La ligne de la fiche prospect : « A regardé la démo planning en entier —
 * demande ouverte depuis l'écran de fin ». Null sans vidéo. Pure.
 */
export function videoLeadLine(v: VideoLead): string | null {
  if (!v.videoId) return null;
  const name = videoName(v.videoId);
  const p = v.videoPourcentage;
  const watched =
    p === "100"
      ? `A regardé ${name} en entier`
      : p === "0"
        ? `A ouvert ${name} sans la lancer`
        : p
          ? `A regardé ${name} jusqu'à ${p} %`
          : `A regardé ${name}`;
  const from =
    v.videoCta === "fin"
      ? " — demande ouverte depuis l'écran de fin"
      : v.videoCta === "pause"
        ? " — demande ouverte depuis la pause"
        : "";
  return `${watched}${from}`;
}
