import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_journey_runs_steps_state" ADD VALUE 'auto' BEFORE 'fait';
  ALTER TABLE "journey_runs_steps" ADD COLUMN "auto_at" timestamp(3) with time zone;
  ALTER TABLE "journey_runs_steps" ADD COLUMN "auto_validate" boolean;
  ALTER TABLE "marketing_journeys_steps" ADD COLUMN "auto_validate" boolean;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "journey_runs_steps" ALTER COLUMN "state" SET DATA TYPE text;
  ALTER TABLE "journey_runs_steps" ALTER COLUMN "state" SET DEFAULT 'a-faire'::text;
  DROP TYPE "public"."enum_journey_runs_steps_state";
  CREATE TYPE "public"."enum_journey_runs_steps_state" AS ENUM('a-faire', 'fait', 'bloque');
  ALTER TABLE "journey_runs_steps" ALTER COLUMN "state" SET DEFAULT 'a-faire'::"public"."enum_journey_runs_steps_state";
  ALTER TABLE "journey_runs_steps" ALTER COLUMN "state" SET DATA TYPE "public"."enum_journey_runs_steps_state" USING "state"::"public"."enum_journey_runs_steps_state";
  ALTER TABLE "journey_runs_steps" DROP COLUMN "auto_at";
  ALTER TABLE "journey_runs_steps" DROP COLUMN "auto_validate";
  ALTER TABLE "marketing_journeys_steps" DROP COLUMN "auto_validate";`)
}
