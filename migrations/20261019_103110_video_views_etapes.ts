import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_video_views_etape" ADD VALUE 'affichage' BEFORE 'lecture';
  ALTER TYPE "public"."enum_video_views_etape" ADD VALUE 'cta';
  DROP INDEX "videoId_page_etape_jour_idx";
  ALTER TABLE "video_views" ADD COLUMN "appareil" varchar DEFAULT 'inconnu' NOT NULL;
  ALTER TABLE "video_views" ADD COLUMN "canal" varchar DEFAULT 'inconnu' NOT NULL;
  CREATE UNIQUE INDEX "videoId_page_etape_jour_appareil_canal_idx" ON "video_views" USING btree ("video_id","page","etape","jour","appareil","canal");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "video_views" ALTER COLUMN "etape" SET DATA TYPE text;
  DROP TYPE "public"."enum_video_views_etape";
  CREATE TYPE "public"."enum_video_views_etape" AS ENUM('lecture', '25', '50', '75', 'fin');
  ALTER TABLE "video_views" ALTER COLUMN "etape" SET DATA TYPE "public"."enum_video_views_etape" USING "etape"::"public"."enum_video_views_etape";
  DROP INDEX "videoId_page_etape_jour_appareil_canal_idx";
  CREATE UNIQUE INDEX "videoId_page_etape_jour_idx" ON "video_views" USING btree ("video_id","page","etape","jour");
  ALTER TABLE "video_views" DROP COLUMN "appareil";
  ALTER TABLE "video_views" DROP COLUMN "canal";`)
}
