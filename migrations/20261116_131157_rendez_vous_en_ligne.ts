import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_booking_types_questions_type" AS ENUM('texte', 'paragraphe', 'choix');
  CREATE TYPE "public"."enum_booking_types_questions_crm_field" AS ENUM('aucun', 'collaborateurs');
  CREATE TYPE "public"."enum_booking_types_location_kind" AS ENUM('meet', 'telephone', 'sur-place', 'autre');
  CREATE TYPE "public"."enum_booking_types_distribution" AS ENUM('disponibilite', 'equilibre');
  CREATE TYPE "public"."enum_booking_types_increment_min" AS ENUM('10', '15', '20', '30', '45', '60');
  CREATE TYPE "public"."enum_booking_types_crm_stage" AS ENUM('nouvelle', 'en-qualification', 'demo-programmee', 'attente-engagement', 'attente-longue', 'en-test', 'en-signature', 'actif', 'perdue', 'resilie', 'archive');
  CREATE TYPE "public"."enum_bookings_problems_kind" AS ENUM('agenda-lecture', 'agenda-evenement', 'email-prospect', 'email-equipe', 'crm');
  CREATE TYPE "public"."enum_bookings_status" AS ENUM('confirme', 'annule', 'venu', 'absent');
  CREATE TYPE "public"."enum_bookings_cancelled_by" AS ENUM('prospect', 'equipe');
  CREATE TABLE "booking_types_questions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"key" varchar NOT NULL,
  	"type" "enum_booking_types_questions_type" DEFAULT 'texte' NOT NULL,
  	"options" varchar,
  	"required" boolean DEFAULT false,
  	"crm_field" "enum_booking_types_questions_crm_field" DEFAULT 'aucun'
  );
  
  CREATE TABLE "booking_types_reminders" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"minutes_before" numeric NOT NULL
  );
  
  CREATE TABLE "booking_types" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"active" boolean DEFAULT true,
  	"description" varchar,
  	"duration_min" numeric DEFAULT 30 NOT NULL,
  	"location_kind" "enum_booking_types_location_kind" DEFAULT 'meet' NOT NULL,
  	"location_detail" varchar,
  	"distribution" "enum_booking_types_distribution" DEFAULT 'disponibilite',
  	"scheduling_hours" jsonb,
  	"scheduling_date_overrides" jsonb,
  	"increment_min" "enum_booking_types_increment_min" DEFAULT '30',
  	"buffer_before_min" numeric DEFAULT 0,
  	"buffer_after_min" numeric DEFAULT 10,
  	"min_notice_hours" numeric DEFAULT 4,
  	"horizon_days" numeric DEFAULT 30,
  	"max_per_day" numeric,
  	"phone_required" boolean DEFAULT true,
  	"confirmation_email" boolean DEFAULT true,
  	"confirmation_text" varchar,
  	"notify_host" boolean DEFAULT true,
  	"allow_reschedule" boolean DEFAULT true,
  	"allow_cancel" boolean DEFAULT true,
  	"change_until_hours" numeric DEFAULT 2,
  	"crm_stage" "enum_booking_types_crm_stage" DEFAULT 'demo-programmee',
  	"confirmation_message" varchar,
  	"redirect_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "booking_types_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "bookings_problems" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kind" "enum_bookings_problems_kind",
  	"at" timestamp(3) with time zone,
  	"message" varchar
  );
  
  CREATE TABLE "bookings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"summary" varchar,
  	"start" timestamp(3) with time zone NOT NULL,
  	"end" timestamp(3) with time zone NOT NULL,
  	"status" "enum_bookings_status" DEFAULT 'confirme' NOT NULL,
  	"type_id" integer NOT NULL,
  	"host_id" integer NOT NULL,
  	"slot_key" varchar,
  	"has_problem" boolean,
  	"first_name" varchar NOT NULL,
  	"last_name" varchar NOT NULL,
  	"email" varchar NOT NULL,
  	"phone" varchar,
  	"company" varchar NOT NULL,
  	"answers" jsonb,
  	"client_id" integer,
  	"task_id" integer,
  	"submission_id" integer,
  	"tracking" jsonb,
  	"meeting_url" varchar,
  	"event_id" varchar,
  	"calendar_id" varchar,
  	"connection_id" integer,
  	"manage_token" varchar,
  	"reminders_sent" jsonb,
  	"rescheduled_count" numeric DEFAULT 0,
  	"cancel_reason" varchar,
  	"cancelled_by" "enum_bookings_cancelled_by",
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "forms" ADD COLUMN "booking_type_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "booking_types_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "bookings_id" integer;
  ALTER TABLE "booking_types_questions" ADD CONSTRAINT "booking_types_questions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."booking_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "booking_types_reminders" ADD CONSTRAINT "booking_types_reminders_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."booking_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "booking_types_rels" ADD CONSTRAINT "booking_types_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."booking_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "booking_types_rels" ADD CONSTRAINT "booking_types_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "bookings_problems" ADD CONSTRAINT "bookings_problems_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_type_id_booking_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."booking_types"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_task_id_client_activities_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."client_activities"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_submission_id_form_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."form_submissions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_connection_id_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."calendar_connections"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "booking_types_questions_order_idx" ON "booking_types_questions" USING btree ("_order");
  CREATE INDEX "booking_types_questions_parent_id_idx" ON "booking_types_questions" USING btree ("_parent_id");
  CREATE INDEX "booking_types_reminders_order_idx" ON "booking_types_reminders" USING btree ("_order");
  CREATE INDEX "booking_types_reminders_parent_id_idx" ON "booking_types_reminders" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "booking_types_slug_idx" ON "booking_types" USING btree ("slug");
  CREATE INDEX "booking_types_updated_at_idx" ON "booking_types" USING btree ("updated_at");
  CREATE INDEX "booking_types_created_at_idx" ON "booking_types" USING btree ("created_at");
  CREATE INDEX "booking_types_rels_order_idx" ON "booking_types_rels" USING btree ("order");
  CREATE INDEX "booking_types_rels_parent_idx" ON "booking_types_rels" USING btree ("parent_id");
  CREATE INDEX "booking_types_rels_path_idx" ON "booking_types_rels" USING btree ("path");
  CREATE INDEX "booking_types_rels_users_id_idx" ON "booking_types_rels" USING btree ("users_id");
  CREATE INDEX "bookings_problems_order_idx" ON "bookings_problems" USING btree ("_order");
  CREATE INDEX "bookings_problems_parent_id_idx" ON "bookings_problems" USING btree ("_parent_id");
  CREATE INDEX "bookings_start_idx" ON "bookings" USING btree ("start");
  CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");
  CREATE INDEX "bookings_type_idx" ON "bookings" USING btree ("type_id");
  CREATE INDEX "bookings_host_idx" ON "bookings" USING btree ("host_id");
  CREATE UNIQUE INDEX "bookings_slot_key_idx" ON "bookings" USING btree ("slot_key");
  CREATE INDEX "bookings_has_problem_idx" ON "bookings" USING btree ("has_problem");
  CREATE INDEX "bookings_email_idx" ON "bookings" USING btree ("email");
  CREATE INDEX "bookings_client_idx" ON "bookings" USING btree ("client_id");
  CREATE INDEX "bookings_task_idx" ON "bookings" USING btree ("task_id");
  CREATE INDEX "bookings_submission_idx" ON "bookings" USING btree ("submission_id");
  CREATE INDEX "bookings_connection_idx" ON "bookings" USING btree ("connection_id");
  CREATE UNIQUE INDEX "bookings_manage_token_idx" ON "bookings" USING btree ("manage_token");
  CREATE INDEX "bookings_updated_at_idx" ON "bookings" USING btree ("updated_at");
  CREATE INDEX "bookings_created_at_idx" ON "bookings" USING btree ("created_at");
  ALTER TABLE "forms" ADD CONSTRAINT "forms_booking_type_id_booking_types_id_fk" FOREIGN KEY ("booking_type_id") REFERENCES "public"."booking_types"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_booking_types_fk" FOREIGN KEY ("booking_types_id") REFERENCES "public"."booking_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_bookings_fk" FOREIGN KEY ("bookings_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "forms_booking_type_idx" ON "forms" USING btree ("booking_type_id");
  CREATE INDEX "payload_locked_documents_rels_booking_types_id_idx" ON "payload_locked_documents_rels" USING btree ("booking_types_id");
  CREATE INDEX "payload_locked_documents_rels_bookings_id_idx" ON "payload_locked_documents_rels" USING btree ("bookings_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "booking_types_questions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "booking_types_reminders" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "booking_types" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "booking_types_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "bookings_problems" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "bookings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "booking_types_questions" CASCADE;
  DROP TABLE "booking_types_reminders" CASCADE;
  DROP TABLE "booking_types" CASCADE;
  DROP TABLE "booking_types_rels" CASCADE;
  DROP TABLE "bookings_problems" CASCADE;
  DROP TABLE "bookings" CASCADE;
  ALTER TABLE "forms" DROP CONSTRAINT "forms_booking_type_id_booking_types_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_booking_types_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_bookings_fk";
  
  DROP INDEX "forms_booking_type_idx";
  DROP INDEX "payload_locked_documents_rels_booking_types_id_idx";
  DROP INDEX "payload_locked_documents_rels_bookings_id_idx";
  ALTER TABLE "forms" DROP COLUMN "booking_type_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "booking_types_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "bookings_id";
  DROP TYPE "public"."enum_booking_types_questions_type";
  DROP TYPE "public"."enum_booking_types_questions_crm_field";
  DROP TYPE "public"."enum_booking_types_location_kind";
  DROP TYPE "public"."enum_booking_types_distribution";
  DROP TYPE "public"."enum_booking_types_increment_min";
  DROP TYPE "public"."enum_booking_types_crm_stage";
  DROP TYPE "public"."enum_bookings_problems_kind";
  DROP TYPE "public"."enum_bookings_status";
  DROP TYPE "public"."enum_bookings_cancelled_by";`)
}
