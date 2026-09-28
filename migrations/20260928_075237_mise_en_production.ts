import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_partner_clients_client_status" ADD VALUE 'en-signature' BEFORE 'actif';
  ALTER TYPE "public"."enum__partner_clients_v_version_client_status" ADD VALUE 'en-signature' BEFORE 'actif';
  ALTER TYPE "public"."enum_journey_runs_steps_phase" ADD VALUE 'production';
  ALTER TYPE "public"."enum_marketing_journeys_steps_phase" ADD VALUE 'production';
  ALTER TABLE "journey_runs" ADD COLUMN "journey_key" varchar;
  CREATE INDEX "journey_runs_journey_key_idx" ON "journey_runs" USING btree ("journey_key");
  UPDATE "journey_runs" SET "journey_key" = 'phase-de-test' WHERE "journey_key" IS NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients" ALTER COLUMN "client_status" SET DATA TYPE text;
  ALTER TABLE "partner_clients" ALTER COLUMN "client_status" SET DEFAULT 'nouvelle'::text;
  DROP TYPE "public"."enum_partner_clients_client_status";
  CREATE TYPE "public"."enum_partner_clients_client_status" AS ENUM('nouvelle', 'en-qualification', 'demo-programmee', 'attente-engagement', 'attente-longue', 'en-test', 'actif', 'perdue', 'resilie', 'archive');
  ALTER TABLE "partner_clients" ALTER COLUMN "client_status" SET DEFAULT 'nouvelle'::"public"."enum_partner_clients_client_status";
  ALTER TABLE "partner_clients" ALTER COLUMN "client_status" SET DATA TYPE "public"."enum_partner_clients_client_status" USING "client_status"::"public"."enum_partner_clients_client_status";
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_client_status" SET DATA TYPE text;
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_client_status" SET DEFAULT 'nouvelle'::text;
  DROP TYPE "public"."enum__partner_clients_v_version_client_status";
  CREATE TYPE "public"."enum__partner_clients_v_version_client_status" AS ENUM('nouvelle', 'en-qualification', 'demo-programmee', 'attente-engagement', 'attente-longue', 'en-test', 'actif', 'perdue', 'resilie', 'archive');
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_client_status" SET DEFAULT 'nouvelle'::"public"."enum__partner_clients_v_version_client_status";
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_client_status" SET DATA TYPE "public"."enum__partner_clients_v_version_client_status" USING "version_client_status"::"public"."enum__partner_clients_v_version_client_status";
  ALTER TABLE "journey_runs_steps" ALTER COLUMN "phase" SET DATA TYPE text;
  DROP TYPE "public"."enum_journey_runs_steps_phase";
  CREATE TYPE "public"."enum_journey_runs_steps_phase" AS ENUM('avant-test', 'pendant-test', 'sortie-test');
  ALTER TABLE "journey_runs_steps" ALTER COLUMN "phase" SET DATA TYPE "public"."enum_journey_runs_steps_phase" USING "phase"::"public"."enum_journey_runs_steps_phase";
  ALTER TABLE "marketing_journeys_steps" ALTER COLUMN "phase" SET DATA TYPE text;
  ALTER TABLE "marketing_journeys_steps" ALTER COLUMN "phase" SET DEFAULT 'avant-test'::text;
  DROP TYPE "public"."enum_marketing_journeys_steps_phase";
  CREATE TYPE "public"."enum_marketing_journeys_steps_phase" AS ENUM('avant-test', 'pendant-test', 'sortie-test');
  ALTER TABLE "marketing_journeys_steps" ALTER COLUMN "phase" SET DEFAULT 'avant-test'::"public"."enum_marketing_journeys_steps_phase";
  ALTER TABLE "marketing_journeys_steps" ALTER COLUMN "phase" SET DATA TYPE "public"."enum_marketing_journeys_steps_phase" USING "phase"::"public"."enum_marketing_journeys_steps_phase";
  DROP INDEX "journey_runs_journey_key_idx";
  ALTER TABLE "journey_runs" DROP COLUMN "journey_key";`)
}
