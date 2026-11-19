import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_job_sheets_status" AS ENUM('a-rediger', 'redaction', 'a-verifier', 'publiee', 'arretee');
  CREATE TYPE "public"."enum_job_sheets_write_stage" AS ENUM('redaction', 'relance', 'publication', 'chiffres', 'termine', 'echec');
  CREATE TABLE "job_sheets" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"status" "enum_job_sheets_status" DEFAULT 'a-rediger' NOT NULL,
  	"rome" varchar,
  	"figures_updated_at" timestamp(3) with time zone,
  	"published_at" timestamp(3) with time zone,
  	"title" varchar NOT NULL,
  	"slug" varchar,
  	"why" varchar,
  	"proposed_by" varchar,
  	"proposed_at" timestamp(3) with time zone,
  	"figures" jsonb,
  	"gsc_clicks" numeric,
  	"gsc_impressions" numeric,
  	"gsc_position" numeric,
  	"gsc_clicks28" numeric,
  	"gsc_clicks28_prev" numeric,
  	"ga4_sessions" numeric,
  	"ga4_ai_sessions" numeric,
  	"stats_updated_at" timestamp(3) with time zone,
  	"write_stage" "enum_job_sheets_write_stage",
  	"write_attempts" numeric,
  	"write_cost_eur" numeric,
  	"write_started_at" timestamp(3) with time zone,
  	"write_locked_until" timestamp(3) with time zone,
  	"write_errors" varchar,
  	"write_warnings" varchar,
  	"write_context" jsonb,
  	"draft" jsonb,
  	"previous_acf" jsonb,
  	"wp_id" numeric,
  	"wp_status" varchar,
  	"wp_link" varchar,
  	"wp_modified" timestamp(3) with time zone,
  	"synced_at" timestamp(3) with time zone,
  	"acf" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "job_sheets_id" integer;
  CREATE INDEX "job_sheets_status_idx" ON "job_sheets" USING btree ("status");
  CREATE INDEX "job_sheets_rome_idx" ON "job_sheets" USING btree ("rome");
  CREATE INDEX "job_sheets_figures_updated_at_idx" ON "job_sheets" USING btree ("figures_updated_at");
  CREATE INDEX "job_sheets_published_at_idx" ON "job_sheets" USING btree ("published_at");
  CREATE INDEX "job_sheets_slug_idx" ON "job_sheets" USING btree ("slug");
  CREATE INDEX "job_sheets_gsc_clicks_idx" ON "job_sheets" USING btree ("gsc_clicks");
  CREATE INDEX "job_sheets_write_started_at_idx" ON "job_sheets" USING btree ("write_started_at");
  CREATE UNIQUE INDEX "job_sheets_wp_id_idx" ON "job_sheets" USING btree ("wp_id");
  CREATE INDEX "job_sheets_wp_modified_idx" ON "job_sheets" USING btree ("wp_modified");
  CREATE INDEX "job_sheets_updated_at_idx" ON "job_sheets" USING btree ("updated_at");
  CREATE INDEX "job_sheets_created_at_idx" ON "job_sheets" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_job_sheets_fk" FOREIGN KEY ("job_sheets_id") REFERENCES "public"."job_sheets"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_job_sheets_id_idx" ON "payload_locked_documents_rels" USING btree ("job_sheets_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "job_sheets" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "job_sheets" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_job_sheets_fk";
  
  DROP INDEX "payload_locked_documents_rels_job_sheets_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "job_sheets_id";
  DROP TYPE "public"."enum_job_sheets_status";
  DROP TYPE "public"."enum_job_sheets_write_stage";`)
}
