import type { Payload } from "payload";

import type { Article } from "@/modules/editorial/lib/articles/check";
import { firstFreeSlot } from "@/modules/editorial/lib/articles/schedule";
import { attachFeaturedImage, buildDraftPayload, createDraft, parisDay, publishPost, setFeaturedImage, updateFields, uploadMedia, WpWriteError } from "@/modules/editorial/lib/articles/wp-write";

/**
 * LES ACTIONS QUI ÉCRIVENT DANS WORDPRESS (étape 6, 18/11/2026), toutes par
 * wp-write.ts (relire avant, écrire ce qui change, relire après) :
 *  - valider le texte : le brouillon est créé dans WordPress (relu par Charlie,
 *    à la date du jour), l'article passe « Image à faire » ;
 *  - déposer l'image : WebP 1200 × 630, texte alternatif, image principale ;
 *    l'article prend le premier créneau libre (mardi ou jeudi 9 h) : « Programmé » ;
 *  - publier ce qui est dû (cron des créneaux) : « Publié » ;
 *  - annuler une mise à jour : l'ancienne version revient.
 */

type Raw = Record<string, unknown>;
const COLL = "articles" as never;
const ctx = { fromWordPress: true };

export class ActionError extends Error {}

/** Le premier créneau libre (mardi ou jeudi 9 h) parmi les articles déjà programmés. */
async function nextSlot(payload: Payload, now: Date): Promise<string> {
  const taken = (await payload.find({ collection: COLL, where: { status: { equals: "programme" } }, pagination: false, depth: 0, overrideAccess: true, select: { scheduledAt: true } as never })).docs as unknown as Raw[];
  return firstFreeSlot(taken.map((t) => t.scheduledAt as string), now).toISOString();
}

const load = (payload: Payload, id: string | number) => payload.findByID({ collection: COLL, id, depth: 1, overrideAccess: true }) as unknown as Promise<Raw>;

/**
 * « Valider le texte » (19/11/2026) : le RELECTEUR est choisi par la direction (obligatoire), et
 * l'image principale doit être déposée, sauf « valider sans image » explicite.
 */
export async function validateText(payload: Payload, id: string | number, o: { reviewer?: string | null; withoutImage?: boolean } = {}, now = new Date()) {
  const a = await load(payload, id);
  if (!["a-relire", "a-verifier"].includes(String(a.status))) throw new ActionError("Seul un article « À relire » ou « À vérifier » peut être validé.");
  // « À vérifier » (19/11/2026) : souvent un brouillon déjà dans WordPress (importé), relu sur sa copie ACF.
  const inWp = Number(a.wpId) > 0 && Object.keys((a.acf as Raw) ?? {}).length > 0;
  const { wpPostToArticle } = await import("@/modules/editorial/lib/articles/writer/refresh");
  const draft = (inWp ? wpPostToArticle(a.acf as never, String(a.title ?? "")) : (a.draft as Article | undefined)) as Article | undefined;
  if (!draft?.title) throw new ActionError("Aucun article rédigé sur cette fiche.");
  const { reviewerId: idOf } = await import("@/modules/editorial/lib/articles/from-wp");
  const reviewerWpId = idOf(o.reviewer);
  const missing = [!reviewerWpId ? "choisissez le relecteur" : null, !Number(a.featuredMediaId) && !o.withoutImage ? "déposez l'image principale (ou validez sans image)" : null].filter(Boolean);
  if (missing.length) throw new ActionError(`Avant de valider : ${missing.join(" ; ")}.`);
  // Les erreurs bloquantes (marque, promesse commerciale) : corrigées avant de valider.
  const { blockingErrors } = await import("@/modules/editorial/lib/score/save");
  const blocking = blockingErrors(draft);
  if (blocking.length) throw new ActionError(`À corriger dans le texte avant de valider : ${blocking.slice(0, 4).join(" ; ")}${blocking.length > 4 ? ` (et ${blocking.length - 4} autre(s))` : ""}.`);
  // Anti-copie (étape 5) : pas de brouillon WordPress pour un texte trop proche d'un concurrent.
  const { copyCheck } = await import("@/modules/editorial/lib/competitors/run");
  const copy = await copyCheck(payload, "articles", inWp ? a : { ...a, acf: {}, draft });
  if (copy.blocked) throw new ActionError(copy.blocked);
  const day = parisDay(now);
  // Brouillon déjà dans WordPress : « relu par » et « relu le » s'y écrivent (le reste n'est pas touché).
  // Toute écriture du support dans WordPress met à jour `wpModified` : sinon l'enregistrement suivant
  // croirait à une modification faite ailleurs et refuserait d'écrire (19/11/2026).
  let wpModified = (a.wpModified as string | null) ?? null;
  const methode = { ...(((inWp ? (a.acf as Raw).methode : draft.methode) as Raw) ?? {}), relu_par: reviewerWpId, relu_le: day };
  if (inWp) {
    wpModified = (await updateFields(Number(a.wpId), { acf: { methode } }, null)).modifiedIso;
  }
  const themeNumber = a.theme && typeof a.theme === "object" ? Number((a.theme as Raw).number) : null;
  let wpId = Number(a.wpId) || null;
  let link = String(a.wpLink ?? "");
  // Un brouillon créé lors d'un essai précédent dont la relecture a échoué (numéro gardé, contenu
  // jamais vérifié) : on y réécrit l'article rédigé, et updateFields le relit et le vérifie.
  if (wpId && !inWp) {
    const full = buildDraftPayload(draft, { keyword: String(a.keyword ?? ""), themeNumber, reviewedOn: day, reviewerId: reviewerWpId });
    wpModified = (await updateFields(wpId, { acf: full.acf as Record<string, unknown>, title: full.title }, null)).modifiedIso;
  }
  if (!wpId) {
    const created = await createDraft(buildDraftPayload(draft, { keyword: String(a.keyword ?? ""), themeNumber, reviewedOn: day, reviewerId: reviewerWpId }), async (newId, newLink) => {
      await payload.update({ collection: COLL, id, overrideAccess: true, context: ctx, data: { wpId: newId, wpStatus: "draft", wpLink: newLink } as never });
    });
    wpId = created.id;
    link = created.link;
    wpModified = created.modifiedIso;
  }
  // L'image déposée pendant la relecture (19/11/2026) : posée maintenant, et l'article prend son créneau.
  const mediaId = Number(a.featuredMediaId) || null;
  if (mediaId) wpModified = (await attachFeaturedImage(wpId, mediaId)).modifiedIso;
  const scheduledAt = mediaId ? ((a.scheduledAt as string | null) ?? (await nextSlot(payload, now))) : null;
  await payload.update({
    collection: COLL,
    id,
    overrideAccess: true,
    context: ctx,
    data: {
      status: mediaId ? "programme" : "image",
      ...(mediaId ? { scheduledAt } : {}),
      // La copie ACF du support suit WordPress (« relu par » visible tout de suite, note juste).
      ...(inWp ? { acf: { ...(a.acf as Raw), methode } } : {}),
      wpId,
      wpStatus: "draft",
      wpLink: link,
      wpModified,
      reviewedBy: String(o.reviewer),
      reviewedOn: day,
      textValidatedAt: now.toISOString(),
    } as never,
  });
  const { scoreOne } = await import("@/modules/editorial/lib/score/run");
  await scoreOne(payload, "articles", id, now).catch(() => null);
  return { wpId, link, scheduledAt };
}

/**
 * L'image principale, créée par la direction dans Claude Design (prompt fourni par le support,
 * décision du 19/11/2026), puis déposée ici avec son texte alternatif et sa légende.
 * - Un WebP déjà conforme à la charte (1920 × 1080, moins de 200 Ko) part TEL QUEL ; sinon il est
 *   converti (WebP 1920 × 1080, qualité 82, métadonnées retirées sauf le copyright).
 * - Article « À relire » : l'image part dans la médiathèque WordPress ; « Valider le texte » la pose
 *   sur le brouillon et l'article prend directement son créneau.
 * - Article « Image à faire » : il prend ensuite le premier créneau libre (mardi ou jeudi 9 h).
 * - Article déjà publié : l'image est remplacée dans WordPress, l'article reste en ligne.
 */
export async function setImage(payload: Payload, id: string | number, file: { data: Uint8Array; name: string }, o: { alt?: string | null; caption?: string | null; now?: Date } = {}) {
  const now = o.now ?? new Date();
  const a = await load(payload, id);
  const live = ["publie", "a-rafraichir"].includes(String(a.status));
  // Pendant la relecture (19/11/2026) : l'image part dans la médiathèque et sera posée à la validation du texte.
  const reviewing = a.status === "a-relire" || a.status === "a-verifier";
  if (!live && !reviewing && !["image", "pret", "programme"].includes(String(a.status))) throw new ActionError("L'image se dépose une fois l'article rédigé.");
  const wpId = Number(a.wpId);
  if (!wpId && !reviewing) throw new ActionError("L'article n'a pas encore de brouillon dans WordPress.");
  const alt = String(o.alt ?? "").trim();
  if (!alt) throw new ActionError("Le texte alternatif est obligatoire (celui que donne Claude Design).");
  if (alt.length > 125) throw new ActionError("Texte alternatif trop long : 125 caractères au plus.");
  if (/\b(ia|intelligence artificielle|g[ée]n[ée]r[ée]e? par|claude|chatgpt|midjourney)\b/i.test(`${alt} ${o.caption ?? ""}`)) throw new ActionError("Aucune mention d'IA ou d'outil de génération dans le texte alternatif ni la légende.");
  const sharp = (await import("sharp")).default;
  const input = Buffer.from(file.data);
  const meta = await sharp(input).metadata();
  const ready = meta.format === "webp" && meta.width === 1920 && meta.height === 1080 && input.length < 200_000;
  const webp = ready ? input : await sharp(input).rotate().resize(1920, 1080, { fit: "cover", position: "attention" }).webp({ quality: 82 }).withExif({ IFD0: { Copyright: "TIM Management" } }).toBuffer();
  const { fileSlug, imageJsonLd } = await import("@/modules/editorial/lib/visual/charte");
  // Le nom donné par Claude Design s'il est propre (slug), sinon le slug du mot-clé.
  const given = file.name.toLowerCase().replace(/\.[a-z0-9]+$/, "");
  const fileName = `${/^[a-z0-9]+(-[a-z0-9]+)+$/.test(given) && given.length <= 60 ? given : fileSlug(String(a.keyword || a.wpFocusKeyword || ""), String(a.title ?? ""))}.webp`;
  const caption = String(o.caption ?? "").trim() || null;
  const upload = { data: new Uint8Array(webp), filename: fileName, mime: "image/webp" };
  const media = wpId ? await setFeaturedImage(wpId, upload, alt, caption ?? undefined) : await uploadMedia(upload, alt, caption ?? undefined);
  let scheduledAt = a.scheduledAt as string | null;
  if (!live && !reviewing && !scheduledAt) scheduledAt = await nextSlot(payload, now);
  await payload.update({
    collection: COLL,
    id,
    overrideAccess: true,
    context: ctx,
    data: {
      ...(live || reviewing ? {} : { status: "programme", scheduledAt }),
      ...("modifiedIso" in media ? { wpModified: media.modifiedIso } : {}),
      featuredMediaId: media.mediaId,
      featuredImageUrl: media.url,
      imageAlt: alt,
      imageMime: "image/webp",
      imageWidth: 1920,
      imageBytes: webp.length,
      imageFile: fileName,
      visualFile: fileName,
      visualAlt: alt,
      visualCaption: caption,
      visualJsonLd: imageJsonLd({ contentUrl: media.url, caption: caption ?? "", alt }),
    } as never,
  });
  // La note suit (image mesurée).
  const { scoreOne } = await import("@/modules/editorial/lib/score/run");
  await scoreOne(payload, "articles", id, now).catch(() => null);
  return { scheduledAt: live || reviewing ? null : scheduledAt, pendingValidation: reviewing, imageUrl: media.url, fileName, converted: !ready };
}

/**
 * « Publier maintenant » (19/11/2026) : la direction publie un article programmé sans attendre
 * son créneau. Le texte doit être validé et l'image posée (statut « Programmé »).
 */
export async function publishNow(payload: Payload, id: string | number, now = new Date()) {
  const a = await load(payload, id);
  if (a.status !== "programme") throw new ActionError("Seul un article programmé (texte validé, image posée) peut être publié.");
  const wpId = Number(a.wpId);
  if (!wpId) throw new ActionError("L'article n'a pas de brouillon dans WordPress.");
  const { link, modifiedIso } = await publishPost(wpId);
  await payload.update({ collection: COLL, id, overrideAccess: true, context: ctx, data: { status: "publie", wpStatus: "publish", wpLink: link, wpModified: modifiedIso, publishedAt: now.toISOString(), scheduledAt: null, writeErrors: null, backlinksPending: true } as never });
  return { link };
}

/** Le cron des créneaux : publie UN article programmé dont l'heure est passée. */
export async function publishDue(payload: Payload, now = new Date()): Promise<{ status: string; message?: string }> {
  const due = (
    await payload.find({ collection: COLL, where: { and: [{ status: { equals: "programme" } }, { scheduledAt: { less_than_equal: now.toISOString() } }] }, sort: "scheduledAt", limit: 1, depth: 0, overrideAccess: true })
  ).docs[0] as unknown as Raw | undefined;
  if (!due) return { status: "pas-encore" };
  try {
    const { link, modifiedIso } = await publishPost(Number(due.wpId));
    await payload.update({ collection: COLL, id: due.id as number, overrideAccess: true, context: ctx, data: { status: "publie", wpStatus: "publish", wpLink: link, wpModified: modifiedIso, publishedAt: now.toISOString(), writeErrors: null, backlinksPending: true } as never });
    return { status: "fait", message: `publié : ${String(due.title)} (${link})` };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await payload.update({ collection: COLL, id: due.id as number, overrideAccess: true, context: ctx, data: { writeErrors: `Publication du ${String(due.scheduledAt).slice(0, 16)} : ${message}` } as never });
    return { status: "echec", message };
  }
}

/** La dernière mise à jour automatique est annulée : sa mesure n'a plus de sens. */
function markLastUndone(a: Raw): unknown[] {
  const log = Array.isArray(a.changesLog) ? [...(a.changesLog as Raw[])] : [];
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].type === "maj-auto" && !log[i].verdict) {
      log[i] = { ...log[i], annulee: true };
      break;
    }
  }
  return log;
}

/** Annule la dernière mise à jour automatique : l'ancienne version revient dans WordPress. */
export async function undoUpdate(payload: Payload, id: string | number, motif: string, now = new Date()) {
  const a = await load(payload, id);
  const previous = a.previousAcf as Record<string, unknown> | null;
  if (!previous || !Object.keys(previous).length) throw new ActionError("Aucune ancienne version gardée pour cet article.");
  const keys = ["introduction", "contenu", "faq", "sources", "date_mise_a_jour", "resume_mise_a_jour"];
  const restore = Object.fromEntries(keys.filter((k) => k in previous).map((k) => [k, previous[k]]));
  let wpModified = (a.wpModified as string) ?? null;
  try {
    wpModified = (await updateFields(Number(a.wpId), { acf: restore }, wpModified)).modifiedIso;
  } catch (e) {
    if (e instanceof WpWriteError) throw new ActionError(e.message);
    throw e;
  }
  await payload.update({
    collection: COLL,
    id,
    overrideAccess: true,
    context: ctx,
    data: { previousAcf: null, wpModified, changesLog: markLastUndone(a), refreshState: "refusee", refreshDecidedAt: now.toISOString(), refreshDecisionNote: motif || "Mise à jour annulée par Charlie.", status: "publie" } as never,
  });
}
