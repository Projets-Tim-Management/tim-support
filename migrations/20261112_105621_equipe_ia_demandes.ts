import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ai_team_requests_kind" AS ENUM('a-faire', 'question');
  CREATE TYPE "public"."enum_ai_team_requests_status" AS ENUM('ouverte', 'faite', 'repondue', 'retiree');
  CREATE TABLE "ai_team_requests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"member_id" integer NOT NULL,
  	"kind" "enum_ai_team_requests_kind" NOT NULL,
  	"status" "enum_ai_team_requests_status" DEFAULT 'ouverte' NOT NULL,
  	"title" varchar NOT NULL,
  	"why" varchar NOT NULL,
  	"url" varchar,
  	"steps" jsonb,
  	"question" varchar,
  	"answer" varchar,
  	"closed_at" timestamp(3) with time zone,
  	"run_id" integer,
  	"campaign_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ai_team_requests_id" integer;
  ALTER TABLE "ai_team_requests" ADD CONSTRAINT "ai_team_requests_member_id_ai_team_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."ai_team_members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_team_requests" ADD CONSTRAINT "ai_team_requests_run_id_ad_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ad_agent_runs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_team_requests" ADD CONSTRAINT "ai_team_requests_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ai_team_requests_member_idx" ON "ai_team_requests" USING btree ("member_id");
  CREATE INDEX "ai_team_requests_status_idx" ON "ai_team_requests" USING btree ("status");
  CREATE INDEX "ai_team_requests_run_idx" ON "ai_team_requests" USING btree ("run_id");
  CREATE INDEX "ai_team_requests_campaign_idx" ON "ai_team_requests" USING btree ("campaign_id");
  CREATE INDEX "ai_team_requests_updated_at_idx" ON "ai_team_requests" USING btree ("updated_at");
  CREATE INDEX "ai_team_requests_created_at_idx" ON "ai_team_requests" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_team_requests_fk" FOREIGN KEY ("ai_team_requests_id") REFERENCES "public"."ai_team_requests"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ai_team_requests_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_team_requests_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ai_team_requests" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ai_team_requests" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ai_team_requests_fk";
  
  DROP INDEX "payload_locked_documents_rels_ai_team_requests_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ai_team_requests_id";
  DROP TYPE "public"."enum_ai_team_requests_kind";
  DROP TYPE "public"."enum_ai_team_requests_status";`)
}
