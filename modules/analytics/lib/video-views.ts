import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

import { execSql } from "@/core/lib/raw-sql";
import { CHANNELS, channelLabel } from "@/core/lib/channels";
import { delta, type Delta } from "@/modules/analytics/lib/growth";
import type { FunnelStep } from "@/modules/analytics/lib/pipeline";

/**
 * Les vues des vidéos de démonstration du site vitrine (brief « vues vidéo »,
 * 19/10/2026) : combien de lectures sont lancées, et jusqu'où elles vont.
 *
 * ANONYME ET AGRÉGÉ — c'est la condition de l'exemption de consentement de la
 * CNIL : un compteur par (vidéo, page, étape, jour, appareil, canal), et rien
 * d'autre. Ni IP, ni navigateur, ni heure. L'appareil et le canal ne sont que
 * des CATÉGORIES (« mobile », « sea ») : elles ne distinguent personne. On
 * compte des LECTURES, pas des personnes.
 *
 * Étapes (19/10/2026) : `affichage` (la vidéo est apparue à l'écran — donne le
 * taux de lancement), puis la lecture et sa progression, puis `cta` (clic sur
 * le bouton d'action qui accompagne la vidéo).
 */

export const ETAPES = ["affichage", "lecture", "25", "50", "75", "fin", "cta"] as const;
export type Etape = (typeof ETAPES)[number];

/** Les étapes de l'entonnoir de lecture, en part des lectures lancées. */
export const ETAPES_LECTURE = ["lecture", "25", "50", "75", "fin"] as const satisfies readonly Etape[];

export const ETAPE_LABELS: Record<Etape, string> = {
  affichage: "Affichages",
  lecture: "Lectures",
  "25": "25 %",
  "50": "50 %",
  "75": "75 %",
  fin: "Fin",
  cta: "Clics sur le bouton",
};

/** Catégorie d'appareil, déduite par la vitrine. Absente ou inconnue : « inconnu ». */
export const APPAREILS = ["mobile", "tablette", "ordinateur"] as const;
export const APPAREIL_LABELS: Record<string, string> = { mobile: "Mobile", tablette: "Tablette", ordinateur: "Ordinateur", inconnu: "Non précisé" };

/**
 * Canal de la visite : les canaux des formulaires (core/lib/channels.ts), plus
 * `direct`. Absent ou hors liste : « inconnu » — on ne perd pas une lecture
 * pour un libellé.
 */
export const CANAUX = [...CHANNELS.map((c) => c.value), "direct"] as const;
export const canalLabel = (v: string): string => channelLabel(v) ?? (v === "direct" ? "Accès direct" : "Non précisé");

export const INCONNU = "inconnu";

export type Vue = { videoId: string; etape: Etape; page: string; appareil: string; canal: string };

const VIDEO_ID = /^[a-z0-9-]{1,64}$/;
const PAGE = /^\/[a-z0-9/-]{0,200}$/;

/**
 * Le corps envoyé par le relais de la vitrine, validé. Pas de liste de vidéos
 * en dur : une nouvelle vidéo ne demande aucun déploiement de Support. Pure.
 */
export function parseVue(body: unknown): Vue | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const { video_id: videoId, etape, page } = b;
  if (typeof videoId !== "string" || !VIDEO_ID.test(videoId)) return null;
  if (typeof etape !== "string" || !(ETAPES as readonly string[]).includes(etape)) return null;
  if (typeof page !== "string" || !PAGE.test(page)) return null;
  const pick = (v: unknown, list: readonly string[]) => (typeof v === "string" && list.includes(v) ? v : INCONNU);
  return { videoId, etape: etape as Etape, page, appareil: pick(b.appareil, APPAREILS), canal: pick(b.canal, CANAUX) };
}

/**
 * Une nouvelle version d'une vidéo porte le même identifiant suffixé
 * (`planning-ouvriers-demo-v2`) : deux montages ne se mélangent pas, et se
 * comparent côte à côte. Pure.
 */
export function videoVersion(videoId: string): { base: string; version: number } {
  const m = /^(.*)-v(\d+)$/.exec(videoId);
  return m ? { base: m[1], version: Number(m[2]) } : { base: videoId, version: 1 };
}

const PARIS_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });

/** Le jour, au fuseau de Paris : « 2026-10-19 ». Pure. */
export const parisDay = (d: Date): string => PARIS_DAY.format(d);

/**
 * Plafond de débit SANS RIEN STOCKER : un compteur en mémoire par adresse,
 * sur une fenêtre fixe. Imparfait — chaque instance a sa mémoire — mais
 * suffisant pour qu'une boucle ne gonfle pas les compteurs. Purgé au fil de
 * l'eau : on ne garde jamais plus d'une heure d'adresses.
 */
export function createRateLimiter({ max, windowMs }: { max: number; windowMs: number }) {
  const hits = new Map<string, { count: number; start: number }>();
  let lastPurge = 0;
  return {
    /** Vrai si l'étape passe ; faux au-delà du plafond. */
    hit(key: string, now = Date.now()): boolean {
      if (now - lastPurge > windowMs) {
        for (const [k, v] of hits) if (now - v.start >= windowMs) hits.delete(k);
        lastPurge = now;
      }
      const cur = hits.get(key);
      if (!cur || now - cur.start >= windowMs) {
        hits.set(key, { count: 1, start: now });
        return true;
      }
      cur.count += 1;
      return cur.count <= max;
    },
    size: () => hits.size,
  };
}

/** L'adresse rendue méconnaissable pour un journal : « 92.184.x.x », « 2a01:cb08:x ». Pure. */
export function maskIp(ip: string | undefined): string {
  if (!ip) return "inconnue";
  if (ip.includes(":")) return `${ip.split(":").slice(0, 2).join(":")}:x`;
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.x.x` : "x";
}

/**
 * +1 sur le compteur du jour, en UNE requête : deux lectures simultanées ne
 * s'écrasent pas (un « lire puis écrire » par l'API Payload le ferait).
 * Noms de colonnes et d'enum : ceux des migrations 20261019_*_video_views*.
 */
export async function incrementVue(payload: Payload, v: Vue, now = new Date()): Promise<void> {
  await execSql(
    payload,
    sql`INSERT INTO "video_views" ("video_id", "page", "etape", "jour", "appareil", "canal", "nombre", "updated_at", "created_at")
        VALUES (${v.videoId}, ${v.page}, ${v.etape}::"enum_video_views_etape", ${parisDay(now)}, ${v.appareil}, ${v.canal}, 1, now(), now())
        ON CONFLICT ("video_id", "page", "etape", "jour", "appareil", "canal")
        DO UPDATE SET "nombre" = "video_views"."nombre" + 1, "updated_at" = now()`,
  );
}

/* ─── Le rapport ─────────────────────────────────────────────────────────── */

export type VueRow = { videoId: string; page: string; etape: string; jour: string; appareil?: string | null; canal?: string | null; nombre: number };

/** Une répartition (appareil, canal, page) : ce qu'on y lit, en lectures. */
export type Split = { key: string; label: string; lectures: number; fins: number; completion: number | null; cta: number };

export type VideoReport = {
  videoId: string;
  version: number;
  affichages: number;
  /** Lectures ÷ affichages, en % (null tant que la vitrine n'envoie pas l'affichage). */
  lancement: number | null;
  lectures: Delta;
  fins: number;
  cta: number;
  /** Clics ÷ lectures, en %. */
  ctaRate: number | null;
  /** Fins ÷ lectures, en % (null sans lecture). */
  completion: number | null;
  /** Le taux de la période précédente, pour comparer. */
  previousCompletion: number | null;
  funnel: FunnelStep[];
  pages: { page: string; kind: "produit" | "video"; lectures: number; fins: number }[];
  appareils: Split[];
  canaux: Split[];
};

export type VideosAnalytics = {
  days: string[];
  videos: VideoReport[];
  /** Lectures par jour et par vidéo, pour la courbe. */
  daily: ({ day: string } & Record<string, number | string>)[];
};

const STEP_COLORS: Record<Etape, string> = {
  affichage: "var(--tim-chart-6)",
  cta: "var(--tim-chart-7)",
  lecture: "var(--tim-chart-1)",
  "25": "var(--tim-chart-2)",
  "50": "var(--tim-chart-3)",
  "75": "var(--tim-chart-4)",
  fin: "var(--tim-chart-5)",
};

const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null);

/** Les `n` derniers jours (Paris), du plus ancien au plus récent. Pure. */
export function lastDays(n: number, now: Date): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(parisDay(new Date(now.getTime() - i * 86_400_000)));
  return [...new Set(out)];
}

/** Le rapport par vidéo sur `n` jours, comparé aux `n` jours d'avant. Pure. */
export function buildVideosAnalytics(rows: VueRow[], n: number, now: Date): VideosAnalytics {
  const days = lastDays(n, now);
  const from = days[0];
  const prevFrom = parisDay(new Date(now.getTime() - (2 * n - 1) * 86_400_000));
  const current = rows.filter((r) => r.jour >= from);
  const previous = rows.filter((r) => r.jour >= prevFrom && r.jour < from);
  const sum = (list: VueRow[], f: (r: VueRow) => boolean) => list.reduce((s, r) => (f(r) ? s + Number(r.nombre) : s), 0);

  const ids = [...new Set([...current, ...previous].map((r) => r.videoId))].sort();
  const videos = ids.map((id): VideoReport => {
    const mine = current.filter((r) => r.videoId === id);
    const before = previous.filter((r) => r.videoId === id);
    const by = (e: Etape) => sum(mine, (r) => r.etape === e);
    const lectures = by("lecture");
    const fins = by("fin");
    const prevLectures = sum(before, (r) => r.etape === "lecture");
    const funnel = ETAPES_LECTURE.map((e, i): FunnelStep => {
      const reached = by(e);
      const prev = i > 0 ? by(ETAPES_LECTURE[i - 1]) : null;
      return {
        key: e,
        label: ETAPE_LABELS[e],
        color: STEP_COLORS[e],
        reached,
        fromPrevious: prev == null ? null : (pct(reached, prev) ?? 0),
        fromStart: pct(reached, lectures) ?? 0,
      };
    });
    const pageKeys = [...new Set(mine.map((r) => r.page))].sort();
    const split = (keyOf: (r: VueRow) => string, labelOf: (k: string) => string): Split[] =>
      [...new Set(mine.map(keyOf))]
        .map((key) => {
          const l = sum(mine, (r) => keyOf(r) === key && r.etape === "lecture");
          const f = sum(mine, (r) => keyOf(r) === key && r.etape === "fin");
          return { key, label: labelOf(key), lectures: l, fins: f, completion: pct(f, l), cta: sum(mine, (r) => keyOf(r) === key && r.etape === "cta") };
        })
        .filter((x) => x.lectures > 0 || x.cta > 0)
        .sort((a, b) => b.lectures - a.lectures);
    const affichages = by("affichage");
    const cta = by("cta");
    return {
      videoId: id,
      version: videoVersion(id).version,
      affichages,
      lancement: pct(lectures, affichages),
      lectures: delta(lectures, prevLectures),
      fins,
      cta,
      ctaRate: pct(cta, lectures),
      completion: pct(fins, lectures),
      previousCompletion: pct(sum(before, (r) => r.etape === "fin"), prevLectures),
      funnel,
      pages: pageKeys
        .map((page) => ({
          page,
          kind: page.startsWith("/video/") ? ("video" as const) : ("produit" as const),
          lectures: sum(mine, (r) => r.page === page && r.etape === "lecture"),
          fins: sum(mine, (r) => r.page === page && r.etape === "fin"),
        }))
        .sort((a, b) => b.lectures - a.lectures),
      appareils: split((r) => r.appareil || INCONNU, (k) => APPAREIL_LABELS[k] ?? k),
      canaux: split((r) => r.canal || INCONNU, canalLabel),
    };
  });

  const daily = days.map((day) => {
    const point: { day: string } & Record<string, number | string> = { day };
    for (const id of ids) point[id] = sum(current, (r) => r.jour === day && r.videoId === id && r.etape === "lecture");
    return point;
  });
  return { days, videos, daily };
}
