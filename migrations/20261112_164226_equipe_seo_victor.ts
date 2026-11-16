import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ai_team_objectives_status" AS ENUM('a-faire', 'fait', 'reporte', 'abandonne');
  CREATE TYPE "public"."enum_ai_team_objectives_evidence" AS ENUM('prouve', 'correle', 'speculatif');
  ALTER TYPE "public"."enum_ai_team_members_domain" ADD VALUE 'seo';
  ALTER TYPE "public"."enum_ai_team_members_portrait" ADD VALUE 'chef-seo';
  ALTER TYPE "public"."enum_ad_ai_usage_kind" ADD VALUE 'seo';
  CREATE TABLE "ai_team_objectives_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL,
  	"minutes" numeric,
  	"prompt" varchar,
  	"done" boolean DEFAULT false,
  	"done_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "ai_team_objectives" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"member_id" integer NOT NULL,
  	"week" varchar NOT NULL,
  	"rank" numeric NOT NULL,
  	"status" "enum_ai_team_objectives_status" DEFAULT 'a-faire' NOT NULL,
  	"title" varchar NOT NULL,
  	"page" varchar,
  	"diagnosis" varchar,
  	"benchmark" varchar,
  	"why" varchar,
  	"measure" varchar,
  	"evidence" "enum_ai_team_objectives_evidence",
  	"due_date" timestamp(3) with time zone,
  	"minutes" numeric,
  	"closed_at" timestamp(3) with time zone,
  	"slots" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "ai_team_members" ADD COLUMN "weekly_hours" numeric;
  ALTER TABLE "ai_team_members" ADD COLUMN "calendar_connection_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ai_team_objectives_id" integer;
  ALTER TABLE "ai_team_objectives_steps" ADD CONSTRAINT "ai_team_objectives_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ai_team_objectives"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_team_objectives" ADD CONSTRAINT "ai_team_objectives_member_id_ai_team_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."ai_team_members"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ai_team_objectives_steps_order_idx" ON "ai_team_objectives_steps" USING btree ("_order");
  CREATE INDEX "ai_team_objectives_steps_parent_id_idx" ON "ai_team_objectives_steps" USING btree ("_parent_id");
  CREATE INDEX "ai_team_objectives_member_idx" ON "ai_team_objectives" USING btree ("member_id");
  CREATE INDEX "ai_team_objectives_week_idx" ON "ai_team_objectives" USING btree ("week");
  CREATE INDEX "ai_team_objectives_status_idx" ON "ai_team_objectives" USING btree ("status");
  CREATE INDEX "ai_team_objectives_updated_at_idx" ON "ai_team_objectives" USING btree ("updated_at");
  CREATE INDEX "ai_team_objectives_created_at_idx" ON "ai_team_objectives" USING btree ("created_at");
  ALTER TABLE "ai_team_members" ADD CONSTRAINT "ai_team_members_calendar_connection_id_calendar_connections_id_fk" FOREIGN KEY ("calendar_connection_id") REFERENCES "public"."calendar_connections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_team_objectives_fk" FOREIGN KEY ("ai_team_objectives_id") REFERENCES "public"."ai_team_objectives"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "ai_team_members_calendar_connection_idx" ON "ai_team_members" USING btree ("calendar_connection_id");
  CREATE INDEX "payload_locked_documents_rels_ai_team_objectives_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_team_objectives_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ai_team_objectives_steps" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ai_team_objectives" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ai_team_objectives_steps" CASCADE;
  DROP TABLE "ai_team_objectives" CASCADE;
  ALTER TABLE "ai_team_members" DROP CONSTRAINT "ai_team_members_calendar_connection_id_calendar_connections_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ai_team_objectives_fk";
  
  ALTER TABLE "ai_team_members" ALTER COLUMN "domain" SET DATA TYPE text;
  DROP TYPE "public"."enum_ai_team_members_domain";
  CREATE TYPE "public"."enum_ai_team_members_domain" AS ENUM('sea');
  ALTER TABLE "ai_team_members" ALTER COLUMN "domain" SET DATA TYPE "public"."enum_ai_team_members_domain" USING "domain"::"public"."enum_ai_team_members_domain";
  ALTER TABLE "ai_team_members" ALTER COLUMN "portrait" SET DATA TYPE text;
  DROP TYPE "public"."enum_ai_team_members_portrait";
  CREATE TYPE "public"."enum_ai_team_members_portrait" AS ENUM('chef-sea', 'stratege', 'redacteur', 'directeur-artistique', 'controleur', 'meta-ads', 'google-ads', 'chatgpt-ads', 'mesure');
  ALTER TABLE "ai_team_members" ALTER COLUMN "portrait" SET DATA TYPE "public"."enum_ai_team_members_portrait" USING "portrait"::"public"."enum_ai_team_members_portrait";
  ALTER TABLE "ad_ai_usage" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_ad_ai_usage_kind";
  CREATE TYPE "public"."enum_ad_ai_usage_kind" AS ENUM('texte', 'image', 'video', 'agent');
  ALTER TABLE "ad_ai_usage" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_ad_ai_usage_kind" USING "kind"::"public"."enum_ad_ai_usage_kind";
  DROP INDEX "ai_team_members_calendar_connection_idx";
  DROP INDEX "payload_locked_documents_rels_ai_team_objectives_id_idx";
  ALTER TABLE "ai_team_members" DROP COLUMN "weekly_hours";
  ALTER TABLE "ai_team_members" DROP COLUMN "calendar_connection_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ai_team_objectives_id";
  DROP TYPE "public"."enum_ai_team_objectives_status";
  DROP TYPE "public"."enum_ai_team_objectives_evidence";`)
}
