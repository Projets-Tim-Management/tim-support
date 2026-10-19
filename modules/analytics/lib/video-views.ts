import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

import { execSql } from "@/core/lib/raw-sql";
import { delta, type Delta } from "@/modules/analytics/lib/growth";
import type { FunnelStep } from "@/modules/analytics/lib/pipeline";

/**
 * Les vues des vidéos de démonstration du site vitrine (brief « vues vidéo »,
 * 19/10/2026) : combien de lectures sont lancées, et jusqu'où elles vont.
 *
 * ANONYME ET AGRÉGÉ — c'est la condition de l'exemption de consentement de la
 * CNIL : un compteur par (vidéo, page, étape, jour), et rien d'autre. Ni IP,
 * ni navigateur, ni heure. On compte des LECTURES, pas des personnes.
 */

export const ETAPES = ["lecture", "25", "50", "75", "fin"] as const;
export type Etape = (typeof ETAPES)[number];

export const ETAPE_LABELS: Record<Etape, string> = {
  lecture: "Lectures",
  "25": "25 %",
  "50": "50 %",
  "75": "75 %",
  fin: "Fin",
};

export type Vue = { videoId: string; etape: Etape; page: string };

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
  return { videoId, etape: etape as Etape, page };
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
 * Noms de colonnes et d'enum : ceux de la migration 20261019_*_video_views.
 */
export async function incrementVue(payload: Payload, v: Vue, now = new Date()): Promise<void> {
  await execSql(
    payload,
    sql`INSERT INTO "video_views" ("video_id", "page", "etape", "jour", "nombre", "updated_at", "created_at")
        VALUES (${v.videoId}, ${v.page}, ${v.etape}::"enum_video_views_etape", ${parisDay(now)}, 1, now(), now())
        ON CONFLICT ("video_id", "page", "etape", "jour")
        DO UPDATE SET "nombre" = "video_views"."nombre" + 1, "updated_at" = now()`,
  );
}

/* ─── Le rapport ─────────────────────────────────────────────────────────── */

export type VueRow = { videoId: string; page: string; etape: string; jour: string; nombre: number };

export type VideoReport = {
  videoId: string;
  lectures: Delta;
  fins: number;
  /** Fins ÷ lectures, en % (null sans lecture). */
  completion: number | null;
  /** Le taux de la période précédente, pour comparer. */
  previousCompletion: number | null;
  funnel: FunnelStep[];
  pages: { page: string; kind: "produit" | "video"; lectures: number; fins: number }[];
};

export type VideosAnalytics = {
  days: string[];
  videos: VideoReport[];
  /** Lectures par jour et par vidéo, pour la courbe. */
  daily: ({ day: string } & Record<string, number | string>)[];
};

const STEP_COLORS: Record<Etape, string> = {
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
    const funnel = ETAPES.map((e, i): FunnelStep => {
      const reached = by(e);
      const prev = i > 0 ? by(ETAPES[i - 1]) : null;
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
    return {
      videoId: id,
      lectures: delta(lectures, prevLectures),
      fins,
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
    };
  });

  const daily = days.map((day) => {
    const point: { day: string } & Record<string, number | string> = { day };
    for (const id of ids) point[id] = sum(current, (r) => r.jour === day && r.videoId === id && r.etape === "lecture");
    return point;
  });
  return { days, videos, daily };
}
