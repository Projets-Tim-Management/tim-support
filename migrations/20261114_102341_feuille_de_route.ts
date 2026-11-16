import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ai_team_goals_team" AS ENUM('sea', 'seo');
  CREATE TYPE "public"."enum_ai_team_goals_horizon" AS ENUM('court', 'moyen', 'long');
  CREATE TYPE "public"."enum_ai_team_goals_status" AS ENUM('propose', 'valide', 'atteint', 'manque', 'abandonne');
  CREATE TYPE "public"."enum_ai_team_goals_metric" AS ENUM('seo-leads-qualifies', 'seo-clics-hors-marque', 'seo-conversion', 'ia-mentions', 'pages-indexees', 'autorite-presence', 'reseaux-interactions', 'sea-leads-qualifies', 'sea-cout-lead-qualifie', 'leads-qualifies-total');
  CREATE TABLE "ai_team_goals" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"team" "enum_ai_team_goals_team" NOT NULL,
  	"horizon" "enum_ai_team_goals_horizon" NOT NULL,
  	"status" "enum_ai_team_goals_status" DEFAULT 'propose' NOT NULL,
  	"title" varchar NOT NULL,
  	"metric" "enum_ai_team_goals_metric" NOT NULL,
  	"baseline" numeric,
  	"target" numeric NOT NULL,
  	"due_date" timestamp(3) with time zone NOT NULL,
  	"why" varchar,
  	"member_id" integer,
  	"start_date" timestamp(3) with time zone,
  	"validated_at" timestamp(3) with time zone,
  	"review" varchar,
  	"reviewed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "ai_team_snapshots" ADD COLUMN "metrics" jsonb;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ai_team_goals_id" integer;
  ALTER TABLE "ai_team_goals" ADD CONSTRAINT "ai_team_goals_member_id_ai_team_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."ai_team_members"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ai_team_goals_team_idx" ON "ai_team_goals" USING btree ("team");
  CREATE INDEX "ai_team_goals_status_idx" ON "ai_team_goals" USING btree ("status");
  CREATE INDEX "ai_team_goals_member_idx" ON "ai_team_goals" USING btree ("member_id");
  CREATE INDEX "ai_team_goals_updated_at_idx" ON "ai_team_goals" USING btree ("updated_at");
  CREATE INDEX "ai_team_goals_created_at_idx" ON "ai_team_goals" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_team_goals_fk" FOREIGN KEY ("ai_team_goals_id") REFERENCES "public"."ai_team_goals"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ai_team_goals_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_team_goals_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ai_team_goals" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ai_team_goals" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ai_team_goals_fk";
  
  DROP INDEX "payload_locked_documents_rels_ai_team_goals_id_idx";
  ALTER TABLE "ai_team_snapshots" DROP COLUMN "metrics";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ai_team_goals_id";
  DROP TYPE "public"."enum_ai_team_goals_team";
  DROP TYPE "public"."enum_ai_team_goals_horizon";
  DROP TYPE "public"."enum_ai_team_goals_status";
  DROP TYPE "public"."enum_ai_team_goals_metric";`)
}
