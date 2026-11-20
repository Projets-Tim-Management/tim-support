import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_articles_coverage_status" AS ENUM('analyse', 'insuffisant');
  CREATE TYPE "public"."enum_job_sheets_coverage_status" AS ENUM('analyse', 'insuffisant');
  ALTER TYPE "public"."enum_article_rule_proposals_kind" ADD VALUE 'critere';
  ALTER TABLE "articles" ALTER COLUMN "visual_motif" SET DATA TYPE text;
  DROP TYPE "public"."enum_articles_visual_motif";
  CREATE TYPE "public"."enum_articles_visual_motif" AS ENUM('horloge', 'calendrier', 'feuille', 'pieces', 'barres', 'versus', 'meteo', 'route', 'bouclier', 'personnes', 'telephone', 'gantt', 'casque', 'photo', 'repas');
  ALTER TABLE "articles" ALTER COLUMN "visual_motif" SET DATA TYPE "public"."enum_articles_visual_motif" USING "visual_motif"::"public"."enum_articles_visual_motif";
  ALTER TABLE "articles" ADD COLUMN "coverage_status" "enum_articles_coverage_status";
  ALTER TABLE "articles" ADD COLUMN "coverage_words_min" numeric;
  ALTER TABLE "articles" ADD COLUMN "coverage_words_max" numeric;
  ALTER TABLE "articles" ADD COLUMN "coverage_entities" numeric;
  ALTER TABLE "articles" ADD COLUMN "coverage_excess" numeric;
  ALTER TABLE "articles" ADD COLUMN "image_alt" varchar;
  ALTER TABLE "articles" ADD COLUMN "image_mime" varchar;
  ALTER TABLE "articles" ADD COLUMN "image_width" numeric;
  ALTER TABLE "articles" ADD COLUMN "image_bytes" numeric;
  ALTER TABLE "articles" ADD COLUMN "image_file" varchar;
  ALTER TABLE "article_rule_proposals" ADD COLUMN "criterion_change" jsonb;
  ALTER TABLE "job_sheets" ADD COLUMN "coverage_status" "enum_job_sheets_coverage_status";
  ALTER TABLE "job_sheets" ADD COLUMN "coverage_words_min" numeric;
  ALTER TABLE "job_sheets" ADD COLUMN "coverage_words_max" numeric;
  ALTER TABLE "job_sheets" ADD COLUMN "coverage_entities" numeric;
  ALTER TABLE "job_sheets" ADD COLUMN "coverage_excess" numeric;
  ALTER TABLE "job_sheets" ADD COLUMN "seo_title" varchar;
  ALTER TABLE "job_sheets" ADD COLUMN "seo_description" varchar;
  ALTER TABLE "job_sheets" ADD COLUMN "wp_focus_keyword" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_articles_visual_motif" ADD VALUE 'caisse';
  ALTER TABLE "article_rule_proposals" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_article_rule_proposals_kind";
  CREATE TYPE "public"."enum_article_rule_proposals_kind" AS ENUM('ajout', 'modification', 'retrait');
  ALTER TABLE "article_rule_proposals" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_article_rule_proposals_kind" USING "kind"::"public"."enum_article_rule_proposals_kind";
  ALTER TABLE "articles" DROP COLUMN "coverage_status";
  ALTER TABLE "articles" DROP COLUMN "coverage_words_min";
  ALTER TABLE "articles" DROP COLUMN "coverage_words_max";
  ALTER TABLE "articles" DROP COLUMN "coverage_entities";
  ALTER TABLE "articles" DROP COLUMN "coverage_excess";
  ALTER TABLE "articles" DROP COLUMN "image_alt";
  ALTER TABLE "articles" DROP COLUMN "image_mime";
  ALTER TABLE "articles" DROP COLUMN "image_width";
  ALTER TABLE "articles" DROP COLUMN "image_bytes";
  ALTER TABLE "articles" DROP COLUMN "image_file";
  ALTER TABLE "article_rule_proposals" DROP COLUMN "criterion_change";
  ALTER TABLE "job_sheets" DROP COLUMN "coverage_status";
  ALTER TABLE "job_sheets" DROP COLUMN "coverage_words_min";
  ALTER TABLE "job_sheets" DROP COLUMN "coverage_words_max";
  ALTER TABLE "job_sheets" DROP COLUMN "coverage_entities";
  ALTER TABLE "job_sheets" DROP COLUMN "coverage_excess";
  ALTER TABLE "job_sheets" DROP COLUMN "seo_title";
  ALTER TABLE "job_sheets" DROP COLUMN "seo_description";
  ALTER TABLE "job_sheets" DROP COLUMN "wp_focus_keyword";
  DROP TYPE "public"."enum_articles_coverage_status";
  DROP TYPE "public"."enum_job_sheets_coverage_status";`)
}
