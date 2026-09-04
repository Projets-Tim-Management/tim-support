import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_forms_fields_type" AS ENUM('text', 'email', 'tel', 'select', 'multiselect');
  CREATE TYPE "public"."enum_forms_default_channel" AS ENUM('seo', 'sea');
  CREATE TYPE "public"."enum_form_submissions_channel" AS ENUM('seo', 'sea');
  CREATE TYPE "public"."enum_form_submissions_placement" AS ENUM('drawer', 'page-contact', 'lp-hero', 'lp-section');
  CREATE TYPE "public"."enum_form_submissions_processing_status" AS ENUM('recue', 'opportunite', 'brouillon', 'echec');
  CREATE TABLE "forms_fields_options" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar,
  	"label" varchar
  );
  
  CREATE TABLE "forms_fields" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"type" "enum_forms_fields_type" DEFAULT 'text' NOT NULL,
  	"required" boolean DEFAULT true,
  	"label" varchar NOT NULL,
  	"placeholder" varchar,
  	"help_text" varchar,
  	"max_length" numeric,
  	"country_code" boolean
  );
  
  CREATE TABLE "forms" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"form_id" varchar NOT NULL,
  	"default_channel" "enum_forms_default_channel" DEFAULT 'seo' NOT NULL,
  	"success_text" varchar NOT NULL,
  	"error_text" varchar NOT NULL,
  	"legal_notice" varchar,
  	"active" boolean DEFAULT true,
  	"seed_version" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "form_submissions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"summary" varchar,
  	"form_id" integer,
  	"form_id_snapshot" varchar,
  	"answers" jsonb,
  	"channel" "enum_form_submissions_channel",
  	"placement" "enum_form_submissions_placement",
  	"source_page_path" varchar,
  	"source_page_url" varchar,
  	"lp_slug" varchar,
  	"lp_variant" varchar,
  	"referrer" varchar,
  	"utm_source" varchar,
  	"utm_medium" varchar,
  	"utm_campaign" varchar,
  	"utm_term" varchar,
  	"utm_content" varchar,
  	"gclid" varchar,
  	"msclkid" varchar,
  	"client_id" integer,
  	"processing_status" "enum_form_submissions_processing_status" DEFAULT 'recue',
  	"processing_error" varchar,
  	"ip" varchar,
  	"session_id" varchar,
  	"user_agent" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "forms_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "form_submissions_id" integer;
  ALTER TABLE "forms_fields_options" ADD CONSTRAINT "forms_fields_options_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms_fields"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_fields" ADD CONSTRAINT "forms_fields_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "forms_fields_options_order_idx" ON "forms_fields_options" USING btree ("_order");
  CREATE INDEX "forms_fields_options_parent_id_idx" ON "forms_fields_options" USING btree ("_parent_id");
  CREATE INDEX "forms_fields_order_idx" ON "forms_fields" USING btree ("_order");
  CREATE INDEX "forms_fields_parent_id_idx" ON "forms_fields" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "forms_form_id_idx" ON "forms" USING btree ("form_id");
  CREATE INDEX "forms_updated_at_idx" ON "forms" USING btree ("updated_at");
  CREATE INDEX "forms_created_at_idx" ON "forms" USING btree ("created_at");
  CREATE INDEX "form_submissions_form_idx" ON "form_submissions" USING btree ("form_id");
  CREATE INDEX "form_submissions_form_id_snapshot_idx" ON "form_submissions" USING btree ("form_id_snapshot");
  CREATE INDEX "form_submissions_channel_idx" ON "form_submissions" USING btree ("channel");
  CREATE INDEX "form_submissions_placement_idx" ON "form_submissions" USING btree ("placement");
  CREATE INDEX "form_submissions_source_page_path_idx" ON "form_submissions" USING btree ("source_page_path");
  CREATE INDEX "form_submissions_lp_slug_idx" ON "form_submissions" USING btree ("lp_slug");
  CREATE INDEX "form_submissions_lp_variant_idx" ON "form_submissions" USING btree ("lp_variant");
  CREATE INDEX "form_submissions_utm_source_idx" ON "form_submissions" USING btree ("utm_source");
  CREATE INDEX "form_submissions_utm_medium_idx" ON "form_submissions" USING btree ("utm_medium");
  CREATE INDEX "form_submissions_utm_campaign_idx" ON "form_submissions" USING btree ("utm_campaign");
  CREATE INDEX "form_submissions_client_idx" ON "form_submissions" USING btree ("client_id");
  CREATE INDEX "form_submissions_processing_status_idx" ON "form_submissions" USING btree ("processing_status");
  CREATE INDEX "form_submissions_updated_at_idx" ON "form_submissions" USING btree ("updated_at");
  CREATE INDEX "form_submissions_created_at_idx" ON "form_submissions" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_forms_fk" FOREIGN KEY ("forms_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_form_submissions_fk" FOREIGN KEY ("form_submissions_id") REFERENCES "public"."form_submissions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_forms_id_idx" ON "payload_locked_documents_rels" USING btree ("forms_id");
  CREATE INDEX "payload_locked_documents_rels_form_submissions_id_idx" ON "payload_locked_documents_rels" USING btree ("form_submissions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "forms_fields_options" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "forms_fields" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "forms" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "form_submissions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "forms_fields_options" CASCADE;
  DROP TABLE "forms_fields" CASCADE;
  DROP TABLE "forms" CASCADE;
  DROP TABLE "form_submissions" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_forms_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_form_submissions_fk";
  
  DROP INDEX "payload_locked_documents_rels_forms_id_idx";
  DROP INDEX "payload_locked_documents_rels_form_submissions_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "forms_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "form_submissions_id";
  DROP TYPE "public"."enum_forms_fields_type";
  DROP TYPE "public"."enum_forms_default_channel";
  DROP TYPE "public"."enum_form_submissions_channel";
  DROP TYPE "public"."enum_form_submissions_placement";
  DROP TYPE "public"."enum_form_submissions_processing_status";`)
}
