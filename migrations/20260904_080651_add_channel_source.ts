import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_form_submissions_channel_source" AS ENUM('clic-payant', 'landing-page', 'defaut');
  ALTER TABLE "form_submissions" ADD COLUMN "channel_source" "enum_form_submissions_channel_source";
  CREATE INDEX "form_submissions_channel_source_idx" ON "form_submissions" USING btree ("channel_source");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "form_submissions_channel_source_idx";
  ALTER TABLE "form_submissions" DROP COLUMN "channel_source";
  DROP TYPE "public"."enum_form_submissions_channel_source";`)
}
