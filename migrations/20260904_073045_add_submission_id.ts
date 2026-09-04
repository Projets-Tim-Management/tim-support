import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "form_submissions" ADD COLUMN "submission_id" varchar;
  CREATE UNIQUE INDEX "form_submissions_submission_id_idx" ON "form_submissions" USING btree ("submission_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "form_submissions_submission_id_idx";
  ALTER TABLE "form_submissions" DROP COLUMN "submission_id";`)
}
