import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ad_agent_runs_status" AS ENUM('en-cours', 'en-pause-budget', 'a-valider', 'arrete', 'echoue');
  CREATE TYPE "public"."enum_ad_agents_role" AS ENUM('orchestrateur', 'stratege', 'redacteur', 'directeur-artistique', 'controleur', 'analyste');
  CREATE TYPE "public"."enum_ad_agents_status" AS ENUM('en-attente', 'en-cours', 'termine', 'echoue', 'arrete');
  CREATE TYPE "public"."enum_ad_agent_steps_kind" AS ENUM('modele', 'outil');
  CREATE TYPE "public"."enum_ad_agent_steps_status" AS ENUM('en-cours', 'fait', 'echoue');
  CREATE TYPE "public"."enum_ad_decisions_kind" AS ENUM('repartition-budget', 'positionnement', 'angle', 'audience', 'rejet-controleur', 'creation-sous-agent', 'concurrent');
  CREATE TYPE "public"."enum_ad_decisions_status" AS ENUM('proposee', 'executee', 'bloquee');
  CREATE TYPE "public"."enum_ad_competitors_status" AS ENUM('suivi', 'propose', 'refuse');
  ALTER TYPE "public"."enum_ad_ai_usage_kind" ADD VALUE 'agent';
  CREATE TABLE "ad_agent_runs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"campaign_id" integer NOT NULL,
  	"objective" varchar NOT NULL,
  	"status" "enum_ad_agent_runs_status" DEFAULT 'en-cours' NOT NULL,
  	"budget_eur" numeric NOT NULL,
  	"cost_eur" numeric DEFAULT 0,
  	"tokens_input" numeric DEFAULT 0,
  	"tokens_output" numeric DEFAULT 0,
  	"tokens_cache_read" numeric DEFAULT 0,
  	"tokens_cache_write" numeric DEFAULT 0,
  	"started_by_id" integer,
  	"started_at" timestamp(3) with time zone NOT NULL,
  	"finished_at" timestamp(3) with time zone,
  	"limits" jsonb,
  	"lease_until" timestamp(3) with time zone,
  	"summary" varchar,
  	"error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ad_agents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"run_id" integer NOT NULL,
  	"parent_id" integer,
  	"role" "enum_ad_agents_role" NOT NULL,
  	"depth" numeric NOT NULL,
  	"status" "enum_ad_agents_status" DEFAULT 'en-attente' NOT NULL,
  	"mission" varchar NOT NULL,
  	"tools" jsonb,
  	"model" varchar NOT NULL,
  	"budget_eur" numeric NOT NULL,
  	"spent_eur" numeric DEFAULT 0,
  	"tokens_input" numeric DEFAULT 0,
  	"tokens_output" numeric DEFAULT 0,
  	"tokens_cache_read" numeric DEFAULT 0,
  	"tokens_cache_write" numeric DEFAULT 0,
  	"result" jsonb,
  	"error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ad_agent_steps" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"run_id" integer NOT NULL,
  	"agent_id" integer NOT NULL,
  	"seq" numeric NOT NULL,
  	"kind" "enum_ad_agent_steps_kind" NOT NULL,
  	"tool" varchar,
  	"status" "enum_ad_agent_steps_status" DEFAULT 'en-cours' NOT NULL,
  	"line" varchar NOT NULL,
  	"input" jsonb,
  	"output" jsonb,
  	"tokens_input" numeric DEFAULT 0,
  	"tokens_output" numeric DEFAULT 0,
  	"tokens_cache_read" numeric DEFAULT 0,
  	"tokens_cache_write" numeric DEFAULT 0,
  	"cost_eur" numeric DEFAULT 0,
  	"idempotency_key" varchar,
  	"started_at" timestamp(3) with time zone,
  	"finished_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ad_decisions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"campaign_id" integer NOT NULL,
  	"run_id" integer,
  	"agent_id" integer,
  	"step_id" integer,
  	"kind" "enum_ad_decisions_kind" NOT NULL,
  	"status" "enum_ad_decisions_status" NOT NULL,
  	"rationale" varchar NOT NULL,
  	"before" jsonb,
  	"after" jsonb,
  	"guardrail" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ad_competitors" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"page_url" varchar,
  	"page_id" varchar,
  	"status" "enum_ad_competitors_status" DEFAULT 'suivi' NOT NULL,
  	"decided_at" timestamp(3) with time zone,
  	"proposed_by_id" integer,
  	"keywords" varchar,
  	"rationale" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "ad_campaigns" ADD COLUMN "agent_budget_total_daily_eur" numeric;
  ALTER TABLE "ad_campaigns" ADD COLUMN "agent_budget_max_ai_share_pct" numeric DEFAULT 15;
  ALTER TABLE "ad_campaigns" ADD COLUMN "agent_budget_meta_floor_eur" numeric DEFAULT 5;
  ALTER TABLE "ad_campaigns" ADD COLUMN "agent_budget_split_ai_daily_eur" numeric;
  ALTER TABLE "ad_campaigns" ADD COLUMN "agent_budget_split_meta_daily_eur" numeric;
  ALTER TABLE "ad_campaigns" ADD COLUMN "agent_budget_split_decided_at" timestamp(3) with time zone;
  ALTER TABLE "ad_campaigns" ADD COLUMN "agent_budget_split_decision_id" integer;
  ALTER TABLE "ad_ai_usage" ADD COLUMN "run_id" integer;
  ALTER TABLE "ad_ai_usage" ADD COLUMN "agent_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_agent_runs_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_agents_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_agent_steps_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_decisions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_competitors_id" integer;
  ALTER TABLE "ads_settings" ADD COLUMN "agent_prep_max_eur" numeric DEFAULT 5 NOT NULL;
  ALTER TABLE "ads_settings" ADD COLUMN "agent_daily_eur" numeric DEFAULT 15 NOT NULL;
  ALTER TABLE "ads_settings" ADD COLUMN "agent_monthly_eur" numeric DEFAULT 150 NOT NULL;
  ALTER TABLE "ads_settings" ADD COLUMN "ad_library_token_expires_at" timestamp(3) with time zone;
  ALTER TABLE "ad_agent_runs" ADD CONSTRAINT "ad_agent_runs_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_agent_runs" ADD CONSTRAINT "ad_agent_runs_started_by_id_users_id_fk" FOREIGN KEY ("started_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_agents" ADD CONSTRAINT "ad_agents_run_id_ad_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ad_agent_runs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_agents" ADD CONSTRAINT "ad_agents_parent_id_ad_agents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ad_agents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_agent_steps" ADD CONSTRAINT "ad_agent_steps_run_id_ad_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ad_agent_runs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_agent_steps" ADD CONSTRAINT "ad_agent_steps_agent_id_ad_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ad_agents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_decisions" ADD CONSTRAINT "ad_decisions_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_decisions" ADD CONSTRAINT "ad_decisions_run_id_ad_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ad_agent_runs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_decisions" ADD CONSTRAINT "ad_decisions_agent_id_ad_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ad_agents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_decisions" ADD CONSTRAINT "ad_decisions_step_id_ad_agent_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."ad_agent_steps"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_competitors" ADD CONSTRAINT "ad_competitors_proposed_by_id_ad_agent_runs_id_fk" FOREIGN KEY ("proposed_by_id") REFERENCES "public"."ad_agent_runs"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ad_agent_runs_campaign_idx" ON "ad_agent_runs" USING btree ("campaign_id");
  CREATE INDEX "ad_agent_runs_status_idx" ON "ad_agent_runs" USING btree ("status");
  CREATE INDEX "ad_agent_runs_started_by_idx" ON "ad_agent_runs" USING btree ("started_by_id");
  CREATE INDEX "ad_agent_runs_started_at_idx" ON "ad_agent_runs" USING btree ("started_at");
  CREATE INDEX "ad_agent_runs_lease_until_idx" ON "ad_agent_runs" USING btree ("lease_until");
  CREATE INDEX "ad_agent_runs_updated_at_idx" ON "ad_agent_runs" USING btree ("updated_at");
  CREATE INDEX "ad_agent_runs_created_at_idx" ON "ad_agent_runs" USING btree ("created_at");
  CREATE INDEX "ad_agents_run_idx" ON "ad_agents" USING btree ("run_id");
  CREATE INDEX "ad_agents_parent_idx" ON "ad_agents" USING btree ("parent_id");
  CREATE INDEX "ad_agents_status_idx" ON "ad_agents" USING btree ("status");
  CREATE INDEX "ad_agents_updated_at_idx" ON "ad_agents" USING btree ("updated_at");
  CREATE INDEX "ad_agents_created_at_idx" ON "ad_agents" USING btree ("created_at");
  CREATE INDEX "ad_agent_steps_run_idx" ON "ad_agent_steps" USING btree ("run_id");
  CREATE INDEX "ad_agent_steps_agent_idx" ON "ad_agent_steps" USING btree ("agent_id");
  CREATE UNIQUE INDEX "ad_agent_steps_idempotency_key_idx" ON "ad_agent_steps" USING btree ("idempotency_key");
  CREATE INDEX "ad_agent_steps_updated_at_idx" ON "ad_agent_steps" USING btree ("updated_at");
  CREATE INDEX "ad_agent_steps_created_at_idx" ON "ad_agent_steps" USING btree ("created_at");
  CREATE UNIQUE INDEX "agent_seq_idx" ON "ad_agent_steps" USING btree ("agent_id","seq");
  CREATE INDEX "ad_decisions_campaign_idx" ON "ad_decisions" USING btree ("campaign_id");
  CREATE INDEX "ad_decisions_run_idx" ON "ad_decisions" USING btree ("run_id");
  CREATE INDEX "ad_decisions_agent_idx" ON "ad_decisions" USING btree ("agent_id");
  CREATE INDEX "ad_decisions_step_idx" ON "ad_decisions" USING btree ("step_id");
  CREATE INDEX "ad_decisions_kind_idx" ON "ad_decisions" USING btree ("kind");
  CREATE INDEX "ad_decisions_status_idx" ON "ad_decisions" USING btree ("status");
  CREATE INDEX "ad_decisions_updated_at_idx" ON "ad_decisions" USING btree ("updated_at");
  CREATE INDEX "ad_decisions_created_at_idx" ON "ad_decisions" USING btree ("created_at");
  CREATE INDEX "ad_competitors_page_id_idx" ON "ad_competitors" USING btree ("page_id");
  CREATE INDEX "ad_competitors_status_idx" ON "ad_competitors" USING btree ("status");
  CREATE INDEX "ad_competitors_proposed_by_idx" ON "ad_competitors" USING btree ("proposed_by_id");
  CREATE INDEX "ad_competitors_updated_at_idx" ON "ad_competitors" USING btree ("updated_at");
  CREATE INDEX "ad_competitors_created_at_idx" ON "ad_competitors" USING btree ("created_at");
  ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_agent_budget_split_decision_id_ad_decisions_id_fk" FOREIGN KEY ("agent_budget_split_decision_id") REFERENCES "public"."ad_decisions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_ai_usage" ADD CONSTRAINT "ad_ai_usage_run_id_ad_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ad_agent_runs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_ai_usage" ADD CONSTRAINT "ad_ai_usage_agent_id_ad_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ad_agents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_agent_runs_fk" FOREIGN KEY ("ad_agent_runs_id") REFERENCES "public"."ad_agent_runs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_agents_fk" FOREIGN KEY ("ad_agents_id") REFERENCES "public"."ad_agents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_agent_steps_fk" FOREIGN KEY ("ad_agent_steps_id") REFERENCES "public"."ad_agent_steps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_decisions_fk" FOREIGN KEY ("ad_decisions_id") REFERENCES "public"."ad_decisions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_competitors_fk" FOREIGN KEY ("ad_competitors_id") REFERENCES "public"."ad_competitors"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "ad_campaigns_agent_budget_split_agent_budget_split_decis_idx" ON "ad_campaigns" USING btree ("agent_budget_split_decision_id");
  CREATE INDEX "ad_ai_usage_run_idx" ON "ad_ai_usage" USING btree ("run_id");
  CREATE INDEX "ad_ai_usage_agent_idx" ON "ad_ai_usage" USING btree ("agent_id");
  CREATE INDEX "payload_locked_documents_rels_ad_agent_runs_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_agent_runs_id");
  CREATE INDEX "payload_locked_documents_rels_ad_agents_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_agents_id");
  CREATE INDEX "payload_locked_documents_rels_ad_agent_steps_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_agent_steps_id");
  CREATE INDEX "payload_locked_documents_rels_ad_decisions_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_decisions_id");
  CREATE INDEX "payload_locked_documents_rels_ad_competitors_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_competitors_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ad_agent_runs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ad_agents" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ad_agent_steps" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ad_decisions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ad_competitors" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ad_agent_runs" CASCADE;
  DROP TABLE "ad_agents" CASCADE;
  DROP TABLE "ad_agent_steps" CASCADE;
  DROP TABLE "ad_decisions" CASCADE;
  DROP TABLE "ad_competitors" CASCADE;
  ALTER TABLE "ad_campaigns" DROP CONSTRAINT "ad_campaigns_agent_budget_split_decision_id_ad_decisions_id_fk";
  
  ALTER TABLE "ad_ai_usage" DROP CONSTRAINT "ad_ai_usage_run_id_ad_agent_runs_id_fk";
  
  ALTER TABLE "ad_ai_usage" DROP CONSTRAINT "ad_ai_usage_agent_id_ad_agents_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_agent_runs_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_agents_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_agent_steps_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_decisions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_competitors_fk";
  
  ALTER TABLE "ad_ai_usage" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_ad_ai_usage_kind";
  CREATE TYPE "public"."enum_ad_ai_usage_kind" AS ENUM('texte', 'image', 'video');
  ALTER TABLE "ad_ai_usage" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_ad_ai_usage_kind" USING "kind"::"public"."enum_ad_ai_usage_kind";
  DROP INDEX "ad_campaigns_agent_budget_split_agent_budget_split_decis_idx";
  DROP INDEX "ad_ai_usage_run_idx";
  DROP INDEX "ad_ai_usage_agent_idx";
  DROP INDEX "payload_locked_documents_rels_ad_agent_runs_id_idx";
  DROP INDEX "payload_locked_documents_rels_ad_agents_id_idx";
  DROP INDEX "payload_locked_documents_rels_ad_agent_steps_id_idx";
  DROP INDEX "payload_locked_documents_rels_ad_decisions_id_idx";
  DROP INDEX "payload_locked_documents_rels_ad_competitors_id_idx";
  ALTER TABLE "ad_campaigns" DROP COLUMN "agent_budget_total_daily_eur";
  ALTER TABLE "ad_campaigns" DROP COLUMN "agent_budget_max_ai_share_pct";
  ALTER TABLE "ad_campaigns" DROP COLUMN "agent_budget_meta_floor_eur";
  ALTER TABLE "ad_campaigns" DROP COLUMN "agent_budget_split_ai_daily_eur";
  ALTER TABLE "ad_campaigns" DROP COLUMN "agent_budget_split_meta_daily_eur";
  ALTER TABLE "ad_campaigns" DROP COLUMN "agent_budget_split_decided_at";
  ALTER TABLE "ad_campaigns" DROP COLUMN "agent_budget_split_decision_id";
  ALTER TABLE "ad_ai_usage" DROP COLUMN "run_id";
  ALTER TABLE "ad_ai_usage" DROP COLUMN "agent_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_agent_runs_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_agents_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_agent_steps_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_decisions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_competitors_id";
  ALTER TABLE "ads_settings" DROP COLUMN "agent_prep_max_eur";
  ALTER TABLE "ads_settings" DROP COLUMN "agent_daily_eur";
  ALTER TABLE "ads_settings" DROP COLUMN "agent_monthly_eur";
  ALTER TABLE "ads_settings" DROP COLUMN "ad_library_token_expires_at";
  DROP TYPE "public"."enum_ad_agent_runs_status";
  DROP TYPE "public"."enum_ad_agents_role";
  DROP TYPE "public"."enum_ad_agents_status";
  DROP TYPE "public"."enum_ad_agent_steps_kind";
  DROP TYPE "public"."enum_ad_agent_steps_status";
  DROP TYPE "public"."enum_ad_decisions_kind";
  DROP TYPE "public"."enum_ad_decisions_status";
  DROP TYPE "public"."enum_ad_competitors_status";`)
}
