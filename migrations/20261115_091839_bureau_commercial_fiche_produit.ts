import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ai_team_brief_quotes_tag" AS ENUM('douleur', 'declencheur', 'objection', 'alternative', 'resultat');
  ALTER TYPE "public"."enum_ai_team_members_domain" ADD VALUE 'com';
  ALTER TYPE "public"."enum_ai_team_members_portrait" ADD VALUE 'pipeline';
  ALTER TYPE "public"."enum_ai_team_members_portrait" ADD VALUE 'conversion';
  ALTER TYPE "public"."enum_ai_team_members_portrait" ADD VALUE 'chef-com';
  ALTER TYPE "public"."enum_ai_team_members_portrait" ADD VALUE 'essais';
  ALTER TYPE "public"."enum_ai_team_members_portrait" ADD VALUE 'clients';
  ALTER TYPE "public"."enum_ai_team_audits_kind" ADD VALUE 'pipeline';
  ALTER TYPE "public"."enum_ai_team_audits_kind" ADD VALUE 'conversion';
  ALTER TYPE "public"."enum_ai_team_audits_kind" ADD VALUE 'essais';
  ALTER TYPE "public"."enum_ai_team_audits_kind" ADD VALUE 'sante';
  ALTER TYPE "public"."enum_ai_team_goals_team" ADD VALUE 'com' BEFORE 'tous';
  ALTER TYPE "public"."enum_ai_team_actions_team" ADD VALUE 'com' BEFORE 'tous';
  ALTER TYPE "public"."enum_ad_ai_usage_kind" ADD VALUE 'commercial';
  CREATE TABLE "ai_team_brief_quotes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"quote" varchar NOT NULL,
  	"tag" "enum_ai_team_brief_quotes_tag",
  	"who" varchar,
  	"source" varchar
  );
  
  CREATE TABLE "ai_team_brief_changelog" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"at" timestamp(3) with time zone,
  	"change" varchar
  );
  
  CREATE TABLE "ai_team_brief" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"promesse" varchar,
  	"categorie" varchar,
  	"alternatives" varchar,
  	"differences" varchar,
  	"preuves" varchar,
  	"cible" varchar,
  	"declencheurs" varchar,
  	"hors_cible" varchar,
  	"decideurs" varchar,
  	"objections" varchar,
  	"messages" varchar,
  	"offre" varchar,
  	"mots" varchar,
  	"apprentissages" varchar,
  	"proposals" jsonb,
  	"proposed_at" timestamp(3) with time zone,
  	"version" numeric DEFAULT 1,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "ai_team_brief_quotes" ADD CONSTRAINT "ai_team_brief_quotes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ai_team_brief"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_team_brief_changelog" ADD CONSTRAINT "ai_team_brief_changelog_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ai_team_brief"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "ai_team_brief_quotes_order_idx" ON "ai_team_brief_quotes" USING btree ("_order");
  CREATE INDEX "ai_team_brief_quotes_parent_id_idx" ON "ai_team_brief_quotes" USING btree ("_parent_id");
  CREATE INDEX "ai_team_brief_changelog_order_idx" ON "ai_team_brief_changelog" USING btree ("_order");
  CREATE INDEX "ai_team_brief_changelog_parent_id_idx" ON "ai_team_brief_changelog" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "ai_team_brief_quotes" CASCADE;
  DROP TABLE "ai_team_brief_changelog" CASCADE;
  DROP TABLE "ai_team_brief" CASCADE;
  ALTER TABLE "ai_team_members" ALTER COLUMN "domain" SET DATA TYPE text;
  DROP TYPE "public"."enum_ai_team_members_domain";
  CREATE TYPE "public"."enum_ai_team_members_domain" AS ENUM('sea', 'seo');
  ALTER TABLE "ai_team_members" ALTER COLUMN "domain" SET DATA TYPE "public"."enum_ai_team_members_domain" USING "domain"::"public"."enum_ai_team_members_domain";
  ALTER TABLE "ai_team_members" ALTER COLUMN "portrait" SET DATA TYPE text;
  DROP TYPE "public"."enum_ai_team_members_portrait";
  CREATE TYPE "public"."enum_ai_team_members_portrait" AS ENUM('chef-sea', 'stratege', 'redacteur', 'directeur-artistique', 'controleur', 'meta-ads', 'google-ads', 'chatgpt-ads', 'mesure', 'chef-seo', 'seo-analyste', 'seo-concurrence', 'seo-contenu', 'seo-visibilite-ia', 'seo-technique', 'seo-autorite', 'seo-reseaux');
  ALTER TABLE "ai_team_members" ALTER COLUMN "portrait" SET DATA TYPE "public"."enum_ai_team_members_portrait" USING "portrait"::"public"."enum_ai_team_members_portrait";
  ALTER TABLE "ai_team_audits" ALTER COLUMN "kind" SET DATA TYPE text;
  ALTER TABLE "ai_team_audits" ALTER COLUMN "kind" SET DEFAULT 'site'::text;
  DROP TYPE "public"."enum_ai_team_audits_kind";
  CREATE TYPE "public"."enum_ai_team_audits_kind" AS ENUM('site', 'concurrence', 'contenu', 'ia', 'technique', 'autorite', 'reseaux');
  ALTER TABLE "ai_team_audits" ALTER COLUMN "kind" SET DEFAULT 'site'::"public"."enum_ai_team_audits_kind";
  ALTER TABLE "ai_team_audits" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_ai_team_audits_kind" USING "kind"::"public"."enum_ai_team_audits_kind";
  ALTER TABLE "ai_team_goals" ALTER COLUMN "team" SET DATA TYPE text;
  DROP TYPE "public"."enum_ai_team_goals_team";
  CREATE TYPE "public"."enum_ai_team_goals_team" AS ENUM('sea', 'seo', 'tous');
  ALTER TABLE "ai_team_goals" ALTER COLUMN "team" SET DATA TYPE "public"."enum_ai_team_goals_team" USING "team"::"public"."enum_ai_team_goals_team";
  ALTER TABLE "ai_team_actions" ALTER COLUMN "team" SET DATA TYPE text;
  ALTER TABLE "ai_team_actions" ALTER COLUMN "team" SET DEFAULT 'tous'::text;
  DROP TYPE "public"."enum_ai_team_actions_team";
  CREATE TYPE "public"."enum_ai_team_actions_team" AS ENUM('sea', 'seo', 'tous');
  ALTER TABLE "ai_team_actions" ALTER COLUMN "team" SET DEFAULT 'tous'::"public"."enum_ai_team_actions_team";
  ALTER TABLE "ai_team_actions" ALTER COLUMN "team" SET DATA TYPE "public"."enum_ai_team_actions_team" USING "team"::"public"."enum_ai_team_actions_team";
  ALTER TABLE "ad_ai_usage" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_ad_ai_usage_kind";
  CREATE TYPE "public"."enum_ad_ai_usage_kind" AS ENUM('texte', 'image', 'video', 'agent', 'seo');
  ALTER TABLE "ad_ai_usage" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_ad_ai_usage_kind" USING "kind"::"public"."enum_ad_ai_usage_kind";
  DROP TYPE "public"."enum_ai_team_brief_quotes_tag";`)
}
