import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

import { execSql, rowsOf } from "@/core/lib/raw-sql";

/**
 * Les étapes commerciales renvoyées à GA4 (plan de mesure, phase 2.2) : quand
 * une opportunité passe en « Démo programmée » puis en « Gagnée », GA4 reçoit
 * `qualify_lead` puis `close_convert_lead` (valeur = CA payé), rattachés par le
 * Measurement Protocol à la visite d'origine — GA4 montre alors le CA signé par
 * source, campagne et page d'entrée.
 *
 * Les règles, toutes voulues :
 *  - pas d'identifiant GA4 sur la demande d'origine (visiteur sans
 *    consentement, lead manuel, import) = pas d'envoi ; on n'en fabrique
 *    jamais. Les opportunités d'avant la mise en ligne n'en ont pas : rien de
 *    rétroactif ;
 *  - chaque étape part UNE fois (date d'envoi sur la fiche, réservée en une
 *    requête : le hook et la tâche de reprise ne peuvent pas envoyer deux fois) ;
 *  - une étape franchie compte : un lead passé directement à « Gagnée » envoie
 *    aussi `qualify_lead` ;
 *  - jamais de conversion à 0 € : sans CA payé, la signature attend (14 jours
 *    au plus), puis part sans montant, ce que la fiche note ;
 *  - `session_id` toujours, même tard, pas de `timestamp_micros` (GA4 n'accepte
 *    qu'un horodatage de moins de 72 h, et une signature vient souvent des
 *    semaines après la demande) ;
 *  - rien de tout ça ne bloque l'enregistrement d'une opportunité : un échec
 *    est noté sur la fiche (`ga4Error`) et repris par la tâche planifiée.
 */

export type Ga4Step = "qualify" | "close";
export const GA4_EVENTS: Record<Ga4Step, string> = { qualify: "qualify_lead", close: "close_convert_lead" };

/** Les statuts où l'étape « démo programmée » est franchie. */
export const QUALIFIED_STATUSES = ["demo-programmee", "attente-engagement", "en-test", "en-signature", "actif", "resilie"] as const;
/** Au-delà, une signature sans CA payé part quand même, sans montant. */
export const CLOSE_VALUE_WAIT_DAYS = 14;

/** Ce que la demande d'origine dit de la visite. */
export type Ga4Lead = {
  gaClientId?: string | null;
  gaSessionId?: string | null;
  formId?: string | null;
  channel?: string | null;
  sourcePagePath?: string | null;
  landingPath?: string | null;
};

/** Ce que l'opportunité dit de l'avancement. */
export type Ga4Client = {
  clientStatus?: string | null;
  caPaye?: number | null;
  ga4QualifySentAt?: string | Date | null;
  ga4CloseSentAt?: string | Date | null;
  ga4CloseWaitSince?: string | Date | null;
};

export type Ga4Due =
  | { step: "qualify" }
  | { step: "close"; value: number | null; note: string | null }
  /** La signature attend son CA payé ; `since` à poser s'il ne l'est pas encore. */
  | { step: "wait"; since: Date | null };

const time = (d: string | Date | null | undefined): number | null => (d ? new Date(d).getTime() : null);

/** Les étapes à envoyer maintenant pour cette opportunité, dans l'ordre. Pure. */
export function stepsDue(client: Ga4Client, lead: Ga4Lead | null, now: Date): Ga4Due[] {
  if (!lead?.gaClientId) return [];
  const out: Ga4Due[] = [];
  const status = client.clientStatus ?? "";
  if (QUALIFIED_STATUSES.includes(status as (typeof QUALIFIED_STATUSES)[number]) && !client.ga4QualifySentAt) out.push({ step: "qualify" });
  if (status === "actif" && !client.ga4CloseSentAt) {
    const value = Number(client.caPaye ?? 0);
    if (value > 0) out.push({ step: "close", value: Math.round(value * 100) / 100, note: null });
    else {
      const since = time(client.ga4CloseWaitSince);
      if (since != null && now.getTime() - since >= CLOSE_VALUE_WAIT_DAYS * 86_400_000)
        out.push({ step: "close", value: null, note: `Signature envoyée à GA4 sans montant : CA payé toujours vide ${CLOSE_VALUE_WAIT_DAYS} jours après le passage à Gagnée.` });
      else out.push({ step: "wait", since: since == null ? now : null });
    }
  }
  return out;
}

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

export type Ga4Env = Record<string, string | undefined>;
export type Ga4Deps = { fetch?: typeof fetch; env?: Ga4Env; now?: () => Date; timeoutMs?: number };

/** L'adresse d'envoi, ou `null` si les variables ne sont pas posées (rien ne part). Pure. */
export function ga4Url(env: Ga4Env, debug = false): string | null {
  const id = env.GA4_MEASUREMENT_ID?.trim();
  const secret = env.GA4_API_SECRET?.trim();
  if (!id || !secret) return null;
  const q = new URLSearchParams({ measurement_id: id, api_secret: secret });
  return `https://www.google-analytics.com/${debug ? "debug/mp/collect" : "mp/collect"}?${q.toString()}`;
}

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

/** L'opportunité et sa demande d'origine, telles que l'envoi les lit. */
async function load(payload: Payload, id: number): Promise<{ client: Ga4Client; lead: Ga4Lead | null } | null> {
  const rows = rowsOf(
    await execSql(
      payload,
      sql`SELECT pc."client_status", pc."ca_paye", pc."_status", pc."ga4_qualify_sent_at", pc."ga4_close_sent_at", pc."ga4_close_wait_since",
                 fs."ga_client_id", fs."ga_session_id", fs."form_id_snapshot", fs."channel", fs."source_page_path", fs."landing_path"
          FROM "partner_clients" pc LEFT JOIN "form_submissions" fs ON fs."id" = pc."form_submission_id"
          WHERE pc."id" = ${id}`,
    ),
  ) as Row[];
  const r = rows[0];
  if (!r || r._status === "draft") return null;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    client: {
      clientStatus: str(r.client_status),
      caPaye: r.ca_paye == null ? null : Number(r.ca_paye),
      ga4QualifySentAt: (r.ga4_qualify_sent_at as string | null) ?? null,
      ga4CloseSentAt: (r.ga4_close_sent_at as string | null) ?? null,
      ga4CloseWaitSince: (r.ga4_close_wait_since as string | null) ?? null,
    },
    lead: str(r.ga_client_id)
      ? { gaClientId: str(r.ga_client_id), gaSessionId: str(r.ga_session_id), formId: str(r.form_id_snapshot), channel: str(r.channel), sourcePagePath: str(r.source_page_path), landingPath: str(r.landing_path) }
      : null,
  };
}

const COLUMN: Record<Ga4Step, "ga4_qualify_sent_at" | "ga4_close_sent_at"> = { qualify: "ga4_qualify_sent_at", close: "ga4_close_sent_at" };

/** Réserve l'envoi d'une étape en UNE requête : `false` si elle est déjà partie (ou en cours ailleurs). */
async function claim(payload: Payload, id: number, step: Ga4Step, at: Date): Promise<boolean> {
  const col = sql.raw(`"${COLUMN[step]}"`);
  const rows = rowsOf(await execSql(payload, sql`UPDATE "partner_clients" SET ${col} = ${at.toISOString()}::timestamptz WHERE "id" = ${id} AND ${col} IS NULL RETURNING "id"`));
  return rows.length > 0;
}

async function release(payload: Payload, id: number, step: Ga4Step) {
  await execSql(payload, sql`UPDATE "partner_clients" SET ${sql.raw(`"${COLUMN[step]}"`)} = NULL WHERE "id" = ${id}`);
}

async function note(payload: Payload, id: number, message: string | null) {
  await execSql(payload, sql`UPDATE "partner_clients" SET "ga4_error" = ${message} WHERE "id" = ${id}`);
}

export type Ga4Outcome = { id: number; sent: Ga4Step[]; waiting: boolean; error: string | null };

/**
 * Envoie à GA4 les étapes dues d'une opportunité. Ne lève jamais : un échec
 * est noté sur la fiche (`ga4Error`), l'étape reste à envoyer et la tâche
 * planifiée la reprendra. Écrit en SQL direct pour ne pas rejouer les hooks de
 * la fiche (journal, parcours, séquences…).
 */
export async function processGa4Steps(payload: Payload, id: number, deps: Ga4Deps = {}): Promise<Ga4Outcome> {
  const now = (deps.now ?? (() => new Date()))();
  const out: Ga4Outcome = { id, sent: [], waiting: false, error: null };
  try {
    const found = await load(payload, id);
    if (!found) return out;
    for (const due of stepsDue(found.client, found.lead, now)) {
      if (due.step === "wait") {
        out.waiting = true;
        if (due.since) await execSql(payload, sql`UPDATE "partner_clients" SET "ga4_close_wait_since" = ${due.since.toISOString()}::timestamptz WHERE "id" = ${id} AND "ga4_close_wait_since" IS NULL`);
        continue;
      }
      const body = ga4Body(due.step, found.lead!, due.step === "close" ? due.value : null);
      if (!body || !(await claim(payload, id, due.step, now))) continue;
      try {
        await sendGa4(body, deps);
        out.sent.push(due.step);
        await note(payload, id, due.step === "close" ? due.note : null);
      } catch (e) {
        await release(payload, id, due.step);
        throw e;
      }
    }
  } catch (e) {
    out.error = (e as Error).message.slice(0, 500);
    // Pas configuré : rien à noter sur la fiche, ce n'est pas un échec de CETTE opportunité.
    if (!(e instanceof Ga4NotConfigured)) await note(payload, id, `Envoi à GA4 en échec, repris automatiquement : ${out.error}`).catch(() => undefined);
    payload.logger.warn(`[ga4] opportunité ${id} : ${out.error}`);
  }
  return out;
}

// Des constantes du code (jamais une saisie) : écrites telles quelles dans la requête.
const QUALIFIED_IN = sql.raw(QUALIFIED_STATUSES.map((s) => `'${s}'`).join(", "));

/**
 * Les opportunités à reprendre : leur demande porte un identifiant GA4 (donc
 * née après la mise en ligne — rien de rétroactif), une étape est franchie et
 * pas encore envoyée. Les plus anciennes d'abord.
 */
export async function pendingGa4(payload: Payload, limit = 50): Promise<number[]> {
  const rows = rowsOf(
    await execSql(
      payload,
      sql`SELECT pc."id" FROM "partner_clients" pc JOIN "form_submissions" fs ON fs."id" = pc."form_submission_id"
          WHERE fs."ga_client_id" IS NOT NULL AND fs."ga_client_id" <> '' AND pc."_status" IS DISTINCT FROM 'draft'
            AND ((pc."client_status"::text IN (${QUALIFIED_IN}) AND pc."ga4_qualify_sent_at" IS NULL)
              OR (pc."client_status"::text = 'actif' AND pc."ga4_close_sent_at" IS NULL))
          ORDER BY pc."updated_at" ASC LIMIT ${limit}`,
    ),
  ) as Row[];
  return rows.map((r) => Number(r.id));
}

/** La reprise : chaque opportunité en attente, une à une. */
export async function resumeGa4(payload: Payload, deps: Ga4Deps = {}): Promise<{ checked: number; sent: number; waiting: number; failed: number }> {
  const ids = await pendingGa4(payload);
  let sent = 0;
  let waiting = 0;
  let failed = 0;
  for (const id of ids) {
    const r = await processGa4Steps(payload, id, deps);
    sent += r.sent.length;
    if (r.waiting) waiting++;
    if (r.error) failed++;
  }
  return { checked: ids.length, sent, waiting, failed };
}
