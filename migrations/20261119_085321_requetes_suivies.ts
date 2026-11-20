import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_seo_keywords_source" AS ENUM('article', 'fiche', 'page', 'classee', 'opportunite', 'manuel', 'agent');
  CREATE TABLE "seo_keywords" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"keyword" varchar NOT NULL,
  	"keyword_key" varchar,
  	"source" "enum_seo_keywords_source" DEFAULT 'manuel',
  	"tracked" boolean DEFAULT true,
  	"target_url" varchar,
  	"position" numeric,
  	"position_change" numeric,
  	"best_position" numeric,
  	"position_url" varchar,
  	"volume" numeric,
  	"difficulty" numeric,
  	"intent" varchar,
  	"cpc" numeric,
  	"top1_domain" varchar,
  	"ai_overview" boolean,
  	"ai_cited" boolean,
  	"ai_sources" jsonb,
  	"top10" jsonb,
  	"competitors_ranking" jsonb,
  	"coverage" numeric,
  	"coverage_target" numeric,
  	"coverage_gaps" jsonb,
  	"checked_at" timestamp(3) with time zone,
  	"page_checked_at" timestamp(3) with time zone,
  	"metrics_at" timestamp(3) with time zone,
  	"history" jsonb,
  	"serp" jsonb,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "seo_market" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"ran_at" timestamp(3) with time zone,
  	"cost_usd" numeric,
  	"our_keywords" numeric,
  	"our_top10" numeric,
  	"competitors" jsonb,
  	"errors" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "seo_keywords_id" integer;
  CREATE UNIQUE INDEX "seo_keywords_keyword_key_idx" ON "seo_keywords" USING btree ("keyword_key");
  CREATE INDEX "seo_keywords_source_idx" ON "seo_keywords" USING btree ("source");
  CREATE INDEX "seo_keywords_tracked_idx" ON "seo_keywords" USING btree ("tracked");
  CREATE INDEX "seo_keywords_position_idx" ON "seo_keywords" USING btree ("position");
  CREATE INDEX "seo_keywords_volume_idx" ON "seo_keywords" USING btree ("volume");
  CREATE INDEX "seo_keywords_checked_at_idx" ON "seo_keywords" USING btree ("checked_at");
  CREATE INDEX "seo_keywords_updated_at_idx" ON "seo_keywords" USING btree ("updated_at");
  CREATE INDEX "seo_keywords_created_at_idx" ON "seo_keywords" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_seo_keywords_fk" FOREIGN KEY ("seo_keywords_id") REFERENCES "public"."seo_keywords"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_seo_keywords_id_idx" ON "payload_locked_documents_rels" USING btree ("seo_keywords_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "seo_keywords" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "seo_market" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "seo_keywords" CASCADE;
  DROP TABLE "seo_market" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_seo_keywords_fk";
  
  DROP INDEX "payload_locked_documents_rels_seo_keywords_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "seo_keywords_id";
  DROP TYPE "public"."enum_seo_keywords_source";`)
}
