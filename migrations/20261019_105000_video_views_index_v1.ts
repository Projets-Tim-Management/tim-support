import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Vues vidéo v2 — retire l'ancien index unique à quatre colonnes, gardé par
 * 20261019_103110_video_views_etapes tant que le code v1 comptait avec lui.
 * Le code v2 (en ligne) compte sur l'index à six colonnes ; l'ancien refusait
 * deux compteurs du même jour qui ne diffèrent que par l'appareil ou le canal.
 * Aucune donnée touchée.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS "videoId_page_etape_jour_idx";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "videoId_page_etape_jour_idx" ON "video_views" USING btree ("video_id","page","etape","jour");`)
}
