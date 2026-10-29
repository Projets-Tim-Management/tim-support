import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// ADDITIVE — générée par scripts/db-migrate-additive.ts (schéma d'avant fusionné : l'ancien moteur vidéo reste en base jusqu'au temps 2).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ad_objects_level" AS ENUM('adset', 'ad');
  CREATE TABLE "ad_objects" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"platform" varchar NOT NULL,
	"level" "enum_ad_objects_level" NOT NULL,
	"external_id" varchar NOT NULL,
	"name" varchar,
	"campaign_external_id" varchar,
	"adset_external_id" varchar,
	"status" varchar,
	"effective_status" varchar,
	"daily_budget" numeric,
	"issues" jsonb,
	"reach7d" numeric,
	"frequency7d" numeric,
	"synced_at" timestamp(3) with time zone,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);

  ALTER TABLE "ad_metrics_daily" ADD COLUMN "site_leads" numeric DEFAULT 0;
  ALTER TABLE "ad_metrics_daily" ADD COLUMN "reach" numeric DEFAULT 0;
  ALTER TABLE "ad_metrics_daily" ADD COLUMN "link_clicks" numeric DEFAULT 0;
  ALTER TABLE "ad_metrics_daily" ADD COLUMN "landing_views" numeric DEFAULT 0;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_objects_id" integer;
  ALTER TABLE "ad_objects" ADD CONSTRAINT "ad_objects_account_id_ad_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ad_objects_account_idx" ON "ad_objects" USING btree ("account_id");
  CREATE INDEX "ad_objects_platform_idx" ON "ad_objects" USING btree ("platform");
  CREATE INDEX "ad_objects_level_idx" ON "ad_objects" USING btree ("level");
  CREATE INDEX "ad_objects_external_id_idx" ON "ad_objects" USING btree ("external_id");
  CREATE INDEX "ad_objects_campaign_external_id_idx" ON "ad_objects" USING btree ("campaign_external_id");
  CREATE INDEX "ad_objects_adset_external_id_idx" ON "ad_objects" USING btree ("adset_external_id");
  CREATE INDEX "ad_objects_effective_status_idx" ON "ad_objects" USING btree ("effective_status");
  CREATE INDEX "ad_objects_updated_at_idx" ON "ad_objects" USING btree ("updated_at");
  CREATE INDEX "ad_objects_created_at_idx" ON "ad_objects" USING btree ("created_at");
  CREATE UNIQUE INDEX "platform_externalId_2_idx" ON "ad_objects" USING btree ("platform","external_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_objects_fk" FOREIGN KEY ("ad_objects_id") REFERENCES "public"."ad_objects"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ad_objects_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_objects_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ad_objects" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ad_objects" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_objects_fk";

  DROP INDEX "payload_locked_documents_rels_ad_objects_id_idx";
  ALTER TABLE "ad_metrics_daily" DROP COLUMN "site_leads";
  ALTER TABLE "ad_metrics_daily" DROP COLUMN "reach";
  ALTER TABLE "ad_metrics_daily" DROP COLUMN "link_clicks";
  ALTER TABLE "ad_metrics_daily" DROP COLUMN "landing_views";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_objects_id";
  DROP TYPE "public"."enum_ad_objects_level";`)
}
