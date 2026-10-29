import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// ADDITIVE — générée par scripts/db-migrate-additive.ts (schéma d'avant fusionné : l'ancien moteur vidéo reste en base jusqu'au temps 2).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_ad_agent_runs_status" ADD VALUE 'termine';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ad_agent_runs" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "ad_agent_runs" ALTER COLUMN "status" SET DEFAULT 'en-cours'::text;
  DROP TYPE "public"."enum_ad_agent_runs_status";
  CREATE TYPE "public"."enum_ad_agent_runs_status" AS ENUM('en-cours', 'en-pause-budget', 'a-valider', 'arrete', 'echoue');
  ALTER TABLE "ad_agent_runs" ALTER COLUMN "status" SET DEFAULT 'en-cours'::"public"."enum_ad_agent_runs_status";
  ALTER TABLE "ad_agent_runs" ALTER COLUMN "status" SET DATA TYPE "public"."enum_ad_agent_runs_status" USING "status"::"public"."enum_ad_agent_runs_status";`)
}
