import type { Payload } from "payload";

import { checkBrand, checkPolicy, type Article } from "@/modules/editorial/lib/articles/check";
import { withChange } from "@/modules/editorial/lib/articles/changes";
import { updateFields } from "@/modules/editorial/lib/articles/wp-write";
import { wpPostToArticle } from "@/modules/editorial/lib/articles/writer/refresh";
import { writeJobFields } from "@/modules/editorial/lib/jobs/write";
import { scoreOne } from "@/modules/editorial/lib/score/run";

/**
 * L'ENREGISTREMENT DES MODIFICATIONS FAITES DANS LE TIROIR (étape 3, 19/11/2026).
 *
 * - Bloquant : marque mal écrite, promesse sur TIM Management, page de démo
 *   (le reste de la note avertit sans bloquer).
 * - Un contenu en ligne : SEULS les champs modifiés partent dans WordPress, par
 *   le module unique (relire avant — rien n'est écrit si WordPress a changé
 *   depuis la synchronisation —, écrire, relire après). Fiches : par les clés
 *   des champs en conflit (write.ts). L'ancienne version est gardée.
 * - Un article seulement rédigé (pas encore dans WordPress) : l'article rédigé
 *   est mis à jour dans le support.
 * Puis la note du contenu est recalculée.
 */

type Raw = Record<string, unknown>;
export class SaveError extends Error {}

export type ArticleEdits = { title?: string; seoTitle?: string; seoDescription?: string; keyword?: string; acf?: Raw };
export type JobEdits = { acf?: Raw };

const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});

/** Les erreurs qui empêchent l'enregistrement. Pure (testée). */
export function blockingErrors(article: Article): string[] {
  return [...checkBrand(article), ...checkPolicy(article, { sales: true }).errors.filter((e) => /Promesse|démo|démonstration/i.test(e))];
}

export async function saveArticleEdits(payload: Payload, id: number | string, edits: ArticleEdits) {
  const doc = (await payload.findByID({ collection: "articles" as never, id, depth: 0, overrideAccess: true })) as unknown as Raw;
  const inWp = Number(doc.wpId) > 0 && Object.keys(obj(doc.acf)).length > 0;
  const base = inWp ? obj(doc.acf) : obj(doc.draft);
  const acf = { ...base, ...obj(edits.acf) };
  const title = edits.title ?? String((inWp ? doc.title : base.title) ?? doc.title ?? "");
  const check = inWp ? wpPostToArticle(acf as never, title) : ({ ...(acf as Article), title } as Article);
  const blocking = blockingErrors(check);
  if (blocking.length) throw new SaveError(`Enregistrement refusé :\n${blocking.map((e) => `- ${e}`).join("\n")}`);
  // Anti-copie (étape 5) : refus si le texte reprend trop une page concurrente.
  const copy = await copyCheckOf(payload, "articles", { ...doc, title, keyword: edits.keyword ?? doc.keyword, acf: inWp ? acf : {}, draft: inWp ? doc.draft : acf });
  if (copy) throw new SaveError(`Enregistrement refusé :\n- ${copy}`);

  const seoTitle = edits.seoTitle ?? String((inWp ? doc.seoTitle : base.yoast_title) ?? "");
  const seoDescription = edits.seoDescription ?? String((inWp ? doc.seoDescription : base.yoast_description) ?? "");
  const keyword = edits.keyword ?? String(doc.keyword ?? doc.wpFocusKeyword ?? "");
  const seoChanged = edits.seoTitle != null || edits.seoDescription != null || edits.keyword != null;

  if (inWp) {
    const { previousAcf, modifiedIso } = await updateFields(
      Number(doc.wpId),
      {
        ...(edits.acf && Object.keys(edits.acf).length ? { acf: edits.acf } : {}),
        ...(seoChanged ? { seo_meta: { title: seoTitle, metadesc: seoDescription, focuskw: keyword } } : {}),
        ...(edits.title != null ? { title } : {}),
      },
      (doc.wpModified as string) ?? null,
    );
    await payload.update({
      collection: "articles" as never,
      id,
      overrideAccess: true,
      context: { fromWordPress: true },
      data: {
        title,
        seoTitle,
        seoDescription,
        keyword,
        wpFocusKeyword: keyword,
        acf,
        previousAcf,
        wpModified: modifiedIso,
        // Mesurée 4 semaines après (19/11/2026) ; un article pas encore en ligne n'est pas journalisé.
        ...(() => {
          const what = [edits.title != null ? "titre" : "", edits.seoTitle != null || edits.seoDescription != null ? "titre et description Google" : "", edits.keyword != null ? `mot-clé « ${keyword} »` : "", ...Object.keys(obj(edits.acf))].filter(Boolean).join(", ");
          const log = withChange(doc, edits.keyword != null && edits.keyword !== doc.keyword ? "mot-cle" : "tiroir", what || "modification", new Date());
          return log ? { changesLog: log } : {};
        })(),
      } as never,
    });
  } else {
    await payload.update({ collection: "articles" as never, id, overrideAccess: true, context: { fromWordPress: true }, data: { title, keyword, draft: { ...acf, title, yoast_title: seoTitle, yoast_description: seoDescription } } as never });
  }
  return rescore(payload, "articles", id);
}

/** Le motif de refus anti-copie, ou null. */
async function copyCheckOf(payload: Payload, kind: "articles" | "job-sheets", doc: Raw): Promise<string | null> {
  const { copyCheck } = await import("@/modules/editorial/lib/competitors/run");
  return (await copyCheck(payload, kind, doc)).blocked;
}

/** Après un enregistrement : la note, puis la couverture concurrents (depuis l'analyse existante, aucun appel). */
async function rescore(payload: Payload, kind: "articles" | "job-sheets", id: number | string) {
  const score = await scoreOne(payload, kind, id);
  const { findSnapshot, saveCoverage } = await import("@/modules/editorial/lib/competitors/run");
  const { analysisKeyword } = await import("@/modules/editorial/lib/competitors/content");
  const doc = (await payload.findByID({ collection: kind as never, id, depth: 0, overrideAccess: true })) as unknown as Raw;
  await saveCoverage(payload, kind, doc, await findSnapshot(payload, analysisKeyword(kind, doc))).catch(() => false);
  return score;
}

export async function saveJobEdits(payload: Payload, id: number | string, edits: JobEdits) {
  const doc = (await payload.findByID({ collection: "job-sheets" as never, id, depth: 0, overrideAccess: true })) as unknown as Raw;
  if (!Number(doc.wpId)) throw new SaveError("Cette fiche n'est pas encore dans WordPress.");
  const changed = obj(edits.acf);
  if (!Object.keys(changed).length) throw new SaveError("Aucune modification.");
  const acf = { ...obj(doc.acf), ...changed };
  const texts = [String(acf.definition ?? ""), ...(Array.isArray(acf.points_cles) ? (acf.points_cles as Raw[]).map((p) => String(p.valeur ?? "")) : []), ...(Array.isArray(obj(acf.faq).items) ? (obj(acf.faq).items as Raw[]).map((q) => `${q.question ?? ""} ${q.reponse ?? ""}`) : [])];
  const blocking = blockingErrors({ introduction: texts.map((t) => `<p>${t.replace(/</g, "&lt;")}</p>`).join("") } as Article);
  if (blocking.length) throw new SaveError(`Enregistrement refusé :\n${blocking.map((e) => `- ${e}`).join("\n")}`);
  const copy = await copyCheckOf(payload, "job-sheets", { ...doc, acf });
  if (copy) throw new SaveError(`Enregistrement refusé :\n- ${copy}`);
  const { previousAcf, modifiedIso } = await writeJobFields(Number(doc.wpId), changed, (doc.wpModified as string) ?? null);
  await payload.update({ collection: "job-sheets" as never, id, overrideAccess: true, data: { acf, previousAcf, wpModified: modifiedIso } as never });
  return rescore(payload, "job-sheets", id);
}
