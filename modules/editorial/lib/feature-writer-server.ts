import Anthropic from "@anthropic-ai/sdk";
import { betaJSONSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import {
  convertLexicalToMarkdown,
  convertMarkdownToLexical,
  editorConfigFactory,
} from "@payloadcms/richtext-lexical";
import type { Payload } from "payload";

import { claudeCostUsd, usdToEur, type Usage } from "@/core/lib/ai-pricing";
import { featureToImportJson, type FeatureSource } from "@/modules/editorial/import/featureExport";
import { mergeFeatureFromJson } from "@/modules/editorial/import/featureMerge";
import { AVAILABILITY_VALUES } from "@/modules/editorial/lib/availability";
import { isFeatureProfile, profileLabel } from "@/modules/editorial/lib/feature-profiles";
import {
  MAX_FRAMES,
  WRITER_MODEL,
  WRITER_SYSTEM,
  WRITTEN_FEATURE_SCHEMA,
  attachMedia,
  oneVideoPerPart,
  toImportJson,
  type Part,
  writerBrief,
  type WriteRequest,
  type WrittenFeature,
} from "@/modules/editorial/lib/feature-writer";

/**
 * Côté serveur de « Rédiger avec Claude » : l'appel à Claude, puis
 * l'enregistrement de la fiche validée.
 *
 * L'enregistrement réutilise l'import et la fusion existants : une fiche neuve
 * naît en BROUILLON, une mise à jour s'écrit en brouillon sans toucher à ce que
 * le JSON ne contient pas (voir featureMerge). Rien n'est publié tout seul.
 */

export class WriterError extends Error {}

const ids = (v: unknown): (number | string)[] =>
  (Array.isArray(v) ? v : []).filter((x): x is number | string => typeof x === "number" || typeof x === "string");

async function converters(payload: Payload) {
  const editorConfig = await editorConfigFactory.default({ config: payload.config });
  return {
    toRich: (markdown: string) => convertMarkdownToLexical({ editorConfig, markdown }),
    toMarkdown: (rich: unknown): string => {
      if (!rich || typeof rich !== "object") return "";
      try {
        return convertLexicalToMarkdown({ data: rich as never, editorConfig }).trim();
      } catch {
        return "";
      }
    },
  };
}

/** Deux fiches publiées comme modèles de ton — de la même section si possible. */
async function examples(
  payload: Payload,
  categoryIds: (number | string)[],
  exclude: number | string | null | undefined,
  toMarkdown: (rich: unknown) => string,
) {
  const notSelf = exclude != null ? [{ id: { not_equals: exclude } }] : [];
  const find = (extra: Record<string, unknown>[]) =>
    payload
      .find({
        collection: "features",
        where: { and: [{ _status: { equals: "published" } }, ...notSelf, ...extra] } as never,
        sort: "-updatedAt",
        limit: 2,
        depth: 0,
        overrideAccess: true,
      })
      .then((r) => r.docs as FeatureSource[]);
  let docs = categoryIds.length ? await find([{ categories: { in: categoryIds } }]) : [];
  if (docs.length < 2) docs = [...docs, ...(await find([]))].slice(0, 2);
  // Sans les images ni l'introduction : le ton et la forme suffisent, et chaque
  // mot envoyé se paie.
  return docs.map((d) => {
    const { title, shortDescription, parties } = featureToImportJson(d, toMarkdown);
    return { title, shortDescription, parties: parties.slice(0, 3) };
  });
}

async function names(payload: Payload, collection: "platforms" | "feature-categories", list: (number | string)[]) {
  if (!list.length) return [];
  const res = await payload.find({
    collection,
    where: { id: { in: list } },
    limit: list.length,
    depth: 0,
    overrideAccess: true,
  });
  return (res.docs as { name?: string; pathTitle?: string }[]).map((d) => d.pathTitle || d.name || "").filter(Boolean);
}

/**
 * L'appel à Claude lui-même — isolé pour être vérifiable seul. Sortie
 * structurée (le schéma de la fiche), consignes en cache, effort bas.
 */
export async function callWriter(
  content: Anthropic.Beta.BetaContentBlockParam[],
): Promise<{ feature: WrittenFeature; usage: Usage }> {
  const client = new Anthropic({ timeout: 120_000, maxRetries: 1 });
  const res = await client.beta.messages.parse({
    model: WRITER_MODEL,
    max_tokens: 16000,
    // Les consignes ne changent pas d'une fiche à l'autre : en cache.
    system: [{ type: "text", text: WRITER_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
    // Effort bas : des étapes courtes, pas une dissertation (choix de Charlie).
    output_config: { effort: "low", format: betaJSONSchemaOutputFormat(WRITTEN_FEATURE_SCHEMA) },
    // Un refus par erreur des filtres de sécurité est relancé sur un autre
    // modèle dans le même appel, plutôt que de laisser l'écran sans texte.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });

  const usage: Usage = {
    input: res.usage.input_tokens,
    output: res.usage.output_tokens,
    cacheRead: res.usage.cache_read_input_tokens ?? 0,
    cacheWrite: res.usage.cache_creation_input_tokens ?? 0,
  };
  if (res.stop_reason === "refusal") throw new WriterError("Claude a décliné cette rédaction : reformulez les indications.");
  if (res.stop_reason === "max_tokens") throw new WriterError("Réponse tronquée : réduisez le nombre d'étapes.");
  const feature = res.parsed_output as WrittenFeature | null;
  if (!feature) throw new WriterError("Réponse illisible : relancez la rédaction.");
  return { feature, usage };
}


/**
 * `existingParts` : combien de parties la fiche avait déjà (mise à jour). Les
 * suivantes sont NOUVELLES, et seules celles-là peuvent être retirées du
 * brouillon sans décaler la fusion, qui rapproche les parties par rang.
 */
type WriteResult = { feature: WrittenFeature; costEur: number; existingParts: number };

export async function writeFeature(payload: Payload, input: WriteRequest): Promise<WriteResult> {
  const { toMarkdown } = await converters(payload);
  const categoryIds = ids(input.categoryIds);
  // Lectures indépendantes : en parallèle, avant l'appel à Claude.
  const [current, platforms, sections, examplesDocs] = await Promise.all([
    input.mode === "update" && input.featureId != null
      ? payload
          .findByID({ collection: "features", id: input.featureId, depth: 0, draft: true, overrideAccess: true })
          .then((d) => featureToImportJson(d as FeatureSource, toMarkdown))
          .catch(() => null)
      : null,
    names(payload, "platforms", ids(input.platformIds)),
    names(payload, "feature-categories", categoryIds),
    examples(payload, categoryIds, input.featureId, toMarkdown),
  ]);
  if (input.mode === "update" && !current) throw new WriterError("Feature introuvable.");

  const steps = (input.steps ?? []).slice(0, MAX_FRAMES);
  // Au plus 15 images en tout, même si la fenêtre en envoyait plus.
  let budget = MAX_FRAMES;
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  steps.forEach((s, i) => {
    content.push({ type: "text", text: `Vidéo ${i + 1}${s.caption?.trim() ? ` — ${s.caption.trim()}` : ""} :` });
    for (const frame of s.frames ?? []) {
      if (budget <= 0) break;
      const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(frame);
      if (!m) continue;
      content.push({
        type: "image",
        source: { type: "base64", media_type: m[1] as "image/jpeg", data: m[2] },
      });
      budget -= 1;
    }
  });
  content.push({
    type: "text",
    text: writerBrief({
      mode: input.mode,
      notes: String(input.notes ?? ""),
      platforms,
      sections,
      profiles: (input.profiles ?? []).filter(isFeatureProfile).map(profileLabel),
      captions: steps.map((s) => s.caption ?? ""),
      examples: examplesDocs,
      current,
      previous: input.previous ?? undefined,
      instruction: input.instruction,
    }),
  });

  const { feature, usage } = await callWriter(content);
  const costEur = usdToEur(claudeCostUsd(WRITER_MODEL, usage));
  payload.logger.info(
    `[features] rédaction Claude (${input.mode}) : ${usage.input} jetons lus, ${usage.output} écrits, ` +
      `${costEur.toFixed(3)} €.`,
  );
  // Une vidéo par partie au plus, et seulement les vidéos réellement envoyées.
  const parties = oneVideoPerPart(feature.parties, steps.length);
  return { feature: { ...feature, parties }, costEur, existingParts: current?.parties.length ?? 0 };
}

export type ApplyRequest = {
  mode: "new" | "update";
  featureId?: number | string | null;
  feature: WrittenFeature;
  platformIds: (number | string)[];
  categoryIds: (number | string)[];
  profiles: string[];
  media: { part: number; mediaId: number | string }[];
};

/** Enregistre la fiche validée, EN BROUILLON. Rend son identifiant. */
export async function applyFeature(
  payload: Payload,
  user: unknown,
  input: ApplyRequest,
): Promise<number | string> {
  const { toRich } = await converters(payload);
  const json = toImportJson(input.feature);
  const classement = {
    platforms: ids(input.platformIds),
    categories: ids(input.categoryIds),
    profiles: (input.profiles ?? []).filter(isFeatureProfile),
  };

  let base: { doc?: unknown } = { doc: [] };
  if (input.mode === "update") {
    const found =
      input.featureId != null
        ? ((await payload
            .findByID({ collection: "features", id: input.featureId, depth: 0, draft: true, overrideAccess: true })
            .catch(() => null)) as { doc?: unknown } | null)
        : null;
    if (!found) throw new WriterError("Feature introuvable.");
    base = found;
  }

  // La même fusion que « Coller un JSON dans cette fiche » : seules les parties
  // écrites changent, leurs visuels restent ; puis les vidéos de ce parcours.
  const patch = mergeFeatureFromJson(base, json, toRich, AVAILABILITY_VALUES);
  const doc = attachMedia((patch.doc as Part[] | undefined) ?? [], input.media ?? []);
  const data = { ...patch, doc, ...classement };

  if (input.mode === "update" && input.featureId != null) {
    await payload.update({
      collection: "features",
      id: input.featureId,
      data: data as never,
      draft: true,
      overrideAccess: true,
      user: user as never,
    });
    return input.featureId;
  }
  const created = await payload.create({
    collection: "features",
    data: { availability: "disponible", ...data } as never,
    draft: true,
    overrideAccess: true,
    user: user as never,
  });
  return created.id;
}
