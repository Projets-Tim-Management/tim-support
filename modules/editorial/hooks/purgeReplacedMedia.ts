import { after } from "next/server";
import type { CollectionAfterChangeHook, Payload } from "payload";
import { sql } from "@payloadcms/db-postgres";

import { freeTextColumns, mediaForeignKeys } from "@/core/lib/media-catalog";
import { conditionCitee, conditionReferencee } from "@/core/lib/media-orphans";
import { featureMediaIds, replacedMediaIds } from "@/modules/editorial/lib/feature-media";

/**
 * À la PUBLICATION d'une feature : les visuels qu'elle n'utilise plus sont
 * supprimés — du CDN comme de la médiathèque.
 *
 * POURQUOI ICI, et pas seulement dans le balayage quotidien
 * (/api/cron/cleanup-media). Celui-ci compte l'historique des versions comme
 * un usage — à raison pour un brouillon en cours. Mais chaque enregistrement
 * d'une feature garde une version qui pointe vers l'ancien GIF : un visuel
 * remplacé restait donc « utilisé » pour toujours, et ne partait jamais.
 *
 * CE QUI PART. Un média qu'une version passée de CETTE feature utilisait et que
 * sa version publiée n'utilise plus — et seulement s'il ne sert nulle part
 * ailleurs :
 *  - ni dans une autre feature, publiée OU en brouillon ;
 *  - ni dans une autre collection (clés étrangères lues dans le catalogue de la
 *    base, comme le balayage — jamais une liste écrite à la main) ;
 *  - ni cité par son nom dans un texte libre.
 * Au moindre doute (catalogue illisible…), rien n'est supprimé.
 *
 * LE PRIX. Restaurer une ancienne version de la feature la rendra sans le
 * visuel supprimé. C'est assumé : c'est précisément ce que « ne sert plus à
 * rien » veut dire.
 *
 * APRÈS la réponse (`after`) : la publication n'attend pas le ménage, et un
 * échec du ménage ne la fait jamais échouer.
 */

/** Tables des features elles-mêmes (publiées et versions) : leur usage est lu par Payload, pas par le catalogue. */
const FEATURE_TABLE = /^_?features(_|$)/;

/** Les champs d'une feature qui portent des médias (voir featureMediaIds). */
const MEDIA_FIELDS = { thumbnail: true, doc: { mediaDoc: true } } as const;

export async function purgeReplacedFeatureMedia(payload: Payload, featureId: number | string): Promise<string[]> {
  const [current, versions] = await Promise.all([
    payload.findByID({ collection: "features", id: featureId, depth: 0, select: MEDIA_FIELDS, overrideAccess: true }),
    payload.findVersions({
      collection: "features",
      where: { parent: { equals: featureId } },
      depth: 0,
      limit: 500,
      pagination: false,
      overrideAccess: true,
    }),
  ]);
  let candidates = replacedMediaIds(
    current,
    versions.docs.map((v) => (v as { version?: unknown }).version),
  );
  if (!candidates.length) return [];

  // Les autres features, dans leur état publié ET dans leur dernier brouillon.
  const others = new Set<string>();
  const states = await Promise.all(
    [false, true].map((draft) =>
      payload.find({
        collection: "features",
        where: { id: { not_equals: featureId } },
        depth: 0,
        limit: 2000,
        pagination: false,
        draft,
        // Seuls les champs qui portent des médias : pas les textes riches de toutes les fiches.
        select: MEDIA_FIELDS,
        overrideAccess: true,
      }),
    ),
  );
  for (const res of states) for (const f of res.docs) for (const id of featureMediaIds(f)) others.add(id);
  candidates = candidates.filter((id) => !others.has(id));
  if (!candidates.length) return [];

  // Le reste de la base : clés étrangères vers `media` hors features, puis le
  // nom du fichier dans un texte libre.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (payload.db as any).drizzle;
  const ailleurs = (await mediaForeignKeys(db)).filter((r) => !FEATURE_TABLE.test(r.table));
  // Lève si la liste est vide : sans références, tout paraîtrait inutilisé.
  const reference = conditionReferencee(ailleurs);
  let cite: string | null = null;
  try {
    cite = conditionCitee((await freeTextColumns(db)).filter((r) => !FEATURE_TABLE.test(r.table)));
  } catch {
    // Le filet du texte libre est un complément : son absence n'arrête pas tout,
    // comme dans le balayage quotidien.
  }

  const ids = candidates.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return [];
  const libres = await db.execute(
    sql.raw(`select m.id, m.filename from media m
             where m.id in (${ids.join(",")})
               and not (${reference}${cite ? ` or ${cite}` : ""})`),
  );
  const rows = ((libres.rows ?? libres) as { id: number; filename: string }[]) ?? [];

  const supprimes: string[] = [];
  for (const m of rows) {
    try {
      // `payload.delete` retire AUSSI le fichier du CDN (hook de l'adaptateur).
      await payload.delete({ collection: "media", id: m.id, overrideAccess: true });
      supprimes.push(m.filename);
    } catch (err) {
      payload.logger.error(`[features] suppression du visuel « ${m.filename} » échouée : ${err}`);
    }
  }
  if (supprimes.length) {
    payload.logger.info(
      `[features] feature ${featureId} publiée : ${supprimes.length} visuel(s) remplacé(s) supprimé(s) — ${supprimes.join(", ")}.`,
    );
  }
  return supprimes;
}

export const purgeReplacedMedia: CollectionAfterChangeHook = ({ doc, req }) => {
  if (doc?._status !== "published") return doc;
  const payload = req.payload;
  try {
    after(() =>
      purgeReplacedFeatureMedia(payload, doc.id).catch((err) =>
        payload.logger.error(`[features] ménage des visuels de ${doc.id} échoué : ${err}`),
      ),
    );
  } catch {
    // Hors requête (script en ligne de commande) : pas de ménage, rien de grave.
  }
  return doc;
};
