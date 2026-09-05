import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_partner_clients_source" ADD VALUE 'chatgpt-ads-sea' BEFORE 'site-vitrine';
  ALTER TYPE "public"."enum__partner_clients_v_version_source" ADD VALUE 'chatgpt-ads-sea' BEFORE 'site-vitrine';
  ALTER TYPE "public"."enum_forms_default_channel" ADD VALUE 'chatgpt';
  ALTER TYPE "public"."enum_form_submissions_channel" ADD VALUE 'chatgpt';
  ALTER TABLE "form_submissions" ADD COLUMN "oaiclid" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients" ALTER COLUMN "source" SET DATA TYPE text;
  ALTER TABLE "partner_clients" ALTER COLUMN "source" SET DEFAULT 'manuelle'::text;
  DROP TYPE "public"."enum_partner_clients_source";
  CREATE TYPE "public"."enum_partner_clients_source" AS ENUM('manuelle', 'site-vitrine-seo', 'google-ads-sea', 'site-vitrine');
  ALTER TABLE "partner_clients" ALTER COLUMN "source" SET DEFAULT 'manuelle'::"public"."enum_partner_clients_source";
  ALTER TABLE "partner_clients" ALTER COLUMN "source" SET DATA TYPE "public"."enum_partner_clients_source" USING "source"::"public"."enum_partner_clients_source";
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_source" SET DATA TYPE text;
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_source" SET DEFAULT 'manuelle'::text;
  DROP TYPE "public"."enum__partner_clients_v_version_source";
  CREATE TYPE "public"."enum__partner_clients_v_version_source" AS ENUM('manuelle', 'site-vitrine-seo', 'google-ads-sea', 'site-vitrine');
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_source" SET DEFAULT 'manuelle'::"public"."enum__partner_clients_v_version_source";
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_source" SET DATA TYPE "public"."enum__partner_clients_v_version_source" USING "version_source"::"public"."enum__partner_clients_v_version_source";
  ALTER TABLE "forms" ALTER COLUMN "default_channel" SET DATA TYPE text;
  ALTER TABLE "forms" ALTER COLUMN "default_channel" SET DEFAULT 'seo'::text;
  DROP TYPE "public"."enum_forms_default_channel";
  CREATE TYPE "public"."enum_forms_default_channel" AS ENUM('seo', 'sea');
  ALTER TABLE "forms" ALTER COLUMN "default_channel" SET DEFAULT 'seo'::"public"."enum_forms_default_channel";
  ALTER TABLE "forms" ALTER COLUMN "default_channel" SET DATA TYPE "public"."enum_forms_default_channel" USING "default_channel"::"public"."enum_forms_default_channel";
  ALTER TABLE "form_submissions" ALTER COLUMN "channel" SET DATA TYPE text;
  DROP TYPE "public"."enum_form_submissions_channel";
  CREATE TYPE "public"."enum_form_submissions_channel" AS ENUM('seo', 'sea');
  ALTER TABLE "form_submissions" ALTER COLUMN "channel" SET DATA TYPE "public"."enum_form_submissions_channel" USING "channel"::"public"."enum_form_submissions_channel";
  ALTER TABLE "form_submissions" DROP COLUMN "oaiclid";`)
}
