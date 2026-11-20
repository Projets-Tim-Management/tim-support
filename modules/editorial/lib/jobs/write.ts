import type { Payload } from "payload";

import { runArticleModel, WRITER_MODEL } from "@/modules/editorial/lib/articles/writer/model";
import { WP_JOB_TYPE } from "@/modules/editorial/lib/articles/wp-client";
import { buildJobAcf, figuresFromAcf, type JobAcf } from "@/modules/editorial/lib/jobs/acf";
import { checkJobSheet } from "@/modules/editorial/lib/jobs/check";
import type { JobFigures } from "@/modules/editorial/lib/jobs/francetravail";
import { buildJobSheetPrompt, JOB_SHEET_MAX_TOKENS, parseJobSheetResponse, type JobSheetContent } from "@/modules/editorial/lib/jobs/prompt";
import { parisDay } from "@/modules/editorial/lib/articles/wp-write";

/**
 * ÉCRIRE UNE FICHE MÉTIER DANS WORDPRESS PAR LES CLÉS DES CHAMPS (18/11/2026).
 *
 * Défaut trouvé le 18/11/2026 : les fiches comparatives (plugin tim-api,
 * comparatif.php) ont aussi des champs nommés `certifications`, `faq` et
 * `sources`. Quand on écrit une fiche métier NEUVE par le NOM des champs,
 * WordPress (ACF) prend le premier champ de ce nom qu'il trouve — celui des
 * comparatifs — et les certifications et la FAQ disparaissent sans erreur
 * (16 fiches publiées du 25/09 au 17/11/2026). En écrivant par la CLÉ du champ
 * (`field_fm_cert`, `field_fm_faq`…), ACF prend le bon champ et répare aussi la
 * référence enregistrée sur la fiche. Toute écriture de fiche passe donc ici.
 */

/** Clés ACF des champs de premier niveau d'une fiche métier (tim-api, includes/fiche-metier.php). */
export const JOB_FIELD_KEYS: Record<string, string> = {
  certifications: "field_fm_cert",
  faq: "field_fm_faq",
};

/** Les champs ACF d'une fiche, avec les champs en conflit passés par leur CLÉ. Pur (testé). */
export function byFieldKey(acf: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(acf).map(([name, value]) => [JOB_FIELD_KEYS[name] ?? name, value]));
}

type Raw = Record<string, unknown>;

function config() {
  const url = process.env.VITRINE_WP_URL?.replace(/\/+$/, "");
  const user = process.env.VITRINE_WP_USER;
  const pass = process.env.VITRINE_WP_APP_PASSWORD;
  if (!url || !user || !pass) throw new Error("Accès WordPress de la vitrine non configuré.");
  return { url, auth: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` };
}

async function wp<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const { url, auth } = config();
  const res = await fetch(`${url}/wp-json/wp/v2/${path}`, { method, headers: { Authorization: auth, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: "no-store", signal: AbortSignal.timeout(60_000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`WordPress a répondu ${res.status} (${path}) : ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

export const readJob = (id: number) => wp<{ id: number; status: string; link: string; modified_gmt: string; title?: { raw?: string }; acf?: Raw | unknown[] }>("GET", `${WP_JOB_TYPE}/${id}?context=edit`);

/** Écrit des champs d'une fiche (par clé pour les champs en conflit), puis relit : les blocs doivent être là. */
export async function writeJobFields(id: number, acf: Partial<JobAcf> & Raw, expectedModifiedIso: string | null = null): Promise<{ previousAcf: Raw; modifiedIso: string }> {
  const before = await readJob(id);
  if (expectedModifiedIso && new Date(`${before.modified_gmt}Z`).toISOString() !== new Date(expectedModifiedIso).toISOString()) {
    throw new Error(`La fiche ${id} a été modifiée dans WordPress depuis sa dernière lecture : rien n'est écrit.`);
  }
  const previousAcf = before.acf && !Array.isArray(before.acf) ? (before.acf as Raw) : {};
  await wp("POST", `${WP_JOB_TYPE}/${id}`, { acf: byFieldKey(acf) });
  const after = await readJob(id);
  const now = after.acf && !Array.isArray(after.acf) ? (after.acf as Raw) : {};
  const missing: string[] = [];
  const cert = now.certifications as { items?: unknown } | undefined;
  if ("certifications" in acf && !(Array.isArray(cert?.items) && cert.items.length)) missing.push("certifications");
  const faq = now.faq as { items?: unknown } | undefined;
  if ("faq" in acf && !(Array.isArray(faq?.items) && faq.items.length)) missing.push("FAQ");
  if (missing.length) throw new Error(`Fiche ${id} écrite, mais ${missing.join(" et ")} absente(s) après relecture.`);
  return { previousAcf, modifiedIso: new Date(`${after.modified_gmt}Z`).toISOString() };
}

/** Le top 10 de google.fr sur « fiche métier <métier> », si DataForSEO est branché (sinon rien). */
async function jobSerpBrief(payload: Payload, metier: string, now?: Date) {
  const { isDataForSeoConfigured } = await import("@/modules/editorial/lib/competitors/dataforseo");
  if (!isDataForSeoConfigured()) return null;
  const { analyzeKeyword, writerBrief } = await import("@/modules/editorial/lib/competitors/run");
  const { analysisKeyword } = await import("@/modules/editorial/lib/competitors/content");
  const b = writerBrief(await analyzeKeyword(payload, analysisKeyword("job-sheets", { title: metier }), { now }).catch(() => null));
  return b ? { terms: b.terms, entities: b.entities, questions: b.questions, medianWords: b.medianWords, medianH2: b.medianH2 } : null;
}

/** Rédige une fiche à partir de ses chiffres (Opus 5.5), contrôle strict, une relance au plus. */
export async function generateJobSheet(payload: Payload, o: { metier: string; rome: string; categorie?: string | null; figures: JobFigures; now?: Date }): Promise<{ generated: JobSheetContent | null; errors: string[]; warnings: string[]; costEur: number }> {
  const serpBrief = await jobSerpBrief(payload, o.metier, o.now);
  const { system, user } = buildJobSheetPrompt({ metier: o.metier, rome: o.rome, categorie: o.categorie, figures: o.figures, serpBrief });
  const messages: { role: "user" | "assistant"; content: string }[] = [{ role: "user", content: user }];
  let cost = 0;
  let last: { generated: JobSheetContent | null; errors: string[]; warnings: string[] } = { generated: null, errors: [], warnings: [] };
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await runArticleModel(payload, { model: WRITER_MODEL, system, messages, maxTokens: JOB_SHEET_MAX_TOKENS, detail: `fiche métier « ${o.metier} »`, now: o.now });
    cost += r.costEur;
    if (r.stopReason === "max_tokens") throw new Error("Fiche tronquée (réponse trop longue).");
    let generated: JobSheetContent;
    try {
      generated = parseJobSheetResponse(r.text);
    } catch {
      last = { generated: null, errors: ["JSON invalide"], warnings: [] };
      messages.push({ role: "assistant", content: r.text }, { role: "user", content: "Ta réponse n'est pas un JSON valide. Renvoie la fiche complète, au même format JSON, sans rien d'autre." });
      continue;
    }
    const check = checkJobSheet(generated, o.figures);
    last = { generated, errors: check.errors, warnings: check.warnings };
    if (!check.errors.length) break;
    messages.push(
      { role: "assistant", content: r.text },
      { role: "user", content: `Ta fiche a échoué au contrôle automatique :\n${check.errors.slice(0, 40).map((e) => `- ${e}`).join("\n")}\n\nCorrige TOUS ces points et renvoie la fiche complète, au même format JSON. Tout nombre absent des chiffres France Travail fournis : supprime-le.` },
    );
  }
  return { ...last, costEur: cost };
}

/** Répare une fiche publiée sans certifications ni FAQ : régénère, contrôle, n'écrit QUE ces deux blocs. */
export async function repairJobSheet(payload: Payload, wpId: number, now = new Date()) {
  const post = await readJob(wpId);
  const acf = post.acf && !Array.isArray(post.acf) ? (post.acf as Raw) : {};
  const metier = String(post.title?.raw ?? "").trim();
  const rome = String(acf.rome ?? "").toUpperCase();
  const categorie = ((acf.informations_cles as Raw | undefined)?.categorie as string | undefined) ?? null;
  const figures = figuresFromAcf(acf as never);
  const out = await generateJobSheet(payload, { metier, rome, categorie, figures, now });
  if (!out.generated || out.errors.length) return { ok: false as const, metier, errors: out.errors, costEur: out.costEur };
  const full = buildJobAcf(out.generated, figures, { metier, rome, categorie: categorie ?? undefined, today: parisDay(now) });
  await writeJobFields(wpId, { certifications: full.certifications, faq: full.faq });
  return { ok: true as const, metier, costEur: out.costEur, warnings: out.warnings };
}
