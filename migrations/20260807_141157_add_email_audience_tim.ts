import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_marketing_journeys_emails_audience" ADD VALUE 'tim' BEFORE 'partenaire';
  ALTER TABLE "marketing_journeys_emails" ADD COLUMN "step_key" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "marketing_journeys_emails" ALTER COLUMN "audience" SET DATA TYPE text;
  ALTER TABLE "marketing_journeys_emails" ALTER COLUMN "audience" SET DEFAULT 'client'::text;
  DROP TYPE "public"."enum_marketing_journeys_emails_audience";
  CREATE TYPE "public"."enum_marketing_journeys_emails_audience" AS ENUM('client', 'partenaire');
  ALTER TABLE "marketing_journeys_emails" ALTER COLUMN "audience" SET DEFAULT 'client'::"public"."enum_marketing_journeys_emails_audience";
  ALTER TABLE "marketing_journeys_emails" ALTER COLUMN "audience" SET DATA TYPE "public"."enum_marketing_journeys_emails_audience" USING "audience"::"public"."enum_marketing_journeys_emails_audience";
  ALTER TABLE "marketing_journeys_emails" DROP COLUMN "step_key";`)
}
