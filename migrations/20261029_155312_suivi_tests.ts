import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// ADDITIVE — générée par scripts/db-migrate-additive.ts (schéma d'avant fusionné : l'ancien moteur vidéo reste en base jusqu'au temps 2).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ad_tests_dimension" AS ENUM('ton', 'angle', 'accroche', 'format', 'visuel', 'cta', 'style', 'musique', 'page', 'audience');
  CREATE TYPE "public"."enum_ad_tests_metric" AS ENUM('cpl-qualifie', 'cpl', 'cout-par-vue', 'ctr');
  CREATE TYPE "public"."enum_ad_tests_status" AS ENUM('en-attente-de-volume', 'en-cours', 'conclu', 'sans-verdict', 'abandonne');
  CREATE TYPE "public"."enum_ad_tests_confidence" AS ENUM('forte', 'moyenne');
  ALTER TYPE "public"."enum_ad_decisions_kind" ADD VALUE 'test';
  CREATE TABLE "ad_tests" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"run_id" integer,
	"hypothesis" varchar NOT NULL,
	"dimension" "enum_ad_tests_dimension" NOT NULL,
	"metric" "enum_ad_tests_metric" NOT NULL,
	"variants" jsonb NOT NULL,
	"min_results" numeric,
	"min_days" numeric,
	"max_days" numeric,
	"status" "enum_ad_tests_status" DEFAULT 'en-attente-de-volume' NOT NULL,
	"reason" varchar,
	"results" jsonb,
	"winner" varchar,
	"probability" numeric,
	"confidence" "enum_ad_tests_confidence",
	"interpretation" varchar,
	"opened_at" timestamp(3) with time zone NOT NULL,
	"closed_at" timestamp(3) with time zone,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_tests_id" integer;
  ALTER TABLE "ad_tests" ADD CONSTRAINT "ad_tests_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_tests" ADD CONSTRAINT "ad_tests_run_id_ad_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ad_agent_runs"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ad_tests_campaign_idx" ON "ad_tests" USING btree ("campaign_id");
  CREATE INDEX "ad_tests_run_idx" ON "ad_tests" USING btree ("run_id");
  CREATE INDEX "ad_tests_status_idx" ON "ad_tests" USING btree ("status");
  CREATE INDEX "ad_tests_updated_at_idx" ON "ad_tests" USING btree ("updated_at");
  CREATE INDEX "ad_tests_created_at_idx" ON "ad_tests" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_tests_fk" FOREIGN KEY ("ad_tests_id") REFERENCES "public"."ad_tests"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ad_tests_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_tests_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ad_tests" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ad_tests" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_tests_fk";

  ALTER TABLE "ad_decisions" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_ad_decisions_kind";
  CREATE TYPE "public"."enum_ad_decisions_kind" AS ENUM('repartition-budget', 'positionnement', 'angle', 'audience', 'rejet-controleur', 'creation-sous-agent', 'concurrent', 'attente', 'budget', 'pause', 'activation');
  ALTER TABLE "ad_decisions" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_ad_decisions_kind" USING "kind"::"public"."enum_ad_decisions_kind";
  DROP INDEX "payload_locked_documents_rels_ad_tests_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_tests_id";
  DROP TYPE "public"."enum_ad_tests_dimension";
  DROP TYPE "public"."enum_ad_tests_metric";
  DROP TYPE "public"."enum_ad_tests_status";
  DROP TYPE "public"."enum_ad_tests_confidence";`)
}
