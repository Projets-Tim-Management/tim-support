import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_ad_media_kind" ADD VALUE 'visage' BEFORE 'musique';
  ALTER TABLE "ad_creatives" ADD COLUMN "video_elements" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ad_media" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_ad_media_kind";
  CREATE TYPE "public"."enum_ad_media_kind" AS ENUM('logo', 'police', 'capture', 'photo', 'musique', 'fond', 'inspiration', 'crea');
  ALTER TABLE "ad_media" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_ad_media_kind" USING "kind"::"public"."enum_ad_media_kind";
  ALTER TABLE "ad_creatives" DROP COLUMN "video_elements";`)
}
