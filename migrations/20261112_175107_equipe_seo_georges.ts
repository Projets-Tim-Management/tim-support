import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ai_team_ai_answers_engine" AS ENUM('chatgpt', 'perplexity', 'gemini', 'claude');
  CREATE TYPE "public"."enum_ai_team_ai_answers_status" AS ENUM('fait', 'echec');
  ALTER TYPE "public"."enum_ai_team_members_portrait" ADD VALUE 'seo-visibilite-ia';
  ALTER TYPE "public"."enum_ai_team_audits_kind" ADD VALUE 'ia';
  CREATE TABLE "ai_team_ai_answers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"member_id" integer NOT NULL,
  	"period" varchar NOT NULL,
  	"engine" "enum_ai_team_ai_answers_engine" NOT NULL,
  	"question" varchar NOT NULL,
  	"draw" numeric NOT NULL,
  	"status" "enum_ai_team_ai_answers_status" NOT NULL,
  	"mentioned" boolean,
  	"cited" boolean,
  	"position" numeric,
  	"brands" jsonb,
  	"sources" jsonb,
  	"model" varchar,
  	"searches" numeric,
  	"excerpt" varchar,
  	"cost_eur" numeric,
  	"error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "ai_team_audits" ADD COLUMN "measure" jsonb;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ai_team_ai_answers_id" integer;
  ALTER TABLE "ai_team_ai_answers" ADD CONSTRAINT "ai_team_ai_answers_member_id_ai_team_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."ai_team_members"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ai_team_ai_answers_member_idx" ON "ai_team_ai_answers" USING btree ("member_id");
  CREATE INDEX "ai_team_ai_answers_period_idx" ON "ai_team_ai_answers" USING btree ("period");
  CREATE INDEX "ai_team_ai_answers_updated_at_idx" ON "ai_team_ai_answers" USING btree ("updated_at");
  CREATE INDEX "ai_team_ai_answers_created_at_idx" ON "ai_team_ai_answers" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_team_ai_answers_fk" FOREIGN KEY ("ai_team_ai_answers_id") REFERENCES "public"."ai_team_ai_answers"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ai_team_ai_answers_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_team_ai_answers_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ai_team_ai_answers" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ai_team_ai_answers" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ai_team_ai_answers_fk";
  
  ALTER TABLE "ai_team_members" ALTER COLUMN "portrait" SET DATA TYPE text;
  DROP TYPE "public"."enum_ai_team_members_portrait";
  CREATE TYPE "public"."enum_ai_team_members_portrait" AS ENUM('chef-sea', 'stratege', 'redacteur', 'directeur-artistique', 'controleur', 'meta-ads', 'google-ads', 'chatgpt-ads', 'mesure', 'chef-seo', 'seo-analyste', 'seo-concurrence', 'seo-contenu');
  ALTER TABLE "ai_team_members" ALTER COLUMN "portrait" SET DATA TYPE "public"."enum_ai_team_members_portrait" USING "portrait"::"public"."enum_ai_team_members_portrait";
  ALTER TABLE "ai_team_audits" ALTER COLUMN "kind" SET DATA TYPE text;
  ALTER TABLE "ai_team_audits" ALTER COLUMN "kind" SET DEFAULT 'site'::text;
  DROP TYPE "public"."enum_ai_team_audits_kind";
  CREATE TYPE "public"."enum_ai_team_audits_kind" AS ENUM('site', 'concurrence', 'contenu');
  ALTER TABLE "ai_team_audits" ALTER COLUMN "kind" SET DEFAULT 'site'::"public"."enum_ai_team_audits_kind";
  ALTER TABLE "ai_team_audits" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_ai_team_audits_kind" USING "kind"::"public"."enum_ai_team_audits_kind";
  DROP INDEX "payload_locked_documents_rels_ai_team_ai_answers_id_idx";
  ALTER TABLE "ai_team_audits" DROP COLUMN "measure";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ai_team_ai_answers_id";
  DROP TYPE "public"."enum_ai_team_ai_answers_engine";
  DROP TYPE "public"."enum_ai_team_ai_answers_status";`)
}
