import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ad_campaigns_status" AS ENUM('brouillon', 'active', 'en-pause', 'terminee');
  CREATE TYPE "public"."enum_ad_campaigns_objective" AS ENUM('leads', 'trafic', 'notoriete', 'autre');
  CREATE TYPE "public"."enum_ad_accounts_status" AS ENUM('sans-jeton', 'connecte', 'expire', 'erreur');
  CREATE TYPE "public"."enum_ad_metrics_daily_level" AS ENUM('campaign', 'adset', 'ad');
  ALTER TYPE "public"."enum_partner_clients_source" ADD VALUE 'meta-facebook' BEFORE 'site-vitrine';
  ALTER TYPE "public"."enum_partner_clients_source" ADD VALUE 'meta-instagram' BEFORE 'site-vitrine';
  ALTER TYPE "public"."enum__partner_clients_v_version_source" ADD VALUE 'meta-facebook' BEFORE 'site-vitrine';
  ALTER TYPE "public"."enum__partner_clients_v_version_source" ADD VALUE 'meta-instagram' BEFORE 'site-vitrine';
  ALTER TYPE "public"."enum_forms_default_channel" ADD VALUE 'meta-facebook';
  ALTER TYPE "public"."enum_forms_default_channel" ADD VALUE 'meta-instagram';
  ALTER TYPE "public"."enum_form_submissions_channel" ADD VALUE 'meta-facebook';
  ALTER TYPE "public"."enum_form_submissions_channel" ADD VALUE 'meta-instagram';
  CREATE TABLE "ad_campaigns" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"account_id" integer NOT NULL,
  	"external_id" varchar,
  	"status" "enum_ad_campaigns_status" DEFAULT 'brouillon',
  	"objective" "enum_ad_campaigns_objective",
  	"daily_budget" numeric,
  	"platform" varchar NOT NULL,
  	"external_status" varchar,
  	"last_sync_at" timestamp(3) with time zone,
  	"kpis" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ad_accounts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"external_id" varchar NOT NULL,
  	"platform" varchar DEFAULT 'meta' NOT NULL,
  	"status" "enum_ad_accounts_status" DEFAULT 'sans-jeton',
  	"last_error" varchar,
  	"last_sync_at" timestamp(3) with time zone,
  	"currency" varchar DEFAULT 'EUR',
  	"timezone" varchar,
  	"monthly_cap_eur" numeric,
  	"token_expires_at" timestamp(3) with time zone,
  	"system_user_token" varchar,
  	"token" varchar,
  	"token_alert_sent_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ad_metrics_daily" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"day" varchar NOT NULL,
  	"account_id" integer NOT NULL,
  	"platform" varchar NOT NULL,
  	"level" "enum_ad_metrics_daily_level" NOT NULL,
  	"external_id" varchar NOT NULL,
  	"name" varchar,
  	"campaign_external_id" varchar,
  	"currency" varchar,
  	"spend" numeric DEFAULT 0,
  	"impressions" numeric DEFAULT 0,
  	"clicks" numeric DEFAULT 0,
  	"leads" numeric DEFAULT 0,
  	"qualified_leads" numeric DEFAULT 0,
  	"won" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ads_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"enabled" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "form_submissions" ADD COLUMN "fbclid" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_campaigns_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_accounts_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_metrics_daily_id" integer;
  ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_account_id_ad_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_metrics_daily" ADD CONSTRAINT "ad_metrics_daily_account_id_ad_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ad_campaigns_account_idx" ON "ad_campaigns" USING btree ("account_id");
  CREATE INDEX "ad_campaigns_external_id_idx" ON "ad_campaigns" USING btree ("external_id");
  CREATE INDEX "ad_campaigns_status_idx" ON "ad_campaigns" USING btree ("status");
  CREATE INDEX "ad_campaigns_platform_idx" ON "ad_campaigns" USING btree ("platform");
  CREATE INDEX "ad_campaigns_updated_at_idx" ON "ad_campaigns" USING btree ("updated_at");
  CREATE INDEX "ad_campaigns_created_at_idx" ON "ad_campaigns" USING btree ("created_at");
  CREATE UNIQUE INDEX "platform_externalId_idx" ON "ad_campaigns" USING btree ("platform","external_id");
  CREATE INDEX "ad_accounts_external_id_idx" ON "ad_accounts" USING btree ("external_id");
  CREATE INDEX "ad_accounts_platform_idx" ON "ad_accounts" USING btree ("platform");
  CREATE INDEX "ad_accounts_status_idx" ON "ad_accounts" USING btree ("status");
  CREATE INDEX "ad_accounts_updated_at_idx" ON "ad_accounts" USING btree ("updated_at");
  CREATE INDEX "ad_accounts_created_at_idx" ON "ad_accounts" USING btree ("created_at");
  CREATE UNIQUE INDEX "platform_externalId_1_idx" ON "ad_accounts" USING btree ("platform","external_id");
  CREATE INDEX "ad_metrics_daily_day_idx" ON "ad_metrics_daily" USING btree ("day");
  CREATE INDEX "ad_metrics_daily_account_idx" ON "ad_metrics_daily" USING btree ("account_id");
  CREATE INDEX "ad_metrics_daily_platform_idx" ON "ad_metrics_daily" USING btree ("platform");
  CREATE INDEX "ad_metrics_daily_level_idx" ON "ad_metrics_daily" USING btree ("level");
  CREATE INDEX "ad_metrics_daily_external_id_idx" ON "ad_metrics_daily" USING btree ("external_id");
  CREATE INDEX "ad_metrics_daily_campaign_external_id_idx" ON "ad_metrics_daily" USING btree ("campaign_external_id");
  CREATE INDEX "ad_metrics_daily_updated_at_idx" ON "ad_metrics_daily" USING btree ("updated_at");
  CREATE INDEX "ad_metrics_daily_created_at_idx" ON "ad_metrics_daily" USING btree ("created_at");
  CREATE UNIQUE INDEX "platform_level_externalId_day_idx" ON "ad_metrics_daily" USING btree ("platform","level","external_id","day");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_campaigns_fk" FOREIGN KEY ("ad_campaigns_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_accounts_fk" FOREIGN KEY ("ad_accounts_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_metrics_daily_fk" FOREIGN KEY ("ad_metrics_daily_id") REFERENCES "public"."ad_metrics_daily"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ad_campaigns_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_campaigns_id");
  CREATE INDEX "payload_locked_documents_rels_ad_accounts_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_accounts_id");
  CREATE INDEX "payload_locked_documents_rels_ad_metrics_daily_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_metrics_daily_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ad_campaigns" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ad_accounts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ad_metrics_daily" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ads_settings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ad_campaigns" CASCADE;
  DROP TABLE "ad_accounts" CASCADE;
  DROP TABLE "ad_metrics_daily" CASCADE;
  DROP TABLE "ads_settings" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_campaigns_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_accounts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_metrics_daily_fk";
  
  ALTER TABLE "partner_clients" ALTER COLUMN "source" SET DATA TYPE text;
  ALTER TABLE "partner_clients" ALTER COLUMN "source" SET DEFAULT 'manuelle'::text;
  DROP TYPE "public"."enum_partner_clients_source";
  CREATE TYPE "public"."enum_partner_clients_source" AS ENUM('manuelle', 'site-vitrine-seo', 'google-ads-sea', 'chatgpt-ads-sea', 'site-vitrine');
  ALTER TABLE "partner_clients" ALTER COLUMN "source" SET DEFAULT 'manuelle'::"public"."enum_partner_clients_source";
  ALTER TABLE "partner_clients" ALTER COLUMN "source" SET DATA TYPE "public"."enum_partner_clients_source" USING "source"::"public"."enum_partner_clients_source";
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_source" SET DATA TYPE text;
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_source" SET DEFAULT 'manuelle'::text;
  DROP TYPE "public"."enum__partner_clients_v_version_source";
  CREATE TYPE "public"."enum__partner_clients_v_version_source" AS ENUM('manuelle', 'site-vitrine-seo', 'google-ads-sea', 'chatgpt-ads-sea', 'site-vitrine');
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_source" SET DEFAULT 'manuelle'::"public"."enum__partner_clients_v_version_source";
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_source" SET DATA TYPE "public"."enum__partner_clients_v_version_source" USING "version_source"::"public"."enum__partner_clients_v_version_source";
  ALTER TABLE "forms" ALTER COLUMN "default_channel" SET DATA TYPE text;
  ALTER TABLE "forms" ALTER COLUMN "default_channel" SET DEFAULT 'seo'::text;
  DROP TYPE "public"."enum_forms_default_channel";
  CREATE TYPE "public"."enum_forms_default_channel" AS ENUM('seo', 'sea', 'chatgpt');
  ALTER TABLE "forms" ALTER COLUMN "default_channel" SET DEFAULT 'seo'::"public"."enum_forms_default_channel";
  ALTER TABLE "forms" ALTER COLUMN "default_channel" SET DATA TYPE "public"."enum_forms_default_channel" USING "default_channel"::"public"."enum_forms_default_channel";
  ALTER TABLE "form_submissions" ALTER COLUMN "channel" SET DATA TYPE text;
  DROP TYPE "public"."enum_form_submissions_channel";
  CREATE TYPE "public"."enum_form_submissions_channel" AS ENUM('seo', 'sea', 'chatgpt');
  ALTER TABLE "form_submissions" ALTER COLUMN "channel" SET DATA TYPE "public"."enum_form_submissions_channel" USING "channel"::"public"."enum_form_submissions_channel";
  DROP INDEX "payload_locked_documents_rels_ad_campaigns_id_idx";
  DROP INDEX "payload_locked_documents_rels_ad_accounts_id_idx";
  DROP INDEX "payload_locked_documents_rels_ad_metrics_daily_id_idx";
  ALTER TABLE "form_submissions" DROP COLUMN "fbclid";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_campaigns_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_accounts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_metrics_daily_id";
  DROP TYPE "public"."enum_ad_campaigns_status";
  DROP TYPE "public"."enum_ad_campaigns_objective";
  DROP TYPE "public"."enum_ad_accounts_status";
  DROP TYPE "public"."enum_ad_metrics_daily_level";`)
}
