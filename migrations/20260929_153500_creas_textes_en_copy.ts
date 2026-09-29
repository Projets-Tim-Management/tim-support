import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Le tableau de textes d'une créa s'appelait `texts` : sa table
 * `ad_creatives_texts` prenait le nom que Payload réserve à ses champs texte à
 * valeurs multiples, et toute lecture complète d'une créa échouait. Le champ
 * devient `copy`.
 *
 * RENOMMAGES seulement (table, enums, contraintes, index) : rien n'est détruit,
 * et le schéma d'arrivée est celui que Payload attend. Écrite à la main — le
 * générateur demandait, pour chaque objet, « créé ou renommé ? » sans terminal
 * pour répondre ; l'instantané JSON est celui de la migration précédente, noms
 * remplacés.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_ad_creatives_texts_kind" RENAME TO "enum_ad_creatives_copy_kind";
  ALTER TYPE "public"."enum_ad_creatives_texts_tone" RENAME TO "enum_ad_creatives_copy_tone";
  ALTER TYPE "public"."enum_ad_creatives_texts_status" RENAME TO "enum_ad_creatives_copy_status";
  ALTER TABLE "ad_creatives_texts" RENAME TO "ad_creatives_copy";
  ALTER TABLE "ad_creatives_copy" RENAME CONSTRAINT "ad_creatives_texts_pkey" TO "ad_creatives_copy_pkey";
  ALTER TABLE "ad_creatives_copy" RENAME CONSTRAINT "ad_creatives_texts_parent_id_fk" TO "ad_creatives_copy_parent_id_fk";
  ALTER INDEX "ad_creatives_texts_order_idx" RENAME TO "ad_creatives_copy_order_idx";
  ALTER INDEX "ad_creatives_texts_parent_id_idx" RENAME TO "ad_creatives_copy_parent_id_idx";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER INDEX "ad_creatives_copy_parent_id_idx" RENAME TO "ad_creatives_texts_parent_id_idx";
  ALTER INDEX "ad_creatives_copy_order_idx" RENAME TO "ad_creatives_texts_order_idx";
  ALTER TABLE "ad_creatives_copy" RENAME CONSTRAINT "ad_creatives_copy_parent_id_fk" TO "ad_creatives_texts_parent_id_fk";
  ALTER TABLE "ad_creatives_copy" RENAME CONSTRAINT "ad_creatives_copy_pkey" TO "ad_creatives_texts_pkey";
  ALTER TABLE "ad_creatives_copy" RENAME TO "ad_creatives_texts";
  ALTER TYPE "public"."enum_ad_creatives_copy_status" RENAME TO "enum_ad_creatives_texts_status";
  ALTER TYPE "public"."enum_ad_creatives_copy_tone" RENAME TO "enum_ad_creatives_texts_tone";
  ALTER TYPE "public"."enum_ad_creatives_copy_kind" RENAME TO "enum_ad_creatives_texts_kind";`)
}
