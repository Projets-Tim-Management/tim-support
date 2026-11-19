import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "articles" ADD COLUMN "score_seo" numeric;
  ALTER TABLE "articles" ADD COLUMN "score_geo" numeric;
  ALTER TABLE "articles" ADD COLUMN "score_rules_version" numeric;
  ALTER TABLE "articles" ADD COLUMN "scored_at" timestamp(3) with time zone;
  ALTER TABLE "articles" ADD COLUMN "score_detail" jsonb;
  ALTER TABLE "article_rule_versions" ADD COLUMN "criteria" jsonb;
  ALTER TABLE "job_sheets" ADD COLUMN "score_seo" numeric;
  ALTER TABLE "job_sheets" ADD COLUMN "score_geo" numeric;
  ALTER TABLE "job_sheets" ADD COLUMN "score_rules_version" numeric;
  ALTER TABLE "job_sheets" ADD COLUMN "scored_at" timestamp(3) with time zone;
  ALTER TABLE "job_sheets" ADD COLUMN "score_detail" jsonb;
  CREATE INDEX "articles_score_seo_idx" ON "articles" USING btree ("score_seo");
  CREATE INDEX "articles_score_geo_idx" ON "articles" USING btree ("score_geo");
  CREATE INDEX "job_sheets_score_seo_idx" ON "job_sheets" USING btree ("score_seo");
  CREATE INDEX "job_sheets_score_geo_idx" ON "job_sheets" USING btree ("score_geo");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "articles_score_seo_idx";
  DROP INDEX "articles_score_geo_idx";
  DROP INDEX "job_sheets_score_seo_idx";
  DROP INDEX "job_sheets_score_geo_idx";
  ALTER TABLE "articles" DROP COLUMN "score_seo";
  ALTER TABLE "articles" DROP COLUMN "score_geo";
  ALTER TABLE "articles" DROP COLUMN "score_rules_version";
  ALTER TABLE "articles" DROP COLUMN "scored_at";
  ALTER TABLE "articles" DROP COLUMN "score_detail";
  ALTER TABLE "article_rule_versions" DROP COLUMN "criteria";
  ALTER TABLE "job_sheets" DROP COLUMN "score_seo";
  ALTER TABLE "job_sheets" DROP COLUMN "score_geo";
  ALTER TABLE "job_sheets" DROP COLUMN "score_rules_version";
  ALTER TABLE "job_sheets" DROP COLUMN "scored_at";
  ALTER TABLE "job_sheets" DROP COLUMN "score_detail";`)
}
