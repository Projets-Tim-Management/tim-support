import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "articles" ADD COLUMN "gsc_clicks" numeric;
  ALTER TABLE "articles" ADD COLUMN "gsc_impressions" numeric;
  ALTER TABLE "articles" ADD COLUMN "gsc_position" numeric;
  ALTER TABLE "articles" ADD COLUMN "gsc_clicks28" numeric;
  ALTER TABLE "articles" ADD COLUMN "gsc_clicks28_prev" numeric;
  ALTER TABLE "articles" ADD COLUMN "ga4_sessions" numeric;
  ALTER TABLE "articles" ADD COLUMN "ga4_ai_sessions" numeric;
  ALTER TABLE "articles" ADD COLUMN "stats_updated_at" timestamp(3) with time zone;
  CREATE INDEX "articles_gsc_clicks_idx" ON "articles" USING btree ("gsc_clicks");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "articles_gsc_clicks_idx";
  ALTER TABLE "articles" DROP COLUMN "gsc_clicks";
  ALTER TABLE "articles" DROP COLUMN "gsc_impressions";
  ALTER TABLE "articles" DROP COLUMN "gsc_position";
  ALTER TABLE "articles" DROP COLUMN "gsc_clicks28";
  ALTER TABLE "articles" DROP COLUMN "gsc_clicks28_prev";
  ALTER TABLE "articles" DROP COLUMN "ga4_sessions";
  ALTER TABLE "articles" DROP COLUMN "ga4_ai_sessions";
  ALTER TABLE "articles" DROP COLUMN "stats_updated_at";`)
}
