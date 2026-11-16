import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ai_team_social_accounts_platform" AS ENUM('youtube', 'meta');
  CREATE TYPE "public"."enum_ai_team_social_accounts_status" AS ENUM('actif', 'erreur');
  ALTER TYPE "public"."enum_ai_team_members_portrait" ADD VALUE 'seo-reseaux';
  ALTER TYPE "public"."enum_ai_team_audits_kind" ADD VALUE 'reseaux';
  CREATE TABLE "ai_team_social_accounts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"platform" "enum_ai_team_social_accounts_platform" NOT NULL,
  	"label" varchar,
  	"external_id" varchar,
  	"ig_user_id" varchar,
  	"ig_username" varchar,
  	"account_email" varchar,
  	"token" varchar,
  	"status" "enum_ai_team_social_accounts_status" DEFAULT 'actif',
  	"last_error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ai_team_social_accounts_id" integer;
  CREATE UNIQUE INDEX "ai_team_social_accounts_platform_idx" ON "ai_team_social_accounts" USING btree ("platform");
  CREATE INDEX "ai_team_social_accounts_updated_at_idx" ON "ai_team_social_accounts" USING btree ("updated_at");
  CREATE INDEX "ai_team_social_accounts_created_at_idx" ON "ai_team_social_accounts" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_team_social_accounts_fk" FOREIGN KEY ("ai_team_social_accounts_id") REFERENCES "public"."ai_team_social_accounts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ai_team_social_accounts_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_team_social_accounts_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ai_team_social_accounts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ai_team_social_accounts" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ai_team_social_accounts_fk";
  
  ALTER TABLE "ai_team_members" ALTER COLUMN "portrait" SET DATA TYPE text;
  DROP TYPE "public"."enum_ai_team_members_portrait";
  CREATE TYPE "public"."enum_ai_team_members_portrait" AS ENUM('chef-sea', 'stratege', 'redacteur', 'directeur-artistique', 'controleur', 'meta-ads', 'google-ads', 'chatgpt-ads', 'mesure', 'chef-seo', 'seo-analyste', 'seo-concurrence', 'seo-contenu', 'seo-visibilite-ia', 'seo-technique', 'seo-autorite');
  ALTER TABLE "ai_team_members" ALTER COLUMN "portrait" SET DATA TYPE "public"."enum_ai_team_members_portrait" USING "portrait"::"public"."enum_ai_team_members_portrait";
  ALTER TABLE "ai_team_audits" ALTER COLUMN "kind" SET DATA TYPE text;
  ALTER TABLE "ai_team_audits" ALTER COLUMN "kind" SET DEFAULT 'site'::text;
  DROP TYPE "public"."enum_ai_team_audits_kind";
  CREATE TYPE "public"."enum_ai_team_audits_kind" AS ENUM('site', 'concurrence', 'contenu', 'ia', 'technique', 'autorite');
  ALTER TABLE "ai_team_audits" ALTER COLUMN "kind" SET DEFAULT 'site'::"public"."enum_ai_team_audits_kind";
  ALTER TABLE "ai_team_audits" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_ai_team_audits_kind" USING "kind"::"public"."enum_ai_team_audits_kind";
  DROP INDEX "payload_locked_documents_rels_ai_team_social_accounts_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ai_team_social_accounts_id";
  DROP TYPE "public"."enum_ai_team_social_accounts_platform";
  DROP TYPE "public"."enum_ai_team_social_accounts_status";`)
}
