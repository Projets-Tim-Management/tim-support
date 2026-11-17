import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_client_contacts_licence_profile" ADD VALUE 'magasinier' BEFORE 'visuel';
  ALTER TYPE "public"."enum_client_employees_licence_profile" ADD VALUE 'magasinier' BEFORE 'visuel';
  ALTER TABLE "partner_clients" ADD COLUMN "licences_magasinier_qty" numeric DEFAULT 0;
  ALTER TABLE "partner_clients" ADD COLUMN "licences_magasinier_price" numeric DEFAULT 40;
  ALTER TABLE "partner_clients" ADD COLUMN "licences_module_planning" boolean DEFAULT false;
  ALTER TABLE "partner_clients" ADD COLUMN "licences_module_pointage" boolean DEFAULT false;
  ALTER TABLE "partner_clients" ADD COLUMN "licences_module_stock" boolean DEFAULT false;
  ALTER TABLE "partner_clients" ADD COLUMN "licences_annual_plan" boolean DEFAULT false;
  ALTER TABLE "partner_clients" ADD COLUMN "licences_magasinier_discount_pct" numeric DEFAULT 0;
  ALTER TABLE "partner_clients" ADD COLUMN "licences_magasinier_discount_amount" numeric DEFAULT 0;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_magasinier_qty" numeric DEFAULT 0;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_magasinier_price" numeric DEFAULT 40;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_module_planning" boolean DEFAULT false;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_module_pointage" boolean DEFAULT false;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_module_stock" boolean DEFAULT false;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_annual_plan" boolean DEFAULT false;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_magasinier_discount_pct" numeric DEFAULT 0;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_magasinier_discount_amount" numeric DEFAULT 0;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_contacts" ALTER COLUMN "licence_profile" SET DATA TYPE text;
  DROP TYPE "public"."enum_client_contacts_licence_profile";
  CREATE TYPE "public"."enum_client_contacts_licence_profile" AS ENUM('admin', 'conducteur', 'chefChantier', 'chefEquipe', 'compagnon', 'bureau', 'visuel');
  ALTER TABLE "client_contacts" ALTER COLUMN "licence_profile" SET DATA TYPE "public"."enum_client_contacts_licence_profile" USING "licence_profile"::"public"."enum_client_contacts_licence_profile";
  ALTER TABLE "client_employees" ALTER COLUMN "licence_profile" SET DATA TYPE text;
  DROP TYPE "public"."enum_client_employees_licence_profile";
  CREATE TYPE "public"."enum_client_employees_licence_profile" AS ENUM('admin', 'conducteur', 'chefChantier', 'chefEquipe', 'compagnon', 'bureau', 'visuel');
  ALTER TABLE "client_employees" ALTER COLUMN "licence_profile" SET DATA TYPE "public"."enum_client_employees_licence_profile" USING "licence_profile"::"public"."enum_client_employees_licence_profile";
  ALTER TABLE "partner_clients" DROP COLUMN "licences_magasinier_qty";
  ALTER TABLE "partner_clients" DROP COLUMN "licences_magasinier_price";
  ALTER TABLE "partner_clients" DROP COLUMN "licences_module_planning";
  ALTER TABLE "partner_clients" DROP COLUMN "licences_module_pointage";
  ALTER TABLE "partner_clients" DROP COLUMN "licences_module_stock";
  ALTER TABLE "partner_clients" DROP COLUMN "licences_annual_plan";
  ALTER TABLE "partner_clients" DROP COLUMN "licences_magasinier_discount_pct";
  ALTER TABLE "partner_clients" DROP COLUMN "licences_magasinier_discount_amount";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_magasinier_qty";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_magasinier_price";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_module_planning";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_module_pointage";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_module_stock";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_annual_plan";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_magasinier_discount_pct";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_magasinier_discount_amount";`)
}
