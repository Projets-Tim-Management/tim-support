import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_training_days_emails_cancel_reason" AS ENUM('telephone', 'sur-place', 'autre');
  ALTER TABLE "training_days_emails" ADD COLUMN "cancelled_at" timestamp(3) with time zone;
  ALTER TABLE "training_days_emails" ADD COLUMN "cancel_reason" "enum_training_days_emails_cancel_reason";
  ALTER TABLE "training_days_emails" ADD COLUMN "cancel_note" varchar;
  ALTER TABLE "training_days_emails" ADD COLUMN "cancelled_by_name" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "training_days_emails" DROP COLUMN "cancelled_at";
  ALTER TABLE "training_days_emails" DROP COLUMN "cancel_reason";
  ALTER TABLE "training_days_emails" DROP COLUMN "cancel_note";
  ALTER TABLE "training_days_emails" DROP COLUMN "cancelled_by_name";
  DROP TYPE "public"."enum_training_days_emails_cancel_reason";`)
}
