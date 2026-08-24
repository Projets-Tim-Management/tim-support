import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_journey_runs_steps_anchor" ADD VALUE 'session';
  ALTER TYPE "public"."enum_marketing_journeys_steps_anchor" ADD VALUE 'session';
  ALTER TYPE "public"."enum_marketing_journeys_emails_anchor" ADD VALUE 'session';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "journey_runs_steps" ALTER COLUMN "anchor" SET DATA TYPE text;
  ALTER TABLE "journey_runs_steps" ALTER COLUMN "anchor" SET DEFAULT 'aucun'::text;
  DROP TYPE "public"."enum_journey_runs_steps_anchor";
  CREATE TYPE "public"."enum_journey_runs_steps_anchor" AS ENUM('aucun', 'debut', 'milieu', 'fin');
  ALTER TABLE "journey_runs_steps" ALTER COLUMN "anchor" SET DEFAULT 'aucun'::"public"."enum_journey_runs_steps_anchor";
  ALTER TABLE "journey_runs_steps" ALTER COLUMN "anchor" SET DATA TYPE "public"."enum_journey_runs_steps_anchor" USING "anchor"::"public"."enum_journey_runs_steps_anchor";
  ALTER TABLE "marketing_journeys_steps" ALTER COLUMN "anchor" SET DATA TYPE text;
  ALTER TABLE "marketing_journeys_steps" ALTER COLUMN "anchor" SET DEFAULT 'aucun'::text;
  DROP TYPE "public"."enum_marketing_journeys_steps_anchor";
  CREATE TYPE "public"."enum_marketing_journeys_steps_anchor" AS ENUM('aucun', 'debut', 'milieu', 'fin');
  ALTER TABLE "marketing_journeys_steps" ALTER COLUMN "anchor" SET DEFAULT 'aucun'::"public"."enum_marketing_journeys_steps_anchor";
  ALTER TABLE "marketing_journeys_steps" ALTER COLUMN "anchor" SET DATA TYPE "public"."enum_marketing_journeys_steps_anchor" USING "anchor"::"public"."enum_marketing_journeys_steps_anchor";
  ALTER TABLE "marketing_journeys_emails" ALTER COLUMN "anchor" SET DATA TYPE text;
  ALTER TABLE "marketing_journeys_emails" ALTER COLUMN "anchor" SET DEFAULT 'aucun'::text;
  DROP TYPE "public"."enum_marketing_journeys_emails_anchor";
  CREATE TYPE "public"."enum_marketing_journeys_emails_anchor" AS ENUM('aucun', 'debut', 'milieu', 'fin');
  ALTER TABLE "marketing_journeys_emails" ALTER COLUMN "anchor" SET DEFAULT 'aucun'::"public"."enum_marketing_journeys_emails_anchor";
  ALTER TABLE "marketing_journeys_emails" ALTER COLUMN "anchor" SET DATA TYPE "public"."enum_marketing_journeys_emails_anchor" USING "anchor"::"public"."enum_marketing_journeys_emails_anchor";`)
}
