import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ai_team_audits_status" AS ENUM('en-cours', 'fait', 'echec');
  ALTER TYPE "public"."enum_ai_team_members_portrait" ADD VALUE 'seo-analyste';
  CREATE TABLE "ai_team_audits" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"member_id" integer NOT NULL,
  	"period" varchar NOT NULL,
  	"status" "enum_ai_team_audits_status" DEFAULT 'en-cours' NOT NULL,
  	"summary" varchar,
  	"findings" jsonb,
  	"funnel" jsonb,
  	"searches" numeric,
  	"cost_eur" numeric,
  	"error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ai_team_audits_id" integer;
  ALTER TABLE "ai_team_audits" ADD CONSTRAINT "ai_team_audits_member_id_ai_team_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."ai_team_members"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ai_team_audits_member_idx" ON "ai_team_audits" USING btree ("member_id");
  CREATE INDEX "ai_team_audits_period_idx" ON "ai_team_audits" USING btree ("period");
  CREATE INDEX "ai_team_audits_updated_at_idx" ON "ai_team_audits" USING btree ("updated_at");
  CREATE INDEX "ai_team_audits_created_at_idx" ON "ai_team_audits" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_team_audits_fk" FOREIGN KEY ("ai_team_audits_id") REFERENCES "public"."ai_team_audits"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ai_team_audits_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_team_audits_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ai_team_audits" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ai_team_audits" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ai_team_audits_fk";
  
  ALTER TABLE "ai_team_members" ALTER COLUMN "portrait" SET DATA TYPE text;
  DROP TYPE "public"."enum_ai_team_members_portrait";
  CREATE TYPE "public"."enum_ai_team_members_portrait" AS ENUM('chef-sea', 'stratege', 'redacteur', 'directeur-artistique', 'controleur', 'meta-ads', 'google-ads', 'chatgpt-ads', 'mesure', 'chef-seo');
  ALTER TABLE "ai_team_members" ALTER COLUMN "portrait" SET DATA TYPE "public"."enum_ai_team_members_portrait" USING "portrait"::"public"."enum_ai_team_members_portrait";
  DROP INDEX "payload_locked_documents_rels_ai_team_audits_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ai_team_audits_id";
  DROP TYPE "public"."enum_ai_team_audits_status";`)
}
