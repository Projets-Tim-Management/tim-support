import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ai_team_audits_kind" AS ENUM('site', 'concurrence');
  CREATE TYPE "public"."enum_ai_team_competitor_maps_status" AS ENUM('lu', 'illisible');
  CREATE TYPE "public"."enum_ad_competitors_usages" AS ENUM('sea', 'seo');
  CREATE TYPE "public"."enum_ad_competitors_kind" AS ENUM('editeur', 'comparateur', 'media');
  ALTER TYPE "public"."enum_ai_team_members_portrait" ADD VALUE 'seo-concurrence';
  CREATE TABLE "ai_team_competitor_maps" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"competitor_id" integer NOT NULL,
  	"week" varchar NOT NULL,
  	"status" "enum_ai_team_competitor_maps_status" NOT NULL,
  	"count" numeric,
  	"urls" jsonb,
  	"added" jsonb,
  	"removed" jsonb,
  	"error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ad_competitors_usages" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_ad_competitors_usages",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "ai_team_audits" ADD COLUMN "kind" "enum_ai_team_audits_kind" DEFAULT 'site';
  ALTER TABLE "ad_competitors" ADD COLUMN "website" varchar;
  ALTER TABLE "ad_competitors" ADD COLUMN "kind" "enum_ad_competitors_kind" DEFAULT 'editeur';
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ai_team_competitor_maps_id" integer;
  ALTER TABLE "ai_team_competitor_maps" ADD CONSTRAINT "ai_team_competitor_maps_competitor_id_ad_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."ad_competitors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_competitors_usages" ADD CONSTRAINT "ad_competitors_usages_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ad_competitors"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "ai_team_competitor_maps_competitor_idx" ON "ai_team_competitor_maps" USING btree ("competitor_id");
  CREATE INDEX "ai_team_competitor_maps_week_idx" ON "ai_team_competitor_maps" USING btree ("week");
  CREATE INDEX "ai_team_competitor_maps_updated_at_idx" ON "ai_team_competitor_maps" USING btree ("updated_at");
  CREATE INDEX "ai_team_competitor_maps_created_at_idx" ON "ai_team_competitor_maps" USING btree ("created_at");
  CREATE INDEX "ad_competitors_usages_order_idx" ON "ad_competitors_usages" USING btree ("order");
  CREATE INDEX "ad_competitors_usages_parent_idx" ON "ad_competitors_usages" USING btree ("parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_team_competitor_maps_fk" FOREIGN KEY ("ai_team_competitor_maps_id") REFERENCES "public"."ai_team_competitor_maps"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "ai_team_audits_kind_idx" ON "ai_team_audits" USING btree ("kind");
  CREATE INDEX "payload_locked_documents_rels_ai_team_competitor_maps_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_team_competitor_maps_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ai_team_competitor_maps" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ad_competitors_usages" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ai_team_competitor_maps" CASCADE;
  DROP TABLE "ad_competitors_usages" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ai_team_competitor_maps_fk";
  
  ALTER TABLE "ai_team_members" ALTER COLUMN "portrait" SET DATA TYPE text;
  DROP TYPE "public"."enum_ai_team_members_portrait";
  CREATE TYPE "public"."enum_ai_team_members_portrait" AS ENUM('chef-sea', 'stratege', 'redacteur', 'directeur-artistique', 'controleur', 'meta-ads', 'google-ads', 'chatgpt-ads', 'mesure', 'chef-seo', 'seo-analyste');
  ALTER TABLE "ai_team_members" ALTER COLUMN "portrait" SET DATA TYPE "public"."enum_ai_team_members_portrait" USING "portrait"::"public"."enum_ai_team_members_portrait";
  DROP INDEX "ai_team_audits_kind_idx";
  DROP INDEX "payload_locked_documents_rels_ai_team_competitor_maps_id_idx";
  ALTER TABLE "ai_team_audits" DROP COLUMN "kind";
  ALTER TABLE "ad_competitors" DROP COLUMN "website";
  ALTER TABLE "ad_competitors" DROP COLUMN "kind";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ai_team_competitor_maps_id";
  DROP TYPE "public"."enum_ai_team_audits_kind";
  DROP TYPE "public"."enum_ai_team_competitor_maps_status";
  DROP TYPE "public"."enum_ad_competitors_usages";
  DROP TYPE "public"."enum_ad_competitors_kind";`)
}
