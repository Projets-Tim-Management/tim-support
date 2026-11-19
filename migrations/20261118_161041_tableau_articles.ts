import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_articles_status" AS ENUM('idee', 'validee', 'redaction', 'a-verifier', 'image', 'pret', 'programme', 'publie', 'a-rafraichir', 'depublie');
  CREATE TYPE "public"."enum_articles_theme_source" AS ENUM('auto', 'manuel');
  CREATE TYPE "public"."enum_articles_intent" AS ENUM('tofu', 'mofu', 'bofu');
  CREATE TYPE "public"."enum_articles_origin" AS ENUM('import-wordpress', 'equipe-seo', 'manuel');
  CREATE TYPE "public"."enum_article_themes_kind" AS ENUM('trafic', 'vente');
  CREATE TABLE "articles_deadlines" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"reason" varchar NOT NULL
  );
  
  CREATE TABLE "articles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"status" "enum_articles_status" DEFAULT 'idee' NOT NULL,
  	"theme_id" integer,
  	"theme_source" "enum_articles_theme_source",
  	"subtheme" varchar,
  	"intent" "enum_articles_intent",
  	"published_at" timestamp(3) with time zone,
  	"title" varchar NOT NULL,
  	"slug" varchar,
  	"keyword" varchar,
  	"secondary_keywords" varchar,
  	"notes" varchar,
  	"keep_seo_title" boolean,
  	"redirect_to" numeric,
  	"origin" "enum_articles_origin",
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"wp_focus_keyword" varchar,
  	"wp_id" numeric,
  	"wp_status" varchar,
  	"wp_author" numeric,
  	"wp_link" varchar,
  	"word_count" numeric,
  	"faq_count" numeric,
  	"sources_count" numeric,
  	"has_tldr" boolean,
  	"assistance_ia" boolean,
  	"reviewed_by" varchar,
  	"reviewed_on" timestamp(3) with time zone,
  	"updated_on_wp" timestamp(3) with time zone,
  	"wp_modified" timestamp(3) with time zone,
  	"synced_at" timestamp(3) with time zone,
  	"wp_categories" jsonb,
  	"acf" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "article_themes_subthemes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL
  );
  
  CREATE TABLE "article_themes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"number" numeric NOT NULL,
  	"priority" numeric,
  	"kind" "enum_article_themes_kind" DEFAULT 'trafic' NOT NULL,
  	"pillar" varchar,
  	"pillar_url" varchar,
  	"module" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "articles_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "article_themes_id" integer;
  ALTER TABLE "articles_deadlines" ADD CONSTRAINT "articles_deadlines_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_theme_id_article_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."article_themes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "article_themes_subthemes" ADD CONSTRAINT "article_themes_subthemes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."article_themes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "articles_deadlines_order_idx" ON "articles_deadlines" USING btree ("_order");
  CREATE INDEX "articles_deadlines_parent_id_idx" ON "articles_deadlines" USING btree ("_parent_id");
  CREATE INDEX "articles_status_idx" ON "articles" USING btree ("status");
  CREATE INDEX "articles_theme_idx" ON "articles" USING btree ("theme_id");
  CREATE INDEX "articles_published_at_idx" ON "articles" USING btree ("published_at");
  CREATE INDEX "articles_slug_idx" ON "articles" USING btree ("slug");
  CREATE UNIQUE INDEX "articles_wp_id_idx" ON "articles" USING btree ("wp_id");
  CREATE INDEX "articles_wp_modified_idx" ON "articles" USING btree ("wp_modified");
  CREATE INDEX "articles_updated_at_idx" ON "articles" USING btree ("updated_at");
  CREATE INDEX "articles_created_at_idx" ON "articles" USING btree ("created_at");
  CREATE INDEX "article_themes_subthemes_order_idx" ON "article_themes_subthemes" USING btree ("_order");
  CREATE INDEX "article_themes_subthemes_parent_id_idx" ON "article_themes_subthemes" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "article_themes_number_idx" ON "article_themes" USING btree ("number");
  CREATE INDEX "article_themes_updated_at_idx" ON "article_themes" USING btree ("updated_at");
  CREATE INDEX "article_themes_created_at_idx" ON "article_themes" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_articles_fk" FOREIGN KEY ("articles_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_article_themes_fk" FOREIGN KEY ("article_themes_id") REFERENCES "public"."article_themes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_articles_id_idx" ON "payload_locked_documents_rels" USING btree ("articles_id");
  CREATE INDEX "payload_locked_documents_rels_article_themes_id_idx" ON "payload_locked_documents_rels" USING btree ("article_themes_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "articles_deadlines" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "articles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "article_themes_subthemes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "article_themes" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "articles_deadlines" CASCADE;
  DROP TABLE "articles" CASCADE;
  DROP TABLE "article_themes_subthemes" CASCADE;
  DROP TABLE "article_themes" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_articles_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_article_themes_fk";
  
  DROP INDEX "payload_locked_documents_rels_articles_id_idx";
  DROP INDEX "payload_locked_documents_rels_article_themes_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "articles_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "article_themes_id";
  DROP TYPE "public"."enum_articles_status";
  DROP TYPE "public"."enum_articles_theme_source";
  DROP TYPE "public"."enum_articles_intent";
  DROP TYPE "public"."enum_articles_origin";
  DROP TYPE "public"."enum_article_themes_kind";`)
}
