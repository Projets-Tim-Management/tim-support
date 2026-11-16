import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ai_team_goals_kind" AS ENUM('chiffre', 'jalon');
  CREATE TYPE "public"."enum_ai_team_actions_who" AS ENUM('direction', 'dev', 'commerciaux', 'marketing', 'support', 'prestataire', 'autre');
  CREATE TYPE "public"."enum_ai_team_actions_team" AS ENUM('sea', 'seo', 'tous');
  CREATE TYPE "public"."enum_ai_team_actions_status" AS ENUM('prevue', 'en-cours', 'faite', 'abandonnee');
  CREATE TYPE "public"."enum_ai_team_actions_outcome" AS ENUM('a-marche', 'sans-effet', 'a-empire');
  ALTER TYPE "public"."enum_ai_team_goals_team" ADD VALUE 'tous';
  CREATE TABLE "ai_team_actions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"who" "enum_ai_team_actions_who" DEFAULT 'direction' NOT NULL,
  	"team" "enum_ai_team_actions_team" DEFAULT 'tous' NOT NULL,
  	"status" "enum_ai_team_actions_status" DEFAULT 'prevue' NOT NULL,
  	"planned_date" timestamp(3) with time zone,
  	"done_date" timestamp(3) with time zone,
  	"goal_id" integer,
  	"notes" varchar,
  	"author_id" integer,
  	"outcome" "enum_ai_team_actions_outcome",
  	"verdict" varchar,
  	"verdict_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "ai_team_goals" ALTER COLUMN "metric" SET DATA TYPE varchar;
  ALTER TABLE "ai_team_goals" ALTER COLUMN "metric" DROP NOT NULL;
  ALTER TABLE "ai_team_goals" ALTER COLUMN "target" DROP NOT NULL;
  ALTER TABLE "ai_team_objectives" ADD COLUMN "goal_id" integer;
  ALTER TABLE "ai_team_goals" ADD COLUMN "kind" "enum_ai_team_goals_kind" DEFAULT 'chiffre' NOT NULL;
  ALTER TABLE "ai_team_goals" ADD COLUMN "param" varchar;
  ALTER TABLE "ai_team_goals" ADD COLUMN "measures" jsonb;
  ALTER TABLE "ai_team_goals" ADD COLUMN "author_id" integer;
  ALTER TABLE "ai_team_requests" ADD COLUMN "goal_id" integer;
  ALTER TABLE "ai_team_snapshots" ADD COLUMN "reconstituted" boolean DEFAULT false;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ai_team_actions_id" integer;
  ALTER TABLE "ai_team_actions" ADD CONSTRAINT "ai_team_actions_goal_id_ai_team_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."ai_team_goals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_team_actions" ADD CONSTRAINT "ai_team_actions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ai_team_actions_team_idx" ON "ai_team_actions" USING btree ("team");
  CREATE INDEX "ai_team_actions_status_idx" ON "ai_team_actions" USING btree ("status");
  CREATE INDEX "ai_team_actions_goal_idx" ON "ai_team_actions" USING btree ("goal_id");
  CREATE INDEX "ai_team_actions_author_idx" ON "ai_team_actions" USING btree ("author_id");
  CREATE INDEX "ai_team_actions_updated_at_idx" ON "ai_team_actions" USING btree ("updated_at");
  CREATE INDEX "ai_team_actions_created_at_idx" ON "ai_team_actions" USING btree ("created_at");
  ALTER TABLE "ai_team_objectives" ADD CONSTRAINT "ai_team_objectives_goal_id_ai_team_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."ai_team_goals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_team_goals" ADD CONSTRAINT "ai_team_goals_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_team_requests" ADD CONSTRAINT "ai_team_requests_goal_id_ai_team_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."ai_team_goals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_team_actions_fk" FOREIGN KEY ("ai_team_actions_id") REFERENCES "public"."ai_team_actions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "ai_team_objectives_goal_idx" ON "ai_team_objectives" USING btree ("goal_id");
  CREATE INDEX "ai_team_goals_author_idx" ON "ai_team_goals" USING btree ("author_id");
  CREATE INDEX "ai_team_requests_goal_idx" ON "ai_team_requests" USING btree ("goal_id");
  CREATE INDEX "ai_team_snapshots_reconstituted_idx" ON "ai_team_snapshots" USING btree ("reconstituted");
  CREATE INDEX "payload_locked_documents_rels_ai_team_actions_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_team_actions_id");
  DROP TYPE "public"."enum_ai_team_goals_metric";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ai_team_goals_metric" AS ENUM('seo-leads-qualifies', 'seo-clics-hors-marque', 'seo-conversion', 'ia-mentions', 'pages-indexees', 'autorite-presence', 'reseaux-interactions', 'sea-leads-qualifies', 'sea-cout-lead-qualifie', 'leads-qualifies-total');
  ALTER TABLE "ai_team_actions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ai_team_actions" CASCADE;
  ALTER TABLE "ai_team_objectives" DROP CONSTRAINT "ai_team_objectives_goal_id_ai_team_goals_id_fk";
  
  ALTER TABLE "ai_team_goals" DROP CONSTRAINT "ai_team_goals_author_id_users_id_fk";
  
  ALTER TABLE "ai_team_requests" DROP CONSTRAINT "ai_team_requests_goal_id_ai_team_goals_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ai_team_actions_fk";
  
  ALTER TABLE "ai_team_goals" ALTER COLUMN "team" SET DATA TYPE text;
  DROP TYPE "public"."enum_ai_team_goals_team";
  CREATE TYPE "public"."enum_ai_team_goals_team" AS ENUM('sea', 'seo');
  ALTER TABLE "ai_team_goals" ALTER COLUMN "team" SET DATA TYPE "public"."enum_ai_team_goals_team" USING "team"::"public"."enum_ai_team_goals_team";
  DROP INDEX "ai_team_objectives_goal_idx";
  DROP INDEX "ai_team_goals_author_idx";
  DROP INDEX "ai_team_requests_goal_idx";
  DROP INDEX "ai_team_snapshots_reconstituted_idx";
  DROP INDEX "payload_locked_documents_rels_ai_team_actions_id_idx";
  ALTER TABLE "ai_team_goals" ALTER COLUMN "metric" SET DATA TYPE "public"."enum_ai_team_goals_metric" USING "metric"::"public"."enum_ai_team_goals_metric";
  ALTER TABLE "ai_team_goals" ALTER COLUMN "metric" SET NOT NULL;
  ALTER TABLE "ai_team_goals" ALTER COLUMN "target" SET NOT NULL;
  ALTER TABLE "ai_team_objectives" DROP COLUMN "goal_id";
  ALTER TABLE "ai_team_goals" DROP COLUMN "kind";
  ALTER TABLE "ai_team_goals" DROP COLUMN "param";
  ALTER TABLE "ai_team_goals" DROP COLUMN "measures";
  ALTER TABLE "ai_team_goals" DROP COLUMN "author_id";
  ALTER TABLE "ai_team_requests" DROP COLUMN "goal_id";
  ALTER TABLE "ai_team_snapshots" DROP COLUMN "reconstituted";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ai_team_actions_id";
  DROP TYPE "public"."enum_ai_team_goals_kind";
  DROP TYPE "public"."enum_ai_team_actions_who";
  DROP TYPE "public"."enum_ai_team_actions_team";
  DROP TYPE "public"."enum_ai_team_actions_status";
  DROP TYPE "public"."enum_ai_team_actions_outcome";`)
}
