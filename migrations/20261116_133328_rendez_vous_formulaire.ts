import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "booking_types_questions" ALTER COLUMN "label" DROP NOT NULL;
  ALTER TABLE "booking_types_questions" ALTER COLUMN "key" DROP NOT NULL;
  ALTER TABLE "booking_types_questions" ALTER COLUMN "type" DROP NOT NULL;
  ALTER TABLE "booking_types" ADD COLUMN "source_form_id" integer;
  ALTER TABLE "booking_types" ADD CONSTRAINT "booking_types_source_form_id_forms_id_fk" FOREIGN KEY ("source_form_id") REFERENCES "public"."forms"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "booking_types_source_form_idx" ON "booking_types" USING btree ("source_form_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "booking_types" DROP CONSTRAINT "booking_types_source_form_id_forms_id_fk";
  
  DROP INDEX "booking_types_source_form_idx";
  ALTER TABLE "booking_types_questions" ALTER COLUMN "label" SET NOT NULL;
  ALTER TABLE "booking_types_questions" ALTER COLUMN "key" SET NOT NULL;
  ALTER TABLE "booking_types_questions" ALTER COLUMN "type" SET NOT NULL;
  ALTER TABLE "booking_types" DROP COLUMN "source_form_id";`)
}
