import { sql } from "@payloadcms/db-postgres";

import { COLONNES_TEXTE_LIBRE, type Reference } from "@/core/lib/media-orphans";

/**
 * Lecture du CATALOGUE de la base pour savoir où un média peut être utilisé —
 * partagée par le balayage quotidien (/api/cron/cleanup-media) et le ménage à
 * la publication d'une feature (hooks/purgeReplacedMedia).
 *
 * Une seule copie : ces requêtes décident d'une suppression définitive, deux
 * versions qui divergent finiraient par effacer un média encore affiché.
 * Séparé de media-orphans (pur, testé) parce qu'il parle à la base.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Drizzle = { execute: (query: any) => Promise<any> };

const rowsOf = (res: unknown): Reference[] =>
  ((res as { rows?: Reference[] })?.rows ?? (res as Reference[])) ?? [];

/** Toutes les colonnes qui pointent vers `media` (clés étrangères). */
export async function mediaForeignKeys(db: Drizzle): Promise<Reference[]> {
  return rowsOf(
    await db.execute(sql`
      select tc.table_name as table, kcu.column_name as column
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
      join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
      where tc.constraint_type = 'FOREIGN KEY' and ccu.table_name = 'media'`),
  );
}

/** Les colonnes de texte libre où le nom d'un fichier peut être cité (voir COLONNES_TEXTE_LIBRE). */
export async function freeTextColumns(db: Drizzle): Promise<Reference[]> {
  const noms = COLONNES_TEXTE_LIBRE.map((n) => `'${n}'`).join(",");
  return rowsOf(
    await db.execute(
      sql.raw(`select table_name as table, column_name as column
               from information_schema.columns
               where table_schema = 'public'
                 and data_type in ('text','character varying')
                 and column_name in (${noms})`),
    ),
  );
}
