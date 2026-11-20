import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_articles_visual_motif" AS ENUM('horloge', 'calendrier', 'feuille', 'pieces', 'barres', 'versus', 'meteo', 'route', 'bouclier', 'personnes', 'telephone', 'gantt', 'casque', 'photo', 'repas', 'caisse');
  ALTER TABLE "articles" ADD COLUMN "visual_motif" "enum_articles_visual_motif";
  ALTER TABLE "articles" ADD COLUMN "visual_italic" varchar;
  ALTER TABLE "articles" ADD COLUMN "visual_file" varchar;
  ALTER TABLE "articles" ADD COLUMN "visual_alt" varchar;
  ALTER TABLE "articles" ADD COLUMN "visual_caption" varchar;
  ALTER TABLE "articles" ADD COLUMN "visual_json_ld" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "articles" DROP COLUMN "visual_motif";
  ALTER TABLE "articles" DROP COLUMN "visual_italic";
  ALTER TABLE "articles" DROP COLUMN "visual_file";
  ALTER TABLE "articles" DROP COLUMN "visual_alt";
  ALTER TABLE "articles" DROP COLUMN "visual_caption";
  ALTER TABLE "articles" DROP COLUMN "visual_json_ld";
  DROP TYPE "public"."enum_articles_visual_motif";`)
}
