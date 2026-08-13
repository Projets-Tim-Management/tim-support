import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_calendar_connections_provider" AS ENUM('google', 'microsoft');
  CREATE TYPE "public"."enum_calendar_connections_status" AS ENUM('ok', 'expired');
  CREATE TABLE "calendar_connections_calendars" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"calendar_id" varchar NOT NULL,
  	"name" varchar,
  	"busy" boolean DEFAULT true,
  	"target" boolean DEFAULT false
  );
  
  CREATE TABLE "calendar_connections" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"partner_id" integer NOT NULL,
  	"provider" "enum_calendar_connections_provider" NOT NULL,
  	"account_email" varchar,
  	"status" "enum_calendar_connections_status" DEFAULT 'ok',
  	"access_token" varchar,
  	"refresh_token" varchar,
  	"expires_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "journey_runs" ADD COLUMN "session_event_id" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "calendar_connections_id" integer;
  ALTER TABLE "calendar_connections_calendars" ADD CONSTRAINT "calendar_connections_calendars_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."calendar_connections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "calendar_connections_calendars_order_idx" ON "calendar_connections_calendars" USING btree ("_order");
  CREATE INDEX "calendar_connections_calendars_parent_id_idx" ON "calendar_connections_calendars" USING btree ("_parent_id");
  CREATE INDEX "calendar_connections_partner_idx" ON "calendar_connections" USING btree ("partner_id");
  CREATE INDEX "calendar_connections_updated_at_idx" ON "calendar_connections" USING btree ("updated_at");
  CREATE INDEX "calendar_connections_created_at_idx" ON "calendar_connections" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_calendar_connections_fk" FOREIGN KEY ("calendar_connections_id") REFERENCES "public"."calendar_connections"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_calendar_connections_id_idx" ON "payload_locked_documents_rels" USING btree ("calendar_connections_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "calendar_connections_calendars" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "calendar_connections" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "calendar_connections_calendars" CASCADE;
  DROP TABLE "calendar_connections" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_calendar_connections_fk";
  
  DROP INDEX "payload_locked_documents_rels_calendar_connections_id_idx";
  ALTER TABLE "journey_runs" DROP COLUMN "session_event_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "calendar_connections_id";
  DROP TYPE "public"."enum_calendar_connections_provider";
  DROP TYPE "public"."enum_calendar_connections_status";`)
}
