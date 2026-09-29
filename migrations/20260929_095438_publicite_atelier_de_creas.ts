import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ad_campaigns_brief_cta" AS ENUM('en-savoir-plus', 's-inscrire', 'reserver');
  CREATE TYPE "public"."enum_ad_campaigns_brief_tone" AS ENUM('vous', 'tu');
  CREATE TYPE "public"."enum_ad_creatives_tests_dimension" AS ENUM('ton', 'angle', 'accroche', 'format', 'visuel', 'cta');
  CREATE TYPE "public"."enum_ad_creatives_texts_kind" AS ENUM('principal', 'titre', 'description');
  CREATE TYPE "public"."enum_ad_creatives_texts_tone" AS ENUM('vous', 'tu');
  CREATE TYPE "public"."enum_ad_creatives_texts_status" AS ENUM('ok', 'rejete');
  CREATE TYPE "public"."enum_ad_creatives_assets_format" AS ENUM('1x1', '4x5', '9x16');
  CREATE TYPE "public"."enum_ad_creatives_assets_type" AS ENUM('image', 'video');
  CREATE TYPE "public"."enum_ad_creatives_tone" AS ENUM('vous', 'tu');
  CREATE TYPE "public"."enum_ad_creatives_cta" AS ENUM('en-savoir-plus', 's-inscrire', 'reserver');
  CREATE TYPE "public"."enum_ad_creatives_status" AS ENUM('brouillon', 'a-valider', 'validee', 'refusee', 'en-ligne', 'retiree');
  CREATE TYPE "public"."enum_ad_creatives_refusal_reason" AS ENUM('hors-marque', 'faux', 'mal-ecrit', 'visuel', 'doublon', 'autre');
  CREATE TYPE "public"."enum_ad_creatives_origin" AS ENUM('generee', 'agent', 'manuelle');
  CREATE TYPE "public"."enum_ad_media_kind" AS ENUM('logo', 'police', 'capture', 'photo', 'musique', 'fond', 'crea');
  CREATE TYPE "public"."enum_ad_media_platform" AS ENUM('web', 'mobile');
  CREATE TYPE "public"."enum_ad_ai_usage_kind" AS ENUM('texte', 'image', 'video');
  CREATE TYPE "public"."enum_ads_brand_kit_fonts_role" AS ENUM('titre', 'texte');
  CREATE TYPE "public"."enum_ads_brand_kit_default_tone" AS ENUM('vous', 'tu');
  CREATE TABLE "ad_campaigns_brief_angles" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"angle" varchar NOT NULL
  );
  
  CREATE TABLE "ad_campaigns_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"ad_facts_id" integer
  );
  
  CREATE TABLE "ad_creatives_tests" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"dimension" "enum_ad_creatives_tests_dimension" NOT NULL,
  	"value" varchar NOT NULL
  );
  
  CREATE TABLE "ad_creatives_texts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kind" "enum_ad_creatives_texts_kind" NOT NULL,
  	"tone" "enum_ad_creatives_texts_tone" NOT NULL,
  	"chars" numeric,
  	"status" "enum_ad_creatives_texts_status" NOT NULL,
  	"reason" varchar,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "ad_creatives_assets" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"format" "enum_ad_creatives_assets_format" NOT NULL,
  	"type" "enum_ad_creatives_assets_type" NOT NULL,
  	"template" varchar,
  	"media_id" integer NOT NULL
  );
  
  CREATE TABLE "ad_creatives" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"angle" varchar NOT NULL,
  	"hook" varchar,
  	"campaign_id" integer NOT NULL,
  	"tone" "enum_ad_creatives_tone" DEFAULT 'vous' NOT NULL,
  	"cta" "enum_ad_creatives_cta",
  	"status" "enum_ad_creatives_status" DEFAULT 'brouillon',
  	"is_test" boolean DEFAULT false,
  	"refusal_reason" "enum_ad_creatives_refusal_reason",
  	"refusal_detail" varchar,
  	"decided_by_id" integer,
  	"decided_at" timestamp(3) with time zone,
  	"origin" "enum_ad_creatives_origin" DEFAULT 'generee',
  	"generation_model" varchar,
  	"generation_cost_eur" numeric,
  	"generation_batch" varchar,
  	"performance" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ad_creatives_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"ad_facts_id" integer
  );
  
  CREATE TABLE "ad_media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"kind" "enum_ad_media_kind" NOT NULL,
  	"alt" varchar,
  	"platform" "enum_ad_media_platform",
  	"feature" varchar,
  	"no_client_data" boolean,
  	"rights" varchar,
  	"license" varchar,
  	"prefix" varchar DEFAULT 'ads',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric
  );
  
  CREATE TABLE "ad_facts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"statement" varchar NOT NULL,
  	"source" varchar NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"source_url" varchar,
  	"active" boolean DEFAULT true,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ad_ai_usage" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"kind" "enum_ad_ai_usage_kind" NOT NULL,
  	"provider" varchar,
  	"model" varchar,
  	"eur" numeric NOT NULL,
  	"usd" numeric,
  	"campaign_id" integer,
  	"batch" varchar,
  	"detail" varchar,
  	"usage" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ads_brand_kit_forbidden" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"term" varchar NOT NULL,
  	"reason" varchar
  );
  
  CREATE TABLE "ads_brand_kit_fonts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"role" "enum_ads_brand_kit_fonts_role" NOT NULL,
  	"weight" numeric DEFAULT 400,
  	"file_id" integer NOT NULL
  );
  
  CREATE TABLE "ads_brand_kit" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"default_tone" "enum_ads_brand_kit_default_tone" DEFAULT 'vous' NOT NULL,
  	"voice" varchar,
  	"good_examples" varchar,
  	"bad_examples" varchar,
  	"logo_on_dark_id" integer,
  	"advertiser" varchar,
  	"legal_notice" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "ad_campaigns" ALTER COLUMN "account_id" DROP NOT NULL;
  ALTER TABLE "ad_campaigns" ALTER COLUMN "platform" SET DEFAULT 'meta';
  ALTER TABLE "ad_campaigns" ADD COLUMN "brief_audience" varchar;
  ALTER TABLE "ad_campaigns" ADD COLUMN "brief_pain" varchar;
  ALTER TABLE "ad_campaigns" ADD COLUMN "brief_offer" varchar;
  ALTER TABLE "ad_campaigns" ADD COLUMN "brief_promise" varchar;
  ALTER TABLE "ad_campaigns" ADD COLUMN "brief_forbidden" varchar;
  ALTER TABLE "ad_campaigns" ADD COLUMN "brief_landing_url" varchar;
  ALTER TABLE "ad_campaigns" ADD COLUMN "brief_cta" "enum_ad_campaigns_brief_cta" DEFAULT 'en-savoir-plus';
  ALTER TABLE "ad_campaigns" ADD COLUMN "brief_tone" "enum_ad_campaigns_brief_tone" DEFAULT 'vous';
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_creatives_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_media_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_facts_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_ai_usage_id" integer;
  ALTER TABLE "ads_settings" ADD COLUMN "text_daily_eur" numeric DEFAULT 5 NOT NULL;
  ALTER TABLE "ads_settings" ADD COLUMN "text_monthly_eur" numeric DEFAULT 50 NOT NULL;
  ALTER TABLE "ads_settings" ADD COLUMN "images_monthly_eur" numeric DEFAULT 20 NOT NULL;
  ALTER TABLE "ads_settings" ADD COLUMN "video_monthly_eur" numeric DEFAULT 30 NOT NULL;
  ALTER TABLE "ads_settings" ADD COLUMN "creatives_per_campaign_per_week" numeric DEFAULT 6 NOT NULL;
  ALTER TABLE "ad_campaigns_brief_angles" ADD CONSTRAINT "ad_campaigns_brief_angles_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ad_campaigns_rels" ADD CONSTRAINT "ad_campaigns_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ad_campaigns_rels" ADD CONSTRAINT "ad_campaigns_rels_ad_facts_fk" FOREIGN KEY ("ad_facts_id") REFERENCES "public"."ad_facts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ad_creatives_tests" ADD CONSTRAINT "ad_creatives_tests_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ad_creatives"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ad_creatives_texts" ADD CONSTRAINT "ad_creatives_texts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ad_creatives"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ad_creatives_assets" ADD CONSTRAINT "ad_creatives_assets_media_id_ad_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."ad_media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_creatives_assets" ADD CONSTRAINT "ad_creatives_assets_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ad_creatives"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_creatives_rels" ADD CONSTRAINT "ad_creatives_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ad_creatives"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ad_creatives_rels" ADD CONSTRAINT "ad_creatives_rels_ad_facts_fk" FOREIGN KEY ("ad_facts_id") REFERENCES "public"."ad_facts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ad_ai_usage" ADD CONSTRAINT "ad_ai_usage_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ads_brand_kit_forbidden" ADD CONSTRAINT "ads_brand_kit_forbidden_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ads_brand_kit"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ads_brand_kit_fonts" ADD CONSTRAINT "ads_brand_kit_fonts_file_id_ad_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."ad_media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ads_brand_kit_fonts" ADD CONSTRAINT "ads_brand_kit_fonts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ads_brand_kit"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ads_brand_kit" ADD CONSTRAINT "ads_brand_kit_logo_on_dark_id_ad_media_id_fk" FOREIGN KEY ("logo_on_dark_id") REFERENCES "public"."ad_media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ad_campaigns_brief_angles_order_idx" ON "ad_campaigns_brief_angles" USING btree ("_order");
  CREATE INDEX "ad_campaigns_brief_angles_parent_id_idx" ON "ad_campaigns_brief_angles" USING btree ("_parent_id");
  CREATE INDEX "ad_campaigns_rels_order_idx" ON "ad_campaigns_rels" USING btree ("order");
  CREATE INDEX "ad_campaigns_rels_parent_idx" ON "ad_campaigns_rels" USING btree ("parent_id");
  CREATE INDEX "ad_campaigns_rels_path_idx" ON "ad_campaigns_rels" USING btree ("path");
  CREATE INDEX "ad_campaigns_rels_ad_facts_id_idx" ON "ad_campaigns_rels" USING btree ("ad_facts_id");
  CREATE INDEX "ad_creatives_tests_order_idx" ON "ad_creatives_tests" USING btree ("_order");
  CREATE INDEX "ad_creatives_tests_parent_id_idx" ON "ad_creatives_tests" USING btree ("_parent_id");
  CREATE INDEX "ad_creatives_texts_order_idx" ON "ad_creatives_texts" USING btree ("_order");
  CREATE INDEX "ad_creatives_texts_parent_id_idx" ON "ad_creatives_texts" USING btree ("_parent_id");
  CREATE INDEX "ad_creatives_assets_order_idx" ON "ad_creatives_assets" USING btree ("_order");
  CREATE INDEX "ad_creatives_assets_parent_id_idx" ON "ad_creatives_assets" USING btree ("_parent_id");
  CREATE INDEX "ad_creatives_assets_media_idx" ON "ad_creatives_assets" USING btree ("media_id");
  CREATE INDEX "ad_creatives_campaign_idx" ON "ad_creatives" USING btree ("campaign_id");
  CREATE INDEX "ad_creatives_tone_idx" ON "ad_creatives" USING btree ("tone");
  CREATE INDEX "ad_creatives_status_idx" ON "ad_creatives" USING btree ("status");
  CREATE INDEX "ad_creatives_is_test_idx" ON "ad_creatives" USING btree ("is_test");
  CREATE INDEX "ad_creatives_decided_by_idx" ON "ad_creatives" USING btree ("decided_by_id");
  CREATE INDEX "ad_creatives_generation_generation_batch_idx" ON "ad_creatives" USING btree ("generation_batch");
  CREATE INDEX "ad_creatives_updated_at_idx" ON "ad_creatives" USING btree ("updated_at");
  CREATE INDEX "ad_creatives_created_at_idx" ON "ad_creatives" USING btree ("created_at");
  CREATE INDEX "ad_creatives_rels_order_idx" ON "ad_creatives_rels" USING btree ("order");
  CREATE INDEX "ad_creatives_rels_parent_idx" ON "ad_creatives_rels" USING btree ("parent_id");
  CREATE INDEX "ad_creatives_rels_path_idx" ON "ad_creatives_rels" USING btree ("path");
  CREATE INDEX "ad_creatives_rels_ad_facts_id_idx" ON "ad_creatives_rels" USING btree ("ad_facts_id");
  CREATE INDEX "ad_media_kind_idx" ON "ad_media" USING btree ("kind");
  CREATE INDEX "ad_media_feature_idx" ON "ad_media" USING btree ("feature");
  CREATE INDEX "ad_media_updated_at_idx" ON "ad_media" USING btree ("updated_at");
  CREATE INDEX "ad_media_created_at_idx" ON "ad_media" USING btree ("created_at");
  CREATE UNIQUE INDEX "ad_media_filename_idx" ON "ad_media" USING btree ("filename");
  CREATE INDEX "ad_facts_active_idx" ON "ad_facts" USING btree ("active");
  CREATE INDEX "ad_facts_updated_at_idx" ON "ad_facts" USING btree ("updated_at");
  CREATE INDEX "ad_facts_created_at_idx" ON "ad_facts" USING btree ("created_at");
  CREATE INDEX "ad_ai_usage_kind_idx" ON "ad_ai_usage" USING btree ("kind");
  CREATE INDEX "ad_ai_usage_campaign_idx" ON "ad_ai_usage" USING btree ("campaign_id");
  CREATE INDEX "ad_ai_usage_batch_idx" ON "ad_ai_usage" USING btree ("batch");
  CREATE INDEX "ad_ai_usage_updated_at_idx" ON "ad_ai_usage" USING btree ("updated_at");
  CREATE INDEX "ad_ai_usage_created_at_idx" ON "ad_ai_usage" USING btree ("created_at");
  CREATE INDEX "ads_brand_kit_forbidden_order_idx" ON "ads_brand_kit_forbidden" USING btree ("_order");
  CREATE INDEX "ads_brand_kit_forbidden_parent_id_idx" ON "ads_brand_kit_forbidden" USING btree ("_parent_id");
  CREATE INDEX "ads_brand_kit_fonts_order_idx" ON "ads_brand_kit_fonts" USING btree ("_order");
  CREATE INDEX "ads_brand_kit_fonts_parent_id_idx" ON "ads_brand_kit_fonts" USING btree ("_parent_id");
  CREATE INDEX "ads_brand_kit_fonts_file_idx" ON "ads_brand_kit_fonts" USING btree ("file_id");
  CREATE INDEX "ads_brand_kit_logo_on_dark_idx" ON "ads_brand_kit" USING btree ("logo_on_dark_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_creatives_fk" FOREIGN KEY ("ad_creatives_id") REFERENCES "public"."ad_creatives"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_media_fk" FOREIGN KEY ("ad_media_id") REFERENCES "public"."ad_media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_facts_fk" FOREIGN KEY ("ad_facts_id") REFERENCES "public"."ad_facts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_ai_usage_fk" FOREIGN KEY ("ad_ai_usage_id") REFERENCES "public"."ad_ai_usage"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ad_creatives_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_creatives_id");
  CREATE INDEX "payload_locked_documents_rels_ad_media_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_media_id");
  CREATE INDEX "payload_locked_documents_rels_ad_facts_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_facts_id");
  CREATE INDEX "payload_locked_documents_rels_ad_ai_usage_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_ai_usage_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ad_campaigns_brief_angles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ad_campaigns_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ad_creatives_tests" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ad_creatives_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ad_creatives_assets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ad_creatives" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ad_creatives_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ad_media" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ad_facts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ad_ai_usage" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ads_brand_kit_forbidden" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ads_brand_kit_fonts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ads_brand_kit" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ad_campaigns_brief_angles" CASCADE;
  DROP TABLE "ad_campaigns_rels" CASCADE;
  DROP TABLE "ad_creatives_tests" CASCADE;
  DROP TABLE "ad_creatives_texts" CASCADE;
  DROP TABLE "ad_creatives_assets" CASCADE;
  DROP TABLE "ad_creatives" CASCADE;
  DROP TABLE "ad_creatives_rels" CASCADE;
  DROP TABLE "ad_media" CASCADE;
  DROP TABLE "ad_facts" CASCADE;
  DROP TABLE "ad_ai_usage" CASCADE;
  DROP TABLE "ads_brand_kit_forbidden" CASCADE;
  DROP TABLE "ads_brand_kit_fonts" CASCADE;
  DROP TABLE "ads_brand_kit" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_creatives_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_media_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_facts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_ai_usage_fk";
  
  DROP INDEX "payload_locked_documents_rels_ad_creatives_id_idx";
  DROP INDEX "payload_locked_documents_rels_ad_media_id_idx";
  DROP INDEX "payload_locked_documents_rels_ad_facts_id_idx";
  DROP INDEX "payload_locked_documents_rels_ad_ai_usage_id_idx";
  ALTER TABLE "ad_campaigns" ALTER COLUMN "account_id" SET NOT NULL;
  ALTER TABLE "ad_campaigns" ALTER COLUMN "platform" DROP DEFAULT;
  ALTER TABLE "ad_campaigns" DROP COLUMN "brief_audience";
  ALTER TABLE "ad_campaigns" DROP COLUMN "brief_pain";
  ALTER TABLE "ad_campaigns" DROP COLUMN "brief_offer";
  ALTER TABLE "ad_campaigns" DROP COLUMN "brief_promise";
  ALTER TABLE "ad_campaigns" DROP COLUMN "brief_forbidden";
  ALTER TABLE "ad_campaigns" DROP COLUMN "brief_landing_url";
  ALTER TABLE "ad_campaigns" DROP COLUMN "brief_cta";
  ALTER TABLE "ad_campaigns" DROP COLUMN "brief_tone";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_creatives_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_media_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_facts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_ai_usage_id";
  ALTER TABLE "ads_settings" DROP COLUMN "text_daily_eur";
  ALTER TABLE "ads_settings" DROP COLUMN "text_monthly_eur";
  ALTER TABLE "ads_settings" DROP COLUMN "images_monthly_eur";
  ALTER TABLE "ads_settings" DROP COLUMN "video_monthly_eur";
  ALTER TABLE "ads_settings" DROP COLUMN "creatives_per_campaign_per_week";
  DROP TYPE "public"."enum_ad_campaigns_brief_cta";
  DROP TYPE "public"."enum_ad_campaigns_brief_tone";
  DROP TYPE "public"."enum_ad_creatives_tests_dimension";
  DROP TYPE "public"."enum_ad_creatives_texts_kind";
  DROP TYPE "public"."enum_ad_creatives_texts_tone";
  DROP TYPE "public"."enum_ad_creatives_texts_status";
  DROP TYPE "public"."enum_ad_creatives_assets_format";
  DROP TYPE "public"."enum_ad_creatives_assets_type";
  DROP TYPE "public"."enum_ad_creatives_tone";
  DROP TYPE "public"."enum_ad_creatives_cta";
  DROP TYPE "public"."enum_ad_creatives_status";
  DROP TYPE "public"."enum_ad_creatives_refusal_reason";
  DROP TYPE "public"."enum_ad_creatives_origin";
  DROP TYPE "public"."enum_ad_media_kind";
  DROP TYPE "public"."enum_ad_media_platform";
  DROP TYPE "public"."enum_ad_ai_usage_kind";
  DROP TYPE "public"."enum_ads_brand_kit_fonts_role";
  DROP TYPE "public"."enum_ads_brand_kit_default_tone";`)
}
