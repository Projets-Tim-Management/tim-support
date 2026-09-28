import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_partner_clients_engagement_months" AS ENUM('1', '3', '6', '12', '24', '36');
  CREATE TYPE "public"."enum_partner_clients_legal_form" AS ENUM('sas', 'sasu', 'sarl', 'eurl', 'sa', 'snc', 'ei', 'autre');
  CREATE TYPE "public"."enum__partner_clients_v_version_engagement_months" AS ENUM('1', '3', '6', '12', '24', '36');
  CREATE TYPE "public"."enum__partner_clients_v_version_legal_form" AS ENUM('sas', 'sasu', 'sarl', 'eurl', 'sa', 'snc', 'ei', 'autre');
  CREATE TYPE "public"."enum_contract_settings_sections_kind" AS ENUM('preambule', 'article', 'annexe');
  CREATE TABLE "contract_settings_sections" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"kind" "enum_contract_settings_sections_kind" DEFAULT 'article',
  	"key" varchar,
  	"body" varchar
  );
  
  CREATE TABLE "contract_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"template_version" numeric,
  	"provider_denomination" varchar,
  	"provider_forme_sociale" varchar,
  	"provider_adresse" varchar,
  	"provider_ville_rcs" varchar,
  	"provider_numero_rcs" varchar,
  	"provider_representant" varchar,
  	"provider_qualite" varchar,
  	"provider_tribunal" varchar,
  	"bank_iban" varchar,
  	"bank_bic" varchar,
  	"defaults_notice_period" varchar DEFAULT 'un (1) mois',
  	"defaults_price_notice_delay" varchar DEFAULT 'quinze (15) jours',
  	"defaults_debit_day" numeric DEFAULT 5,
  	"defaults_territory" varchar DEFAULT 'France',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "partner_clients" ADD COLUMN "engagement_months" "enum_partner_clients_engagement_months";
  ALTER TABLE "partner_clients" ADD COLUMN "preferential_years" numeric;
  ALTER TABLE "partner_clients" ADD COLUMN "contract_territory" varchar;
  ALTER TABLE "partner_clients" ADD COLUMN "integration_fee" numeric;
  ALTER TABLE "partner_clients" ADD COLUMN "integration_offered" boolean;
  ALTER TABLE "partner_clients" ADD COLUMN "legal_form" "enum_partner_clients_legal_form";
  ALTER TABLE "partner_clients" ADD COLUMN "share_capital" numeric;
  ALTER TABLE "partner_clients" ADD COLUMN "rcs_city" varchar;
  ALTER TABLE "partner_clients" ADD COLUMN "representative_first_name" varchar;
  ALTER TABLE "partner_clients" ADD COLUMN "representative_last_name" varchar;
  ALTER TABLE "partner_clients" ADD COLUMN "representative_role" varchar;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_engagement_months" "enum__partner_clients_v_version_engagement_months";
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_preferential_years" numeric;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_contract_territory" varchar;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_integration_fee" numeric;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_integration_offered" boolean;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_legal_form" "enum__partner_clients_v_version_legal_form";
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_share_capital" numeric;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_rcs_city" varchar;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_representative_first_name" varchar;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_representative_last_name" varchar;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_representative_role" varchar;
  ALTER TABLE "contract_settings_sections" ADD CONSTRAINT "contract_settings_sections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."contract_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "contract_settings_sections_order_idx" ON "contract_settings_sections" USING btree ("_order");
  CREATE INDEX "contract_settings_sections_parent_id_idx" ON "contract_settings_sections" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "contract_settings_sections" CASCADE;
  DROP TABLE "contract_settings" CASCADE;
  ALTER TABLE "partner_clients" DROP COLUMN "engagement_months";
  ALTER TABLE "partner_clients" DROP COLUMN "preferential_years";
  ALTER TABLE "partner_clients" DROP COLUMN "contract_territory";
  ALTER TABLE "partner_clients" DROP COLUMN "integration_fee";
  ALTER TABLE "partner_clients" DROP COLUMN "integration_offered";
  ALTER TABLE "partner_clients" DROP COLUMN "legal_form";
  ALTER TABLE "partner_clients" DROP COLUMN "share_capital";
  ALTER TABLE "partner_clients" DROP COLUMN "rcs_city";
  ALTER TABLE "partner_clients" DROP COLUMN "representative_first_name";
  ALTER TABLE "partner_clients" DROP COLUMN "representative_last_name";
  ALTER TABLE "partner_clients" DROP COLUMN "representative_role";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_engagement_months";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_preferential_years";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_contract_territory";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_integration_fee";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_integration_offered";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_legal_form";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_share_capital";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_rcs_city";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_representative_first_name";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_representative_last_name";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_representative_role";
  DROP TYPE "public"."enum_partner_clients_engagement_months";
  DROP TYPE "public"."enum_partner_clients_legal_form";
  DROP TYPE "public"."enum__partner_clients_v_version_engagement_months";
  DROP TYPE "public"."enum__partner_clients_v_version_legal_form";
  DROP TYPE "public"."enum_contract_settings_sections_kind";`)
}
