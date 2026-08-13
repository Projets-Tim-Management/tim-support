import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_journey_runs_steps_state" AS ENUM('a-faire', 'fait', 'bloque');
  CREATE TYPE "public"."enum_journey_runs_steps_actor" AS ENUM('partenaire', 'admin', 'client');
  CREATE TYPE "public"."enum_journey_runs_steps_phase" AS ENUM('avant-test', 'pendant-test', 'sortie-test');
  CREATE TYPE "public"."enum_journey_runs_steps_anchor" AS ENUM('aucun', 'debut', 'milieu', 'fin');
  CREATE TYPE "public"."enum_journey_runs_decision" AS ENUM('contrat', 'prolongation', 'abandon');
  CREATE TYPE "public"."enum_journey_runs_status" AS ENUM('preparation', 'en-cours', 'gagne', 'perdu', 'annule');
  CREATE TYPE "public"."enum_marketing_journeys_steps_actor" AS ENUM('partenaire', 'admin', 'client');
  CREATE TYPE "public"."enum_marketing_journeys_steps_phase" AS ENUM('avant-test', 'pendant-test', 'sortie-test');
  CREATE TYPE "public"."enum_marketing_journeys_steps_anchor" AS ENUM('aucun', 'debut', 'milieu', 'fin');
  CREATE TABLE "journey_runs_extensions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"days" numeric NOT NULL,
  	"at" timestamp(3) with time zone,
  	"reason" varchar
  );
  
  CREATE TABLE "journey_runs_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"label" varchar NOT NULL,
  	"state" "enum_journey_runs_steps_state" DEFAULT 'a-faire',
  	"actor" "enum_journey_runs_steps_actor",
  	"phase" "enum_journey_runs_steps_phase",
  	"detail" varchar,
  	"anchor" "enum_journey_runs_steps_anchor" DEFAULT 'aucun',
  	"offset_days" numeric DEFAULT 0,
  	"done_at" timestamp(3) with time zone,
  	"done_by_id" integer,
  	"note" varchar
  );
  
  CREATE TABLE "journey_runs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client_id" integer NOT NULL,
  	"journey_id" integer NOT NULL,
  	"partner_id" integer,
  	"start_date" timestamp(3) with time zone,
  	"duration_weeks" numeric DEFAULT 4,
  	"end_date" timestamp(3) with time zone,
  	"decision" "enum_journey_runs_decision",
  	"decision_at" timestamp(3) with time zone,
  	"lost_reason" varchar,
  	"status" "enum_journey_runs_status" DEFAULT 'preparation',
  	"notes" varchar,
  	"display_name" varchar,
  	"steps_total" numeric,
  	"steps_done" numeric,
  	"progress_pct" numeric,
  	"current_step_key" varchar,
  	"current_step_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "marketing_journeys_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"label" varchar NOT NULL,
  	"actor" "enum_marketing_journeys_steps_actor" DEFAULT 'partenaire' NOT NULL,
  	"phase" "enum_marketing_journeys_steps_phase" DEFAULT 'avant-test' NOT NULL,
  	"detail" varchar,
  	"anchor" "enum_marketing_journeys_steps_anchor" DEFAULT 'aucun',
  	"offset_days" numeric DEFAULT 0
  );
  
  CREATE TABLE "marketing_journeys" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"key" varchar NOT NULL,
  	"description" varchar,
  	"default_duration_weeks" numeric DEFAULT 4,
  	"monday_only" boolean DEFAULT true,
  	"active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "journey_runs_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "marketing_journeys_id" integer;
  ALTER TABLE "journey_runs_extensions" ADD CONSTRAINT "journey_runs_extensions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."journey_runs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "journey_runs_steps" ADD CONSTRAINT "journey_runs_steps_done_by_id_users_id_fk" FOREIGN KEY ("done_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "journey_runs_steps" ADD CONSTRAINT "journey_runs_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."journey_runs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "journey_runs" ADD CONSTRAINT "journey_runs_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "journey_runs" ADD CONSTRAINT "journey_runs_journey_id_marketing_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."marketing_journeys"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "journey_runs" ADD CONSTRAINT "journey_runs_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "marketing_journeys_steps" ADD CONSTRAINT "marketing_journeys_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."marketing_journeys"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "journey_runs_extensions_order_idx" ON "journey_runs_extensions" USING btree ("_order");
  CREATE INDEX "journey_runs_extensions_parent_id_idx" ON "journey_runs_extensions" USING btree ("_parent_id");
  CREATE INDEX "journey_runs_steps_order_idx" ON "journey_runs_steps" USING btree ("_order");
  CREATE INDEX "journey_runs_steps_parent_id_idx" ON "journey_runs_steps" USING btree ("_parent_id");
  CREATE INDEX "journey_runs_steps_done_by_idx" ON "journey_runs_steps" USING btree ("done_by_id");
  CREATE INDEX "journey_runs_client_idx" ON "journey_runs" USING btree ("client_id");
  CREATE INDEX "journey_runs_journey_idx" ON "journey_runs" USING btree ("journey_id");
  CREATE INDEX "journey_runs_partner_idx" ON "journey_runs" USING btree ("partner_id");
  CREATE INDEX "journey_runs_start_date_idx" ON "journey_runs" USING btree ("start_date");
  CREATE INDEX "journey_runs_status_idx" ON "journey_runs" USING btree ("status");
  CREATE INDEX "journey_runs_updated_at_idx" ON "journey_runs" USING btree ("updated_at");
  CREATE INDEX "journey_runs_created_at_idx" ON "journey_runs" USING btree ("created_at");
  CREATE INDEX "marketing_journeys_steps_order_idx" ON "marketing_journeys_steps" USING btree ("_order");
  CREATE INDEX "marketing_journeys_steps_parent_id_idx" ON "marketing_journeys_steps" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "marketing_journeys_key_idx" ON "marketing_journeys" USING btree ("key");
  CREATE INDEX "marketing_journeys_updated_at_idx" ON "marketing_journeys" USING btree ("updated_at");
  CREATE INDEX "marketing_journeys_created_at_idx" ON "marketing_journeys" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_journey_runs_fk" FOREIGN KEY ("journey_runs_id") REFERENCES "public"."journey_runs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_marketing_journeys_fk" FOREIGN KEY ("marketing_journeys_id") REFERENCES "public"."marketing_journeys"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_journey_runs_id_idx" ON "payload_locked_documents_rels" USING btree ("journey_runs_id");
  CREATE INDEX "payload_locked_documents_rels_marketing_journeys_id_idx" ON "payload_locked_documents_rels" USING btree ("marketing_journeys_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "journey_runs_extensions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "journey_runs_steps" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "journey_runs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "marketing_journeys_steps" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "marketing_journeys" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "journey_runs_extensions" CASCADE;
  DROP TABLE "journey_runs_steps" CASCADE;
  DROP TABLE "journey_runs" CASCADE;
  DROP TABLE "marketing_journeys_steps" CASCADE;
  DROP TABLE "marketing_journeys" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_journey_runs_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_marketing_journeys_fk";
  
  DROP INDEX "payload_locked_documents_rels_journey_runs_id_idx";
  DROP INDEX "payload_locked_documents_rels_marketing_journeys_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "journey_runs_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "marketing_journeys_id";
  DROP TYPE "public"."enum_journey_runs_steps_state";
  DROP TYPE "public"."enum_journey_runs_steps_actor";
  DROP TYPE "public"."enum_journey_runs_steps_phase";
  DROP TYPE "public"."enum_journey_runs_steps_anchor";
  DROP TYPE "public"."enum_journey_runs_decision";
  DROP TYPE "public"."enum_journey_runs_status";
  DROP TYPE "public"."enum_marketing_journeys_steps_actor";
  DROP TYPE "public"."enum_marketing_journeys_steps_phase";
  DROP TYPE "public"."enum_marketing_journeys_steps_anchor";`)
}
