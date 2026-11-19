import type { Payload } from "payload";

import { parisNow } from "@/modules/ads/agent/followup";

/**
 * L'ORDONNANCEMENT DE LA RÉDACTION (étape 5, décisions de Charlie du 18/11/2026).
 *
 * - La rédaction démarre AUTOMATIQUEMENT quand Charlie valide une idée, avec deux
 *   limites : un article commencé par jour au plus (heure de Paris), et une pause
 *   dès que 4 articles attendent sa relecture (« À relire »).
 * - Une étape par passage du cron (toutes les 5 minutes, 5 minutes au plus par
 *   passage, limite de Vercel) : recherche des faits → préparation → rédaction
 *   et contrôle → (relance, une seule, si le contrôle a échoué) → « À relire »
 *   (ou « À vérifier » avec le motif).
 * - Un verrou de 10 minutes : deux passages ne traitent jamais le même article.
 * - Deux échecs d'une étape (erreur, réponse tronquée…) → « À vérifier » avec
 *   le motif : jamais de relance chaque jour d'un article qui échoue.
 * - Les MISES À JOUR d'articles en ligne (« À rafraîchir », décidées par l'équipe,
 *   sans relecture) passent par le même ordonnancement, avec leur propre quota
 *   (une commencée par jour) : recherche des faits → réécriture et écriture dans
 *   WordPress → « Publié » (ou « À vérifier »).
 * - Un nouvel article n'est écrit dans WordPress qu'à « Valider le texte » (étape 6).
 */

export const DAILY_STARTS = 1;
export const MAX_WAITING_REVIEW = 4;
export const LOCK_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 2;

export type WriteStage = "recherche" | "preparation" | "redaction" | "relance" | "maj";
export const STAGE_LABEL: Record<WriteStage, string> = { recherche: "recherche des faits", preparation: "préparation", redaction: "rédaction et contrôle", relance: "relance après contrôle", maj: "mise à jour et écriture dans WordPress" };
export type WriteMode = "article" | "maj";

export type BoardRow = {
  id: number | string;
  status?: string | null;
  writeStage?: string | null;
  writeLockedUntil?: string | null;
  writeStartedAt?: string | null;
  decidedAt?: string | null;
  createdAt?: string | null;
  writeMode?: string | null;
  refreshDecidedAt?: string | null;
};

export type Job = { id: number | string; start: boolean; mode: WriteMode };

const isStage = (s: unknown): s is WriteStage => s === "recherche" || s === "preparation" || s === "redaction" || s === "relance" || s === "maj";
const inProgress = (r: BoardRow) => (r.status === "redaction" || r.status === "a-rafraichir") && isStage(r.writeStage);

/** L'article à faire avancer à ce passage, ou null. Pure (testée). */
export function pickWritingJob(rows: BoardRow[], now: Date): Job | null {
  const t = now.getTime();
  const unlocked = (r: BoardRow) => !r.writeLockedUntil || Date.parse(r.writeLockedUntil) <= t;
  // D'abord, finir ce qui est commencé (le plus ancien d'abord).
  const running = rows.filter((r) => inProgress(r) && unlocked(r)).sort((a, b) => String(a.writeStartedAt ?? "").localeCompare(String(b.writeStartedAt ?? "")));
  if (running.length) return { id: running[0].id, start: false, mode: running[0].status === "a-rafraichir" ? "maj" : "article" };
  if (rows.some(inProgress)) return null; // un travail verrouillé est en cours
  const today = parisNow(now).date;
  const startedToday = (mode: WriteMode) => rows.filter((r) => r.writeStartedAt && (r.writeMode ?? "article") === mode && parisNow(new Date(r.writeStartedAt)).date === today).length;
  // Un nouvel article — dans les limites.
  if (startedToday("article") < DAILY_STARTS && rows.filter((r) => r.status === "a-relire").length < MAX_WAITING_REVIEW) {
    const next = rows.filter((r) => r.status === "validee").sort((a, b) => String(a.decidedAt ?? a.createdAt ?? "").localeCompare(String(b.decidedAt ?? b.createdAt ?? "")))[0];
    if (next) return { id: next.id, start: true, mode: "article" };
  }
  // Sinon, une mise à jour décidée par l'équipe (son propre quota).
  if (startedToday("maj") < DAILY_STARTS) {
    const next = rows.filter((r) => r.status === "a-rafraichir" && !isStage(r.writeStage)).sort((a, b) => String(a.refreshDecidedAt ?? "").localeCompare(String(b.refreshDecidedAt ?? "")))[0];
    if (next) return { id: next.id, start: true, mode: "maj" };
  }
  return null;
}

/** Ce que rend une étape : l'étape suivante (ou la fin), les champs à écrire, son coût. */
export type StageOutcome = {
  next: WriteStage | "a-relire" | "a-verifier" | "publie";
  data?: Record<string, unknown>;
  costEur?: number;
  /** Motif d'un « À vérifier » décidé par l'étape (contrôle échoué, faits insuffisants…). */
  reason?: string;
};
export type StageRunner = (payload: Payload, article: Record<string, unknown>, now: Date) => Promise<StageOutcome>;
export type Stages = Record<WriteStage, StageRunner>;

export type TickResult = { status: "fait" | "pas-encore" | "echec"; message?: string };

/** Un passage : choisir l'article, faire UNE étape, écrire le résultat. */
export async function runWritingTick(payload: Payload, stages: Stages, now = new Date()): Promise<TickResult> {
  const rows = (
    await payload.find({
      collection: "articles" as never,
      where: { status: { in: ["validee", "redaction", "a-relire", "a-rafraichir"] } },
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: { status: true, writeStage: true, writeLockedUntil: true, writeStartedAt: true, decidedAt: true, createdAt: true, writeMode: true, refreshDecidedAt: true } as never,
    })
  ).docs as unknown as BoardRow[];
  // Les débuts d'aujourd'hui comptent même si l'article n'est plus « en rédaction ».
  const startedToday = (
    await payload.find({
      collection: "articles" as never,
      where: { writeStartedAt: { greater_than: new Date(now.getTime() - 36 * 3_600_000).toISOString() } },
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: { writeStartedAt: true, writeMode: true } as never,
    })
  ).docs as unknown as BoardRow[];
  const seen = new Set(rows.map((r) => String(r.id)));
  const job = pickWritingJob([...rows, ...startedToday.filter((r) => !seen.has(String(r.id))).map((r) => ({ ...r, status: "autre" }))], now);
  if (!job) return { status: "pas-encore" };

  const lock = new Date(now.getTime() + LOCK_MS).toISOString();
  if (job.start) {
    await payload.update({
      collection: "articles" as never,
      id: job.id,
      overrideAccess: true,
      context: { fromWordPress: true },
      data: {
        ...(job.mode === "article" ? { status: "redaction" } : {}),
        writeMode: job.mode,
        writeStage: "recherche",
        writeAttempts: 0,
        writeStartedAt: now.toISOString(),
        writeFinishedAt: null,
        writeErrors: null,
        writeWarnings: null,
        writeCostEur: 0,
        writeLockedUntil: lock,
      } as never,
    });
  } else {
    await payload.update({ collection: "articles" as never, id: job.id, overrideAccess: true, context: { fromWordPress: true }, data: { writeLockedUntil: lock } as never });
  }
  const article = (await payload.findByID({ collection: "articles" as never, id: job.id, depth: 0, overrideAccess: true })) as unknown as Record<string, unknown>;
  const stage = article.writeStage as WriteStage;
  const cost = Number(article.writeCostEur ?? 0);
  try {
    const out = await stages[stage](payload, article, now);
    const done = out.next === "a-relire" || out.next === "a-verifier" || out.next === "publie";
    await payload.update({
      collection: "articles" as never,
      id: job.id,
      overrideAccess: true,
      context: { fromWordPress: true },
      data: {
        ...out.data,
        writeCostEur: Math.round((cost + (out.costEur ?? 0)) * 10_000) / 10_000,
        writeLockedUntil: null,
        writeAttempts: 0,
        ...(done ? { status: out.next, writeStage: out.next === "a-verifier" ? "echec" : "termine", writeFinishedAt: now.toISOString() } : { writeStage: out.next }),
        ...(out.reason ? { writeErrors: out.reason } : {}),
      } as never,
    });
    // Rédaction finie : la note SEO / GEO tout de suite (sinon elle n'arrivait qu'à la synchronisation suivante).
    if (done) {
      const { scoreOne } = await import("@/modules/editorial/lib/score/run");
      await scoreOne(payload, "articles", job.id as number, now).catch(() => null);
    }
    return { status: "fait", message: `article ${job.id} : ${STAGE_LABEL[stage]} → ${done ? out.next : STAGE_LABEL[out.next as WriteStage]}` };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const attempts = Number(article.writeAttempts ?? 0) + 1;
    const giveUp = attempts >= MAX_ATTEMPTS;
    await payload.update({
      collection: "articles" as never,
      id: job.id,
      overrideAccess: true,
      context: { fromWordPress: true },
      data: {
        writeAttempts: attempts,
        writeLockedUntil: null,
        writeErrors: `${STAGE_LABEL[stage]} : ${message}`.slice(0, 4000),
        ...(giveUp ? { status: "a-verifier", writeStage: "echec", writeFinishedAt: now.toISOString() } : {}),
      } as never,
    });
    return { status: "echec", message: `article ${job.id} : ${STAGE_LABEL[stage]} — ${message}${giveUp ? " (abandon après 2 essais : À vérifier)" : ""}` };
  }
}
