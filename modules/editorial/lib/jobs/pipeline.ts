import type { Payload } from "payload";

import { parisNow } from "@/modules/ads/agent/followup";
import { parisDay } from "@/modules/editorial/lib/articles/wp-write";
import { WP_JOB_TYPE } from "@/modules/editorial/lib/articles/wp-client";
import { buildJobAcf, buildJobSeoMeta, figuresFromAcf, jobSlug, refreshFiguresAcf } from "@/modules/editorial/lib/jobs/acf";
import { fetchJobFigures, isFtConfigured, type JobFigures } from "@/modules/editorial/lib/jobs/francetravail";
import type { JobSheetContent } from "@/modules/editorial/lib/jobs/prompt";
import { generateJobSheet, readJob, writeJobFields } from "@/modules/editorial/lib/jobs/write";

/**
 * L'AUTOMATISATION DES FICHES MÉTIER (étape 9, décisions de Charlie du 18/11/2026).
 *
 * - NOUVELLE FICHE (« À rédiger », décidée par l'équipe, 1 par semaine) : deux
 *   passages du cron (5 minutes au plus chacun) : chiffres France Travail +
 *   rédaction + contrôle strict ; puis écriture dans WordPress (par les CLÉS des
 *   champs en conflit, voir write.ts) et publication, SANS relecture.
 * - RAFRAÎCHISSEMENT ANNUEL : une fiche par jour au plus, celle dont les chiffres
 *   ont plus d'un an (date anniversaire de chaque fiche : jamais toutes en même
 *   temps). Les blocs chiffrés sont remplacés ; les anciens chiffres cités dans
 *   la définition, les points clés et la FAQ sont remplacés par les nouveaux ; un
 *   chiffre périmé qui resterait = rien n'est écrit, « À vérifier ». Un chiffre
 *   absent des nouvelles données garde son ancienne valeur (avertissement).
 */

type Raw = Record<string, unknown>;
const COLL = "job-sheets" as never;
const ctx = { fromWordPress: true };
const YEAR_MS = 365 * 86_400_000;
const LOCK_MS = 10 * 60_000;

/** Les variantes écrites d'un nombre (« 2 189 », « 2189 », espace fine ou insécable). Pure. */
export function numberForms(n: number): string[] {
  const groups = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "|");
  return [...new Set([groups.replace(/\|/g, " "), groups.replace(/\|/g, " "), groups.replace(/\|/g, " "), groups.replace(/\|/g, "")])];
}

/**
 * Remplace, dans un texte, chaque ancien chiffre par le nouveau (mêmes séparateurs de
 * milliers que la forme trouvée). Rend le texte et les anciens chiffres encore présents. Pure (testée).
 */
export function replaceFigures(text: string, pairs: [number, number][]): { text: string; stale: number[] } {
  let out = text;
  for (const [oldV, newV] of pairs) {
    if (oldV === newV) continue;
    for (const form of numberForms(oldV)) {
      const sep = form.match(/\D/)?.[0] ?? "";
      const replacement = sep ? String(newV).replace(/\B(?=(\d{3})+(?!\d))/g, sep) : String(newV);
      out = out.replace(new RegExp(`(?<![\\d.,])${form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\d])`, "g"), replacement);
    }
  }
  const stale = pairs.filter(([o, n]) => o !== n && numberForms(o).some((f) => new RegExp(`(?<![\\d.,])${f}(?![\\d])`).test(out))).map(([o]) => o);
  return { text: out, stale };
}

/** Fusionne les nouveaux chiffres avec les anciens : un chiffre absent garde l'ancienne valeur. Pure (testée). */
export function mergeFigures(old: JobFigures, fresh: JobFigures): { figures: JobFigures; kept: string[] } {
  const figures: JobFigures = { ...old };
  const kept: string[] = [];
  for (const key of Object.keys(old) as (keyof JobFigures)[]) {
    const v = fresh[key];
    if (v == null || v === "") kept.push(String(key));
  }
  for (const [k, v] of Object.entries(fresh)) if (v != null && v !== "") (figures as Raw)[k] = v;
  return { figures, kept: kept.filter((k) => k !== "date_donnees") };
}

/** Les textes rédigés d'une fiche (définition, points clés, FAQ) mis aux nouveaux chiffres. */
function refreshTexts(acf: Raw, pairs: [number, number][]): { acf: Raw; stale: number[] } {
  const stale = new Set<number>();
  const fix = (s: unknown) => {
    const r = replaceFigures(String(s ?? ""), pairs);
    r.stale.forEach((x) => stale.add(x));
    return r.text;
  };
  const out = structuredClone(acf);
  if (typeof out.definition === "string") out.definition = fix(out.definition);
  if (Array.isArray(out.points_cles)) out.points_cles = (out.points_cles as Raw[]).map((p) => ({ ...p, valeur: fix(p?.valeur) }));
  const faq = out.faq as Raw | undefined;
  if (faq && Array.isArray(faq.items)) out.faq = { ...faq, items: (faq.items as Raw[]).map((q) => ({ ...q, reponse: fix(q?.reponse) })) };
  return { acf: out, stale: [...stale] };
}

const numericPairs = (old: JobFigures, fresh: JobFigures): [number, number][] =>
  (Object.keys(fresh) as (keyof JobFigures)[]).filter((k) => typeof old[k] === "number" && typeof fresh[k] === "number").map((k) => [old[k] as number, fresh[k] as number]);

async function wpPost<T>(path: string, body: unknown): Promise<T> {
  const url = process.env.VITRINE_WP_URL?.replace(/\/+$/, "");
  const auth = `Basic ${Buffer.from(`${process.env.VITRINE_WP_USER}:${process.env.VITRINE_WP_APP_PASSWORD}`).toString("base64")}`;
  const res = await fetch(`${url}/wp-json/wp/v2/${path}`, { method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(60_000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`WordPress a répondu ${res.status} (${path}) : ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

// ── Nouvelle fiche ───────────────────────────────────────────────────────────

async function draftNewSheet(payload: Payload, s: Raw, now: Date) {
  const rome = String(s.rome ?? "");
  const { figures, errors } = await fetchJobFigures(rome, String(s.title ?? ""));
  if (!Object.values(figures).some((v) => v != null)) {
    return { status: "a-verifier", writeErrors: `Aucun chiffre France Travail pour le code ROME ${rome}${errors.length ? ` (${errors.map((e) => e.message).join(" ; ").slice(0, 300)})` : ""}.` };
  }
  const out = await generateJobSheet(payload, { metier: String(s.title), rome, figures, now });
  const base = { figures, writeCostEur: out.costEur, writeWarnings: out.warnings.length ? out.warnings.join("\n") : null };
  if (!out.generated || out.errors.length) return { ...base, status: "a-verifier", writeStage: "echec", writeErrors: `Le contrôle a bloqué la fiche après la relance :\n${out.errors.map((e) => `- ${e}`).join("\n")}`.slice(0, 8000) };
  // Anti-copie (étape 5) : une fiche publiée sans relecture ne reprend jamais une page concurrente.
  const { copyCheck } = await import("@/modules/editorial/lib/competitors/run");
  const acf = buildJobAcf(out.generated, figures, { metier: String(s.title), rome, today: parisDay(now) });
  const copy = await copyCheck(payload, "job-sheets", { title: s.title, acf });
  if (copy.blocked) return { ...base, status: "a-verifier", writeStage: "echec", writeErrors: copy.blocked };
  return { ...base, draft: out.generated, writeStage: "publication" };
}

async function publishNewSheet(s: Raw, now: Date) {
  const generated = s.draft as JobSheetContent;
  const figures = (s.figures ?? {}) as JobFigures;
  const metier = String(s.title);
  const acf = buildJobAcf(generated, figures, { metier, rome: String(s.rome), today: parisDay(now) });
  const seo = buildJobSeoMeta(generated, metier);
  // Créée vide, puis remplie par les CLÉS des champs en conflit, puis publiée et relue.
  const created = await wpPost<{ id: number }>(WP_JOB_TYPE, { title: metier, slug: jobSlug(metier), status: "draft", seo_meta: seo });
  await writeJobFields(created.id, acf as unknown as Raw);
  await wpPost(`${WP_JOB_TYPE}/${created.id}`, { status: "publish" });
  const back = await readJob(created.id);
  if (back.status !== "publish") throw new Error(`Fiche ${created.id} écrite, mais pas en ligne (${back.status}).`);
  return { status: "publiee", wpId: created.id, wpLink: `https://tim-management.co/fiche-metier/${jobSlug(metier)}`, wpStatus: "publish", publishedAt: now.toISOString(), figuresUpdatedAt: parisDay(now), writeStage: "termine", writeErrors: null };
}

// ── Rafraîchissement annuel des chiffres ─────────────────────────────────────

async function refreshFigures(s: Raw, now: Date) {
  const post = await readJob(Number(s.wpId));
  if (post.status !== "publish") return { figuresUpdatedAt: parisDay(now), writeErrors: `Fiche non publiée dans WordPress (${post.status}) : pas de rafraîchissement.` };
  const acf = post.acf && !Array.isArray(post.acf) ? (post.acf as Raw) : {};
  const old = figuresFromAcf(acf as never);
  const { figures: fresh, errors } = await fetchJobFigures(String(acf.rome ?? s.rome ?? ""), String(s.title ?? ""));
  if (!Object.values(fresh).some((v) => v != null)) return { writeErrors: `Rafraîchissement annuel : France Travail n'a rendu aucun chiffre${errors.length ? ` (${errors.map((e) => e.message).join(" ; ").slice(0, 300)})` : ""}. Nouvel essai demain.` };
  const { figures, kept } = mergeFigures(old, fresh);
  const day = parisDay(now);
  const withFigures = refreshFiguresAcf(acf, figures, day);
  const { acf: next, stale } = refreshTexts(withFigures, numericPairs(old, figures));
  if (stale.length) {
    return { status: "a-verifier", writeErrors: `Rafraîchissement annuel non écrit : ancien(s) chiffre(s) ${stale.join(", ")} encore cité(s) dans les textes sous une forme impossible à remplacer proprement.` };
  }
  const changed = JSON.stringify(next) !== JSON.stringify(acf);
  if (changed) {
    const fields: Raw = {};
    for (const k of ["derniere_mise_a_jour", "informations_cles", "statistiques", "salaires", "definition", "points_cles", "faq"]) if (k in next) fields[k] = next[k];
    const { previousAcf } = await writeJobFields(Number(s.wpId), fields);
    return { figures, figuresUpdatedAt: day, previousAcf, writeErrors: null, writeWarnings: kept.length ? `Chiffre(s) absent(s) des nouvelles données, ancienne valeur gardée : ${kept.join(", ")}.` : null };
  }
  return { figures, figuresUpdatedAt: day, writeErrors: null };
}

/** Un passage : faire avancer UNE fiche (publication, rédaction, ou rafraîchissement annuel). */
export async function runJobTick(payload: Payload, now = new Date()): Promise<{ status: string; message?: string }> {
  if (!isFtConfigured()) return { status: "pas-encore" };
  const t = now.toISOString();
  const unlocked = { or: [{ writeLockedUntil: { exists: false } }, { writeLockedUntil: { less_than: t } }] };
  const find = (where: Raw, sort: string) => payload.find({ collection: COLL, where: { and: [where, unlocked] } as never, sort, limit: 1, depth: 0, overrideAccess: true }).then((r) => r.docs[0] as unknown as Raw | undefined);
  const today = parisNow(now).date;
  const job =
    (await find({ and: [{ status: { equals: "redaction" } }, { writeStage: { equals: "publication" } }] }, "writeStartedAt")) ??
    (await find({ status: { equals: "a-rediger" } }, "proposedAt")) ??
    (await payload
      .find({ collection: COLL, where: { and: [{ status: { equals: "publiee" } }, { figuresUpdatedAt: { less_than: new Date(now.getTime() - YEAR_MS).toISOString() } }] }, limit: 50, depth: 0, overrideAccess: true, sort: "figuresUpdatedAt" })
      .then((r) => {
        // Une fiche par jour : si l'une a déjà été rafraîchie aujourd'hui, on attend demain.
        return r.docs[0] as unknown as Raw | undefined;
      }));
  if (!job) return { status: "pas-encore" };
  const refreshedToday = await payload.count({ collection: COLL, where: { and: [{ figuresUpdatedAt: { greater_than_equal: `${today}T00:00:00.000Z` } }, { publishedAt: { less_than: `${today}T00:00:00.000Z` } }] }, overrideAccess: true });
  const isRefresh = job.status === "publiee";
  if (isRefresh && refreshedToday.totalDocs > 0) return { status: "pas-encore" };

  await payload.update({ collection: COLL, id: job.id as number, overrideAccess: true, context: ctx, data: { writeLockedUntil: new Date(now.getTime() + LOCK_MS).toISOString(), ...(job.status === "a-rediger" ? { status: "redaction", writeStage: "redaction", writeStartedAt: t, writeAttempts: 0 } : {}) } as never });
  try {
    const data = job.status === "a-rediger" ? await draftNewSheet(payload, job, now) : job.writeStage === "publication" ? await publishNewSheet(job, now) : await refreshFigures(job, now);
    await payload.update({ collection: COLL, id: job.id as number, overrideAccess: true, context: ctx, data: { ...data, writeLockedUntil: null } as never });
    return { status: "fait", message: `fiche « ${String(job.title)} » : ${isRefresh ? "chiffres de l'année" : job.status === "a-rediger" ? "rédaction" : "publication"}` };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const attempts = Number(job.writeAttempts ?? 0) + 1;
    await payload.update({
      collection: COLL,
      id: job.id as number,
      overrideAccess: true,
      context: ctx,
      data: { writeLockedUntil: null, writeAttempts: attempts, writeErrors: message.slice(0, 4000), ...(attempts >= 2 && !isRefresh ? { status: "a-verifier", writeStage: "echec" } : {}) } as never,
    });
    return { status: "echec", message: `fiche « ${String(job.title)} » : ${message}` };
  }
}
