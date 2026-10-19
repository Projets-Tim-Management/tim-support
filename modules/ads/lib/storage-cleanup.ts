import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

import { execSql, rowsOf } from "@/core/lib/raw-sql";

/**
 * Le ménage du stockage des pubs (plan Publicité) : chaque fichier importé
 * puis remplacé, chaque ZIP laisse l'ancien fichier sur le stockage. Chaque
 * nuit, on retire :
 *   - les ZIP de téléchargement de plus de 24 h (ils ne servent qu'au clic) ;
 *   - les médias « Créa rendue » qu'aucune créa n'emploie plus, de plus de 7 jours ;
 *   - tout fichier « ads/ » de plus de 7 jours vers lequel plus rien ne pointe
 *     en base.
 * Les 7 jours évitent d'effacer un fichier qu'on vient de déposer et pas encore
 * enregistré.
 *
 * Garde-fou : si le ménage voulait retirer plus de la moitié des fichiers, il
 * s'arrête sans rien supprimer (une base mal lue ne vide pas le stockage).
 */

export const KEEP_DAYS = 7;
export const ZIP_HOURS = 24;
export const MAX_SHARE = 0.5;

/**
 * Les tables des pubs qui portent des adresses de fichiers (colonnes, JSON).
 * Les quatre dernières sont celles du moteur vidéo retiré le 19/10/2026 : tant
 * qu'elles existent en base, leurs fichiers comptent comme référencés (on ne
 * les efface pas par surprise) ; une fois supprimées, elles sont ignorées.
 */
const TABLES = ["ad_rushes", "ad_creatives", "ad_media", "ads_brand_kit", "ad_inspirations", "ad_elements", "ad_retouches", "ad_element_notes"] as const;

const BLOB_URL = /https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/[^\s"'\\)<>]+/gi;
/** Une adresse ramenée à une forme stable (encodage des accents et espaces). Pure. */
export const normUrl = (u: string): string => {
  try {
    return decodeURI(u).normalize("NFC");
  } catch {
    return u.normalize("NFC");
  }
};
/** Les adresses de fichiers contenues dans un texte (une ligne de base en JSON). Pure. */
export const urlsIn = (text: string): string[] => (text.match(BLOB_URL) ?? []).map(normUrl);

/** Les adresses vers lesquelles la base pointe encore, lues dans les tables qui existent. */
export async function referencedUrls(payload: Payload): Promise<Set<string>> {
  const all = new Set<string>();
  const existing = new Set(
    (rowsOf(
      await execSql(
        payload,
        sql`SELECT "table_name" AS t FROM "information_schema"."tables"
            WHERE "table_schema" = 'public' AND "table_name" IN (${sql.join(TABLES.map((t) => sql`${t}`), sql`, `)})`,
      ),
    ) as { t: string }[]).map((r) => r.t),
  );
  for (const table of TABLES) {
    if (!existing.has(table)) continue;
    const rows = rowsOf(await execSql(payload, sql`SELECT row_to_json(t)::text AS j FROM ${sql.raw(`"${table}"`)} t`)) as { j: string }[];
    for (const r of rows) for (const u of urlsIn(r.j)) all.add(u);
  }
  return all;
}

export type Blob = { url: string; pathname: string; size: number; uploadedAt: Date };
export type CleanupDeps = {
  now?: () => Date;
  list?: () => Promise<Blob[]>;
  del?: (urls: string[]) => Promise<void>;
  /** À blanc : on compte, on ne supprime rien. */
  dryRun?: boolean;
};

/** Ce que le ménage retirerait, d'après les fichiers et les références. Pure. */
export function plan(blobs: Blob[], referenced: Set<string>, now: Date): { zips: Blob[]; orphans: Blob[] } {
  const zipLimit = now.getTime() - ZIP_HOURS * 3_600_000;
  const keepLimit = now.getTime() - KEEP_DAYS * 86_400_000;
  const zips = blobs.filter((b) => b.pathname.startsWith("ads/zips/") && b.uploadedAt.getTime() < zipLimit);
  const orphans = blobs.filter((b) => !b.pathname.startsWith("ads/zips/") && b.uploadedAt.getTime() < keepLimit && !referenced.has(normUrl(b.url)));
  return { zips, orphans };
}

async function listAll(): Promise<Blob[]> {
  const { list } = await import("@vercel/blob");
  const out: Blob[] = [];
  let cursor: string | undefined;
  do {
    const r = await list({ prefix: "ads/", cursor, limit: 1000, token: process.env.BLOB_READ_WRITE_TOKEN });
    for (const b of r.blobs) out.push({ url: b.url, pathname: b.pathname, size: b.size, uploadedAt: new Date(b.uploadedAt) });
    cursor = r.cursor;
  } while (cursor);
  return out;
}

async function delAll(urls: string[]) {
  const { del } = await import("@vercel/blob");
  for (let i = 0; i < urls.length; i += 100) await del(urls.slice(i, i + 100), { token: process.env.BLOB_READ_WRITE_TOKEN });
}

export type CleanupReport = { affiches: number; zips: number; orphelins: number; octets: number; arrete: string | null };

/** Le ménage complet. Ne lève pas sur un fichier : le rapport dit ce qui a été fait. */
export async function cleanupAdsStorage(payload: Payload, deps: CleanupDeps = {}): Promise<CleanupReport> {
  const now = (deps.now ?? (() => new Date()))();
  const report: CleanupReport = { affiches: 0, zips: 0, orphelins: 0, octets: 0, arrete: null };

  // Tout est lu et planifié AVANT de supprimer quoi que ce soit, pour que le garde-fou couvre les deux étapes.
  const keepLimit = new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString();
  const old = rowsOf(
    await execSql(
      payload,
      sql`SELECT m."id", m."url" FROM "ad_media" m
          WHERE m."kind" = 'crea' AND m."created_at" < ${keepLimit}::timestamptz
            AND NOT EXISTS (SELECT 1 FROM "ad_creatives_assets" a WHERE a."media_id" = m."id")`,
    ),
  ) as { id: number; url: string | null }[];
  const blobs = await (deps.list ?? listAll)();
  const referenced = await referencedUrls(payload);

  // 1. Les médias « Créa rendue » qu'aucune créa n'emploie plus. Leur fiche pointe sur leur
  // fichier : il n'est donc pas compté parmi les orphelins, il part avec la fiche.
  const affiches = old;
  // 2. Les fichiers : ZIP périmés, et ce vers quoi plus rien ne pointe.
  const { zips, orphans } = plan(blobs, referenced, now);

  const pool = blobs.filter((b) => !b.pathname.startsWith("ads/zips/")).length;
  const removed = affiches.length + orphans.length;
  if (pool > 0 && removed > pool * MAX_SHARE) {
    report.arrete = `Ménage arrêté : ${removed} fichiers sur ${pool} seraient retirés (plus de la moitié). Rien n'a été supprimé — à vérifier.`;
    return report;
  }

  for (const m of affiches) {
    if (!deps.dryRun) await payload.delete({ collection: "ad-media", id: m.id, overrideAccess: true });
    report.affiches++;
  }
  const doomed = [...zips, ...orphans];
  if (!deps.dryRun && doomed.length) await (deps.del ?? delAll)(doomed.map((b) => b.url));
  report.zips = zips.length;
  report.orphelins = orphans.length;
  report.octets = doomed.reduce((t, b) => t + b.size, 0);
  return report;
}
