import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ad_agent_runs_kind" AS ENUM('preparation', 'quotidien', 'hebdomadaire', 'mensuel');
  CREATE TYPE "public"."enum_ad_instructions_scope" AS ENUM('global', 'campagne');
  CREATE TYPE "public"."enum_ad_instructions_status" AS ENUM('active', 'proposee', 'ecartee');
  CREATE TYPE "public"."enum_ad_instructions_origin" AS ENUM('saisie', 'refus');
  CREATE TYPE "public"."enum_ad_learnings_scope" AS ENUM('global', 'campagne');
  CREATE TYPE "public"."enum_ad_learnings_confidence" AS ENUM('faible', 'moyenne', 'forte');
  CREATE TYPE "public"."enum_ad_learnings_status" AS ENUM('actif', 'global-propose', 'archive');
  CREATE TYPE "public"."enum_ad_learnings_source" AS ENUM('test', 'refus', 'consigne', 'resultat-decision', 'saisie');
  ALTER TYPE "public"."enum_ad_decisions_kind" ADD VALUE 'attente';
  CREATE TABLE "ad_decisions_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"ad_instructions_id" integer,
  	"ad_learnings_id" integer
  );
  
  CREATE TABLE "ad_instructions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL,
  	"scope" "enum_ad_instructions_scope" DEFAULT 'global' NOT NULL,
  	"campaign_id" integer,
  	"status" "enum_ad_instructions_status" DEFAULT 'active' NOT NULL,
  	"origin" "enum_ad_instructions_origin" DEFAULT 'saisie',
  	"confirmed_by_id" integer,
  	"confirmed_at" timestamp(3) with time zone,
  	"source_creative_id" integer,
  	"refusal_reason" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ad_learnings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"statement" varchar NOT NULL,
  	"scope" "enum_ad_learnings_scope" DEFAULT 'campagne' NOT NULL,
  	"campaign_id" integer,
  	"confidence" "enum_ad_learnings_confidence" DEFAULT 'moyenne' NOT NULL,
  	"status" "enum_ad_learnings_status" DEFAULT 'actif' NOT NULL,
  	"source" "enum_ad_learnings_source" DEFAULT 'saisie' NOT NULL,
  	"learned_at" timestamp(3) with time zone,
  	"revalidate_at" timestamp(3) with time zone,
  	"source_decision_id" integer,
  	"source_creative_id" integer,
  	"promoted_by_id" integer,
  	"promoted_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "ad_agent_runs" ADD COLUMN "kind" "enum_ad_agent_runs_kind" DEFAULT 'preparation' NOT NULL;
  ALTER TABLE "ad_agent_runs" ADD COLUMN "instructions_read" jsonb;
  ALTER TABLE "ad_agent_runs" ADD COLUMN "learnings_read" jsonb;
  ALTER TABLE "ad_decisions" ADD COLUMN "citations" jsonb;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_instructions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_learnings_id" integer;
  ALTER TABLE "ad_decisions_rels" ADD CONSTRAINT "ad_decisions_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ad_decisions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ad_decisions_rels" ADD CONSTRAINT "ad_decisions_rels_ad_instructions_fk" FOREIGN KEY ("ad_instructions_id") REFERENCES "public"."ad_instructions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ad_decisions_rels" ADD CONSTRAINT "ad_decisions_rels_ad_learnings_fk" FOREIGN KEY ("ad_learnings_id") REFERENCES "public"."ad_learnings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ad_instructions" ADD CONSTRAINT "ad_instructions_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_instructions" ADD CONSTRAINT "ad_instructions_confirmed_by_id_users_id_fk" FOREIGN KEY ("confirmed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_instructions" ADD CONSTRAINT "ad_instructions_source_creative_id_ad_creatives_id_fk" FOREIGN KEY ("source_creative_id") REFERENCES "public"."ad_creatives"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_learnings" ADD CONSTRAINT "ad_learnings_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_learnings" ADD CONSTRAINT "ad_learnings_source_decision_id_ad_decisions_id_fk" FOREIGN KEY ("source_decision_id") REFERENCES "public"."ad_decisions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_learnings" ADD CONSTRAINT "ad_learnings_source_creative_id_ad_creatives_id_fk" FOREIGN KEY ("source_creative_id") REFERENCES "public"."ad_creatives"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_learnings" ADD CONSTRAINT "ad_learnings_promoted_by_id_users_id_fk" FOREIGN KEY ("promoted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ad_decisions_rels_order_idx" ON "ad_decisions_rels" USING btree ("order");
  CREATE INDEX "ad_decisions_rels_parent_idx" ON "ad_decisions_rels" USING btree ("parent_id");
  CREATE INDEX "ad_decisions_rels_path_idx" ON "ad_decisions_rels" USING btree ("path");
  CREATE INDEX "ad_decisions_rels_ad_instructions_id_idx" ON "ad_decisions_rels" USING btree ("ad_instructions_id");
  CREATE INDEX "ad_decisions_rels_ad_learnings_id_idx" ON "ad_decisions_rels" USING btree ("ad_learnings_id");
  CREATE INDEX "ad_instructions_campaign_idx" ON "ad_instructions" USING btree ("campaign_id");
  CREATE INDEX "ad_instructions_status_idx" ON "ad_instructions" USING btree ("status");
  CREATE INDEX "ad_instructions_confirmed_by_idx" ON "ad_instructions" USING btree ("confirmed_by_id");
  CREATE INDEX "ad_instructions_source_creative_idx" ON "ad_instructions" USING btree ("source_creative_id");
  CREATE INDEX "ad_instructions_updated_at_idx" ON "ad_instructions" USING btree ("updated_at");
  CREATE INDEX "ad_instructions_created_at_idx" ON "ad_instructions" USING btree ("created_at");
  CREATE INDEX "ad_learnings_campaign_idx" ON "ad_learnings" USING btree ("campaign_id");
  CREATE INDEX "ad_learnings_status_idx" ON "ad_learnings" USING btree ("status");
  CREATE INDEX "ad_learnings_source_decision_idx" ON "ad_learnings" USING btree ("source_decision_id");
  CREATE INDEX "ad_learnings_source_creative_idx" ON "ad_learnings" USING btree ("source_creative_id");
  CREATE INDEX "ad_learnings_promoted_by_idx" ON "ad_learnings" USING btree ("promoted_by_id");
  CREATE INDEX "ad_learnings_updated_at_idx" ON "ad_learnings" USING btree ("updated_at");
  CREATE INDEX "ad_learnings_created_at_idx" ON "ad_learnings" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_instructions_fk" FOREIGN KEY ("ad_instructions_id") REFERENCES "public"."ad_instructions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_learnings_fk" FOREIGN KEY ("ad_learnings_id") REFERENCES "public"."ad_learnings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ad_instructions_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_instructions_id");
  CREATE INDEX "payload_locked_documents_rels_ad_learnings_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_learnings_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ad_decisions_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ad_instructions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ad_learnings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ad_decisions_rels" CASCADE;
  DROP TABLE "ad_instructions" CASCADE;
  DROP TABLE "ad_learnings" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_instructions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_learnings_fk";
  
  ALTER TABLE "ad_decisions" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_ad_decisions_kind";
  CREATE TYPE "public"."enum_ad_decisions_kind" AS ENUM('repartition-budget', 'positionnement', 'angle', 'audience', 'rejet-controleur', 'creation-sous-agent', 'concurrent');
  ALTER TABLE "ad_decisions" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_ad_decisions_kind" USING "kind"::"public"."enum_ad_decisions_kind";
  DROP INDEX "payload_locked_documents_rels_ad_instructions_id_idx";
  DROP INDEX "payload_locked_documents_rels_ad_learnings_id_idx";
  ALTER TABLE "ad_agent_runs" DROP COLUMN "kind";
  ALTER TABLE "ad_agent_runs" DROP COLUMN "instructions_read";
  ALTER TABLE "ad_agent_runs" DROP COLUMN "learnings_read";
  ALTER TABLE "ad_decisions" DROP COLUMN "citations";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_instructions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_learnings_id";
  DROP TYPE "public"."enum_ad_agent_runs_kind";
  DROP TYPE "public"."enum_ad_instructions_scope";
  DROP TYPE "public"."enum_ad_instructions_status";
  DROP TYPE "public"."enum_ad_instructions_origin";
  DROP TYPE "public"."enum_ad_learnings_scope";
  DROP TYPE "public"."enum_ad_learnings_confidence";
  DROP TYPE "public"."enum_ad_learnings_status";
  DROP TYPE "public"."enum_ad_learnings_source";`)
}
