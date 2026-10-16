import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

import { execSql, rowsOf } from "@/core/lib/raw-sql";

/**
 * Les étapes commerciales renvoyées à GA4 (plan de mesure, phase 2.2) : quand
 * une opportunité franchit « Démo programmée » puis « Gagnée », GA4 reçoit
 * `qualify_lead` puis `close_convert_lead` (valeur = CA payé, mensuel), par le
 * Measurement Protocol, rattachés à la visite d'origine — GA4 montre alors le
 * CA signé par source, campagne et page d'entrée.
 *
 * Le fonctionnement, en deux temps :
 *  1. au PASSAGE du statut, l'étape franchie est notée dans `ga4-sends` (une
 *     ligne par opportunité et par étape, unicité tenue par la base) — et
 *     seulement si la demande d'origine porte un identifiant GA4 : rien
 *     d'inventé, rien de rétroactif. Ce que devient la fiche ensuite (perdue,
 *     résiliée) n'y change rien ;
 *  2. l'envoi : réservé en une requête (une seule réservation à la fois ; une
 *     réservation de plus de 10 minutes est réputée abandonnée), envoyé, puis
 *     daté. Un échec est noté, la ligne repasse plus tard (attente croissante).
 *
 * Les règles voulues : jamais de conversion à 0 € (sans CA payé, la signature
 * attend, 14 jours au plus, puis part sans montant, ce que la ligne note) ;
 * `session_id` toujours, pas de `timestamp_micros` (GA4 ne l'accepte qu'à
 * moins de 72 h) ; rien ne part hors production (la base est partagée avec le
 * développement) ; l'enregistrement d'une opportunité n'est jamais bloqué.
 * Le Measurement Protocol répond 2xx même à un corps invalide : le format se
 * contrôle avec scripts/ga4-mp-debug.ts.
 */

export type Ga4Step = "qualify" | "close";
export const GA4_EVENTS: Record<Ga4Step, string> = { qualify: "qualify_lead", close: "close_convert_lead" };

/** Les statuts où l'étape « démo programmée » est franchie (« Résilié » non : il ne dit rien du chemin parcouru). */
export const QUALIFIED_STATUSES = ["demo-programmee", "attente-engagement", "en-test", "en-signature", "actif"] as const;
/** Au-delà, une signature sans CA payé part quand même, sans montant. */
export const CLOSE_VALUE_WAIT_DAYS = 14;
/** Une réservation plus vieille est réputée abandonnée (fonction coupée entre la réservation et l'envoi). */
export const CLAIM_TTL_MS = 10 * 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Les étapes que ce statut franchit. Pure. */
export function reachedSteps(status: string | null | undefined): Ga4Step[] {
  const s = status ?? "";
  const steps: Ga4Step[] = [];
  if (QUALIFIED_STATUSES.includes(s as (typeof QUALIFIED_STATUSES)[number])) steps.push("qualify");
  if (s === "actif") steps.push("close");
  return steps;
}

/** Ce que la demande d'origine dit de la visite. */
export type Ga4Lead = {
  gaClientId?: string | null;
  gaSessionId?: string | null;
  formId?: string | null;
  channel?: string | null;
  sourcePagePath?: string | null;
  landingPath?: string | null;
};

/** Le corps Measurement Protocol d'une étape, ou `null` sans identifiant GA4. Pure. */
export function ga4Body(step: Ga4Step, lead: Ga4Lead, value: number | null = null): Record<string, unknown> | null {
  if (!lead.gaClientId) return null;
  const params: Record<string, unknown> = { engagement_time_msec: 1 };
  if (lead.gaSessionId) params.session_id = lead.gaSessionId;
  if (lead.formId) params.form_id = lead.formId;
  if (lead.channel) params.channel = lead.channel;
  if (lead.sourcePagePath) params.source_page = lead.sourcePagePath;
  if (lead.landingPath) params.landing_page = lead.landingPath;
  if (step === "close" && value != null && value > 0) {
    params.value = value;
    params.currency = "EUR";
  }
  return { client_id: lead.gaClientId, events: [{ name: GA4_EVENTS[step], params }] };
}

export type Ga4Decision = { kind: "send"; value: number | null; note: string | null } | { kind: "wait"; nextTry: Date };

/** Que faire d'une étape notée : l'envoyer (avec quel montant), ou attendre le CA payé. Pure. */
export function decide(step: Ga4Step, reachedAt: Date, caPaye: number | null | undefined, now: Date): Ga4Decision {
  if (step === "qualify") return { kind: "send", value: null, note: null };
  const value = Number(caPaye ?? 0);
  if (value > 0) return { kind: "send", value: Math.round(value * 100) / 100, note: null };
  const deadline = reachedAt.getTime() + CLOSE_VALUE_WAIT_DAYS * DAY;
  if (now.getTime() >= deadline) return { kind: "send", value: null, note: `Envoyée sans montant : CA payé toujours vide ${CLOSE_VALUE_WAIT_DAYS} jours après le passage à Gagnée.` };
  return { kind: "wait", nextTry: new Date(Math.min(now.getTime() + HOUR, deadline)) };
}

/** L'attente avant de réessayer un envoi en échec : 15 min, 30 min, 1 h… plafonnée à 6 h. Pure. */
export const retryDelayMs = (attempts: number): number => Math.min(6 * HOUR, 15 * 60_000 * 2 ** Math.max(0, attempts - 1));

export type Ga4Env = Record<string, string | undefined>;
export type Ga4Deps = { fetch?: typeof fetch; env?: Ga4Env; now?: () => Date; timeoutMs?: number };

/** L'adresse d'envoi, ou `null` si les variables ne sont pas posées. Pure. */
export function ga4Url(env: Ga4Env, debug = false): string | null {
  const id = env.GA4_MEASUREMENT_ID?.trim();
  const secret = env.GA4_API_SECRET?.trim();
  if (!id || !secret) return null;
  const q = new URLSearchParams({ measurement_id: id, api_secret: secret });
  return `https://www.google-analytics.com/${debug ? "debug/mp/collect" : "mp/collect"}?${q.toString()}`;
}

/**
 * Les envois partent-ils d'ici ? Seulement en production, clés posées : la base
 * est partagée avec le développement, qui ne doit pas écrire dans la propriété
 * GA4 de production. `GA4_SEND_OUTSIDE_PRODUCTION=1` force (essai délibéré). Pure.
 */
export const ga4Enabled = (env: Ga4Env): boolean => Boolean(ga4Url(env)) && (env.VERCEL_ENV === "production" || env.GA4_SEND_OUTSIDE_PRODUCTION === "1");

export class Ga4NotConfigured extends Error {}

/** Envoie un corps à GA4. Lève sur une réponse non 2xx ; `debug` renvoie les messages de validation de GA4. */
export async function sendGa4(body: Record<string, unknown>, deps: Ga4Deps = {}, debug = false): Promise<unknown> {
  const url = ga4Url(deps.env ?? process.env, debug);
  if (!url) throw new Ga4NotConfigured("GA4 non configuré : GA4_MEASUREMENT_ID ou GA4_API_SECRET absent.");
  const res = await (deps.fetch ?? fetch)(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(deps.timeoutMs ?? 5000),
  });
  if (!res.ok) throw new Error(`GA4 a répondu ${res.status}.`);
  return debug ? res.json().catch(() => null) : null;
}

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const iso = (d: Date) => d.toISOString();

/**
 * Note les étapes franchies par une opportunité — seulement si sa demande
 * d'origine porte un identifiant GA4. Une étape déjà notée ne bouge pas.
 */
export async function recordReached(payload: Payload, clientId: number, steps: Ga4Step[], at: Date): Promise<void> {
  for (const step of steps) {
    await execSql(
      payload,
      sql`INSERT INTO "ga4_sends" ("client_id", "step", "reached_at", "attempts", "updated_at", "created_at")
          SELECT pc."id", ${step}::"enum_ga4_sends_step", ${iso(at)}::timestamptz, 0, now(), now()
          FROM "partner_clients" pc JOIN "form_submissions" fs ON fs."id" = pc."form_submission_id"
          WHERE pc."id" = ${clientId} AND fs."ga_client_id" IS NOT NULL AND fs."ga_client_id" <> ''
          ON CONFLICT ("client_id", "step") DO NOTHING`,
    );
  }
}

export type Ga4Outcome = { id: number; outcome: "envoyee" | "attente" | "deja" | "echec" | "inactif"; error?: string };

/**
 * Traite une étape notée : l'attend, ou la réserve, l'envoie et la date. Ne
 * lève jamais. En SQL direct : rien ici ne rejoue les hooks de l'opportunité.
 */
export async function processSend(payload: Payload, id: number, deps: Ga4Deps = {}): Promise<Ga4Outcome> {
  const env = deps.env ?? process.env;
  if (!ga4Enabled(env)) return { id, outcome: "inactif" };
  const now = (deps.now ?? (() => new Date()))();
  try {
    const [r] = rowsOf(
      await execSql(
        payload,
        sql`SELECT gs."step", gs."reached_at", gs."sent_at", gs."attempts", pc."ca_paye",
                   fs."ga_client_id", fs."ga_session_id", fs."form_id_snapshot", fs."channel", fs."source_page_path", fs."landing_path"
            FROM "ga4_sends" gs JOIN "partner_clients" pc ON pc."id" = gs."client_id" LEFT JOIN "form_submissions" fs ON fs."id" = pc."form_submission_id"
            WHERE gs."id" = ${id}`,
      ),
    ) as Row[];
    if (!r || r.sent_at) return { id, outcome: "deja" };
    const step = r.step as Ga4Step;
    const d = decide(step, new Date(String(r.reached_at)), r.ca_paye == null ? null : Number(r.ca_paye), now);
    if (d.kind === "wait") {
      await execSql(payload, sql`UPDATE "ga4_sends" SET "next_try_at" = ${iso(d.nextTry)}::timestamptz WHERE "id" = ${id}`);
      return { id, outcome: "attente" };
    }
    const lead: Ga4Lead = { gaClientId: str(r.ga_client_id), gaSessionId: str(r.ga_session_id), formId: str(r.form_id_snapshot), channel: str(r.channel), sourcePagePath: str(r.source_page_path), landingPath: str(r.landing_path) };
    const body = ga4Body(step, lead, d.value);
    if (!body) return { id, outcome: "deja" };
    // La réservation : une seule à la fois ; celle d'une fonction coupée en route expire.
    const stale = iso(new Date(now.getTime() - CLAIM_TTL_MS));
    const claimed = rowsOf(
      await execSql(
        payload,
        sql`UPDATE "ga4_sends" SET "claimed_at" = ${iso(now)}::timestamptz
            WHERE "id" = ${id} AND "sent_at" IS NULL AND ("claimed_at" IS NULL OR "claimed_at" < ${stale}::timestamptz) RETURNING "id"`,
      ),
    );
    if (!claimed.length) return { id, outcome: "deja" };
    try {
      await sendGa4(body, { ...deps, env });
    } catch (e) {
      const message = (e as Error).message.slice(0, 500);
      const attempts = Number(r.attempts ?? 0) + 1;
      // On ne libère que SA réservation, et la ligne repasse plus tard.
      await execSql(
        payload,
        sql`UPDATE "ga4_sends" SET "claimed_at" = NULL, "attempts" = ${attempts}, "error" = ${`Envoi en échec, repris automatiquement : ${message}`},
                "next_try_at" = ${iso(new Date(now.getTime() + retryDelayMs(attempts)))}::timestamptz
            WHERE "id" = ${id} AND "claimed_at" = ${iso(now)}::timestamptz`,
      ).catch(() => undefined);
      payload.logger.warn(`[ga4] envoi ${id} (${GA4_EVENTS[step]}) en échec : ${message}`);
      return { id, outcome: "echec", error: message };
    }
    // Parti : on le date, en une écriture. Un échec ici ne doit PAS libérer la réservation (l'étape repartirait) : on réessaie.
    for (let i = 0; i < 3; i++) {
      const ok = await execSql(
        payload,
        sql`UPDATE "ga4_sends" SET "sent_at" = ${iso(now)}::timestamptz, "value" = ${d.value}, "note" = ${d.note}, "error" = NULL, "claimed_at" = NULL WHERE "id" = ${id}`,
      )
        .then(() => true)
        .catch(() => false);
      if (ok) break;
    }
    return { id, outcome: "envoyee" };
  } catch (e) {
    const message = (e as Error).message.slice(0, 500);
    payload.logger.warn(`[ga4] envoi ${id} : ${message}`);
    return { id, outcome: "echec", error: message };
  }
}

/** Les étapes à traiter maintenant : pas encore parties, dont l'heure est venue, non réservées ; les plus anciennes d'abord. */
export async function pendingSends(payload: Payload, now: Date, limit = 50, clientId?: number): Promise<number[]> {
  const stale = iso(new Date(now.getTime() - CLAIM_TTL_MS));
  const rows = rowsOf(
    await execSql(
      payload,
      sql`SELECT "id" FROM "ga4_sends"
          WHERE "sent_at" IS NULL AND ("next_try_at" IS NULL OR "next_try_at" <= ${iso(now)}::timestamptz)
            AND ("claimed_at" IS NULL OR "claimed_at" < ${stale}::timestamptz)
            ${clientId != null ? sql`AND "client_id" = ${clientId}` : sql``}
          ORDER BY COALESCE("next_try_at", "reached_at") ASC, "id" ASC LIMIT ${limit}`,
    ),
  ) as Row[];
  return rows.map((r) => Number(r.id));
}

/** Après l'enregistrement d'une opportunité : note ses étapes franchies, puis envoie ce qui est dû. */
export async function handleClientChange(payload: Payload, clientId: number, steps: Ga4Step[], deps: Ga4Deps = {}): Promise<void> {
  const now = (deps.now ?? (() => new Date()))();
  try {
    if (steps.length) await recordReached(payload, clientId, steps, now);
    if (!ga4Enabled(deps.env ?? process.env)) return;
    for (const id of await pendingSends(payload, now, 5, clientId)) await processSend(payload, id, deps);
  } catch (e) {
    payload.logger.warn(`[ga4] opportunité ${clientId} : ${(e as Error).message}`);
  }
}

/** La reprise horaire : chaque étape due, une à une. Hors production, rien. */
export async function resumeGa4(payload: Payload, deps: Ga4Deps = {}): Promise<{ active: boolean; checked: number; sent: number; waiting: number; failed: number }> {
  if (!ga4Enabled(deps.env ?? process.env)) return { active: false, checked: 0, sent: 0, waiting: 0, failed: 0 };
  const ids = await pendingSends(payload, (deps.now ?? (() => new Date()))());
  const out = { active: true, checked: ids.length, sent: 0, waiting: 0, failed: 0 };
  for (const id of ids) {
    const r = await processSend(payload, id, deps);
    if (r.outcome === "envoyee") out.sent++;
    if (r.outcome === "attente") out.waiting++;
    if (r.outcome === "echec") out.failed++;
  }
  return out;
}
