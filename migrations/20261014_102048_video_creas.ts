import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ad_creatives_video_status" AS ENUM('en-attente', 'en-cours', 'prete', 'echec');
  ALTER TABLE "ad_creatives" ADD COLUMN "video_status" "enum_ad_creatives_video_status";
  ALTER TABLE "ad_creatives" ADD COLUMN "video_error" varchar;
  ALTER TABLE "ad_creatives" ADD COLUMN "video_score" jsonb;
  ALTER TABLE "ad_creatives" ADD COLUMN "video_renders" jsonb;
  ALTER TABLE "ad_creatives" ADD COLUMN "video_attempts" numeric DEFAULT 0;
  ALTER TABLE "ad_creatives" ADD COLUMN "video_rendered_at" timestamp(3) with time zone;
  ALTER TABLE "ad_creatives" ADD COLUMN "video_lease_until" timestamp(3) with time zone;
  CREATE INDEX "ad_creatives_video_video_status_idx" ON "ad_creatives" USING btree ("video_status");
  CREATE INDEX "ad_creatives_video_video_lease_until_idx" ON "ad_creatives" USING btree ("video_lease_until");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "ad_creatives_video_video_status_idx";
  DROP INDEX "ad_creatives_video_video_lease_until_idx";
  ALTER TABLE "ad_creatives" DROP COLUMN "video_status";
  ALTER TABLE "ad_creatives" DROP COLUMN "video_error";
  ALTER TABLE "ad_creatives" DROP COLUMN "video_score";
  ALTER TABLE "ad_creatives" DROP COLUMN "video_renders";
  ALTER TABLE "ad_creatives" DROP COLUMN "video_attempts";
  ALTER TABLE "ad_creatives" DROP COLUMN "video_rendered_at";
  ALTER TABLE "ad_creatives" DROP COLUMN "video_lease_until";
  DROP TYPE "public"."enum_ad_creatives_video_status";`)
}
