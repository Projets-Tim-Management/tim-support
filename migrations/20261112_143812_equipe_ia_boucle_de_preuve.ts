import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ai_team_requests_origin" AS ENUM('revue', 'agent', 'alerte');
  CREATE TYPE "public"."enum_ai_team_requests_channel" AS ENUM('meta', 'google', 'chatgpt', 'seo', 'tous');
  CREATE TYPE "public"."enum_ai_team_requests_outcome" AS ENUM('a-marche', 'sans-effet', 'a-empire');
  CREATE TABLE "ai_team_snapshots" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"week" varchar NOT NULL,
  	"channels" jsonb,
  	"google" jsonb,
  	"chatgpt" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "ai_team_requests" ADD COLUMN "origin" "enum_ai_team_requests_origin";
  ALTER TABLE "ai_team_requests" ADD COLUMN "channel" "enum_ai_team_requests_channel";
  ALTER TABLE "ai_team_requests" ADD COLUMN "baseline" jsonb;
  ALTER TABLE "ai_team_requests" ADD COLUMN "outcome" "enum_ai_team_requests_outcome";
  ALTER TABLE "ai_team_requests" ADD COLUMN "verdict_at" timestamp(3) with time zone;
  ALTER TABLE "ai_team_requests" ADD COLUMN "verdict" varchar;
  ALTER TABLE "ad_agent_runs" ADD COLUMN "methods_read" jsonb;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ai_team_snapshots_id" integer;
  CREATE UNIQUE INDEX "ai_team_snapshots_week_idx" ON "ai_team_snapshots" USING btree ("week");
  CREATE INDEX "ai_team_snapshots_updated_at_idx" ON "ai_team_snapshots" USING btree ("updated_at");
  CREATE INDEX "ai_team_snapshots_created_at_idx" ON "ai_team_snapshots" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_team_snapshots_fk" FOREIGN KEY ("ai_team_snapshots_id") REFERENCES "public"."ai_team_snapshots"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ai_team_snapshots_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_team_snapshots_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ai_team_snapshots" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ai_team_snapshots" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ai_team_snapshots_fk";
  
  DROP INDEX "payload_locked_documents_rels_ai_team_snapshots_id_idx";
  ALTER TABLE "ai_team_requests" DROP COLUMN "origin";
  ALTER TABLE "ai_team_requests" DROP COLUMN "channel";
  ALTER TABLE "ai_team_requests" DROP COLUMN "baseline";
  ALTER TABLE "ai_team_requests" DROP COLUMN "outcome";
  ALTER TABLE "ai_team_requests" DROP COLUMN "verdict_at";
  ALTER TABLE "ai_team_requests" DROP COLUMN "verdict";
  ALTER TABLE "ad_agent_runs" DROP COLUMN "methods_read";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ai_team_snapshots_id";
  DROP TYPE "public"."enum_ai_team_requests_origin";
  DROP TYPE "public"."enum_ai_team_requests_channel";
  DROP TYPE "public"."enum_ai_team_requests_outcome";`)
}
