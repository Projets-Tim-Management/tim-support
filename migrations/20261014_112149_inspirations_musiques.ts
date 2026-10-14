import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ad_media_beat_status" AS ENUM('en-attente', 'en-cours', 'pret', 'echec');
  CREATE TYPE "public"."enum_ad_rushes_use" AS ENUM('matiere', 'inspiration');
  CREATE TYPE "public"."enum_ad_rushes_verdict" AS ENUM('aimer', 'eviter');
  ALTER TYPE "public"."enum_ad_creatives_tests_dimension" ADD VALUE 'musique';
  ALTER TABLE "ad_rushes" ALTER COLUMN "description" DROP NOT NULL;
  ALTER TABLE "ad_creatives" ADD COLUMN "video_music_id" integer;
  ALTER TABLE "ad_media" ADD COLUMN "active" boolean DEFAULT true;
  ALTER TABLE "ad_media" ADD COLUMN "when_to_use" varchar;
  ALTER TABLE "ad_media" ADD COLUMN "beat_status" "enum_ad_media_beat_status";
  ALTER TABLE "ad_media" ADD COLUMN "beat_bpm" numeric;
  ALTER TABLE "ad_media" ADD COLUMN "beat_best_start_sec" numeric;
  ALTER TABLE "ad_media" ADD COLUMN "beat_duration_sec" numeric;
  ALTER TABLE "ad_media" ADD COLUMN "beat_error" varchar;
  ALTER TABLE "ad_media" ADD COLUMN "beat_first_beat_sec" numeric;
  ALTER TABLE "ad_media" ADD COLUMN "beat_confidence" numeric;
  ALTER TABLE "ad_media" ADD COLUMN "beat_attempts" numeric DEFAULT 0;
  ALTER TABLE "ad_media" ADD COLUMN "beat_lease_until" timestamp(3) with time zone;
  ALTER TABLE "ad_rushes" ADD COLUMN "use" "enum_ad_rushes_use" DEFAULT 'matiere' NOT NULL;
  ALTER TABLE "ad_rushes" ADD COLUMN "verdict" "enum_ad_rushes_verdict" DEFAULT 'aimer' NOT NULL;
  ALTER TABLE "ad_rushes" ADD COLUMN "link" varchar;
  ALTER TABLE "ad_rushes" ADD COLUMN "why" varchar;
  ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_video_music_id_ad_media_id_fk" FOREIGN KEY ("video_music_id") REFERENCES "public"."ad_media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ad_creatives_video_video_music_idx" ON "ad_creatives" USING btree ("video_music_id");
  CREATE INDEX "ad_media_active_idx" ON "ad_media" USING btree ("active");
  CREATE INDEX "ad_media_beat_beat_status_idx" ON "ad_media" USING btree ("beat_status");
  CREATE INDEX "ad_media_beat_beat_lease_until_idx" ON "ad_media" USING btree ("beat_lease_until");
  CREATE INDEX "ad_rushes_use_idx" ON "ad_rushes" USING btree ("use");
  -- Les musiques déjà déposées partent à l'analyse du rythme.
  UPDATE "ad_media" SET "beat_status" = 'en-attente', "beat_attempts" = 0 WHERE "kind" = 'musique';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ad_creatives" DROP CONSTRAINT "ad_creatives_video_music_id_ad_media_id_fk";
  
  ALTER TABLE "ad_creatives_tests" ALTER COLUMN "dimension" SET DATA TYPE text;
  DROP TYPE "public"."enum_ad_creatives_tests_dimension";
  CREATE TYPE "public"."enum_ad_creatives_tests_dimension" AS ENUM('ton', 'angle', 'accroche', 'format', 'visuel', 'cta', 'style');
  ALTER TABLE "ad_creatives_tests" ALTER COLUMN "dimension" SET DATA TYPE "public"."enum_ad_creatives_tests_dimension" USING "dimension"::"public"."enum_ad_creatives_tests_dimension";
  DROP INDEX "ad_creatives_video_video_music_idx";
  DROP INDEX "ad_media_active_idx";
  DROP INDEX "ad_media_beat_beat_status_idx";
  DROP INDEX "ad_media_beat_beat_lease_until_idx";
  DROP INDEX "ad_rushes_use_idx";
  ALTER TABLE "ad_rushes" ALTER COLUMN "description" SET NOT NULL;
  ALTER TABLE "ad_creatives" DROP COLUMN "video_music_id";
  ALTER TABLE "ad_media" DROP COLUMN "active";
  ALTER TABLE "ad_media" DROP COLUMN "when_to_use";
  ALTER TABLE "ad_media" DROP COLUMN "beat_status";
  ALTER TABLE "ad_media" DROP COLUMN "beat_bpm";
  ALTER TABLE "ad_media" DROP COLUMN "beat_best_start_sec";
  ALTER TABLE "ad_media" DROP COLUMN "beat_duration_sec";
  ALTER TABLE "ad_media" DROP COLUMN "beat_error";
  ALTER TABLE "ad_media" DROP COLUMN "beat_first_beat_sec";
  ALTER TABLE "ad_media" DROP COLUMN "beat_confidence";
  ALTER TABLE "ad_media" DROP COLUMN "beat_attempts";
  ALTER TABLE "ad_media" DROP COLUMN "beat_lease_until";
  ALTER TABLE "ad_rushes" DROP COLUMN "use";
  ALTER TABLE "ad_rushes" DROP COLUMN "verdict";
  ALTER TABLE "ad_rushes" DROP COLUMN "link";
  ALTER TABLE "ad_rushes" DROP COLUMN "why";
  DROP TYPE "public"."enum_ad_media_beat_status";
  DROP TYPE "public"."enum_ad_rushes_use";
  DROP TYPE "public"."enum_ad_rushes_verdict";`)
}
