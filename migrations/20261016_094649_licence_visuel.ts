import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_client_contacts_licence_profile" ADD VALUE 'visuel';
  ALTER TYPE "public"."enum_client_employees_licence_profile" ADD VALUE 'visuel';
  ALTER TYPE "public"."enum_training_sessions_profiles" ADD VALUE 'visuel';
  ALTER TYPE "public"."enum_training_settings_programmes_profile" ADD VALUE 'visuel';
  ALTER TABLE "partner_clients" ADD COLUMN "licences_visuel_qty" numeric DEFAULT 0;
  ALTER TABLE "partner_clients" ADD COLUMN "licences_visuel_price" numeric DEFAULT 2.2;
  ALTER TABLE "partner_clients" ADD COLUMN "licences_visuel_discount_pct" numeric DEFAULT 0;
  ALTER TABLE "partner_clients" ADD COLUMN "licences_visuel_discount_amount" numeric DEFAULT 0;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_visuel_qty" numeric DEFAULT 0;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_visuel_price" numeric DEFAULT 2.2;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_visuel_discount_pct" numeric DEFAULT 0;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_visuel_discount_amount" numeric DEFAULT 0;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_contacts" ALTER COLUMN "licence_profile" SET DATA TYPE text;
  DROP TYPE "public"."enum_client_contacts_licence_profile";
  CREATE TYPE "public"."enum_client_contacts_licence_profile" AS ENUM('admin', 'conducteur', 'chefChantier', 'chefEquipe', 'compagnon');
  ALTER TABLE "client_contacts" ALTER COLUMN "licence_profile" SET DATA TYPE "public"."enum_client_contacts_licence_profile" USING "licence_profile"::"public"."enum_client_contacts_licence_profile";
  ALTER TABLE "client_employees" ALTER COLUMN "licence_profile" SET DATA TYPE text;
  DROP TYPE "public"."enum_client_employees_licence_profile";
  CREATE TYPE "public"."enum_client_employees_licence_profile" AS ENUM('admin', 'conducteur', 'chefChantier', 'chefEquipe', 'compagnon');
  ALTER TABLE "client_employees" ALTER COLUMN "licence_profile" SET DATA TYPE "public"."enum_client_employees_licence_profile" USING "licence_profile"::"public"."enum_client_employees_licence_profile";
  ALTER TABLE "training_sessions_profiles" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_training_sessions_profiles";
  CREATE TYPE "public"."enum_training_sessions_profiles" AS ENUM('admin', 'conducteur', 'chefChantier', 'chefEquipe', 'compagnon');
  ALTER TABLE "training_sessions_profiles" ALTER COLUMN "value" SET DATA TYPE "public"."enum_training_sessions_profiles" USING "value"::"public"."enum_training_sessions_profiles";
  ALTER TABLE "training_settings_programmes" ALTER COLUMN "profile" SET DATA TYPE text;
  DROP TYPE "public"."enum_training_settings_programmes_profile";
  CREATE TYPE "public"."enum_training_settings_programmes_profile" AS ENUM('admin', 'conducteur', 'chefChantier', 'chefEquipe', 'compagnon');
  ALTER TABLE "training_settings_programmes" ALTER COLUMN "profile" SET DATA TYPE "public"."enum_training_settings_programmes_profile" USING "profile"::"public"."enum_training_settings_programmes_profile";
  ALTER TABLE "partner_clients" DROP COLUMN "licences_visuel_qty";
  ALTER TABLE "partner_clients" DROP COLUMN "licences_visuel_price";
  ALTER TABLE "partner_clients" DROP COLUMN "licences_visuel_discount_pct";
  ALTER TABLE "partner_clients" DROP COLUMN "licences_visuel_discount_amount";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_visuel_qty";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_visuel_price";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_visuel_discount_pct";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_visuel_discount_amount";`)
}
