import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_form_submissions_video_pourcentage" AS ENUM('0', '25', '50', '75', '100');
  CREATE TYPE "public"."enum_form_submissions_video_cta" AS ENUM('fin', 'pause');
  ALTER TABLE "form_submissions" ADD COLUMN "video_id" varchar;
  ALTER TABLE "form_submissions" ADD COLUMN "video_pourcentage" "enum_form_submissions_video_pourcentage";
  ALTER TABLE "form_submissions" ADD COLUMN "video_cta" "enum_form_submissions_video_cta";
  CREATE INDEX "form_submissions_video_id_idx" ON "form_submissions" USING btree ("video_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "form_submissions_video_id_idx";
  ALTER TABLE "form_submissions" DROP COLUMN "video_id";
  ALTER TABLE "form_submissions" DROP COLUMN "video_pourcentage";
  ALTER TABLE "form_submissions" DROP COLUMN "video_cta";
  DROP TYPE "public"."enum_form_submissions_video_pourcentage";
  DROP TYPE "public"."enum_form_submissions_video_cta";`)
}
