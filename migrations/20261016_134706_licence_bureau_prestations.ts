import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "public"."enum_client_contacts_licence_profile" ADD VALUE 'bureau' BEFORE 'visuel';
  ALTER TYPE "public"."enum_client_employees_licence_profile" ADD VALUE 'bureau' BEFORE 'visuel';
  ALTER TABLE "partner_clients" ALTER COLUMN "licences_visuel_price" SET DEFAULT 1.9;
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_licences_visuel_price" SET DEFAULT 1.9;
  -- Visuel passe de 2,20 à 1,90 € (prix du catalogue Pennylane) : aucune fiche n'en avait encore saisi, le prix de base suit.
  UPDATE "partner_clients" SET "licences_visuel_price" = 1.9 WHERE "licences_visuel_price" = 2.2 AND COALESCE("licences_visuel_qty", 0) = 0;
  ALTER TABLE "partner_clients" ADD COLUMN "licences_bureau_qty" numeric DEFAULT 0;
  ALTER TABLE "partner_clients" ADD COLUMN "licences_bureau_price" numeric DEFAULT 8;
  ALTER TABLE "partner_clients" ADD COLUMN "licences_bureau_discount_pct" numeric DEFAULT 0;
  ALTER TABLE "partner_clients" ADD COLUMN "licences_bureau_discount_amount" numeric DEFAULT 0;
  ALTER TABLE "partner_clients" ADD COLUMN "prestations_mise_en_place_qty" numeric DEFAULT 0;
  ALTER TABLE "partner_clients" ADD COLUMN "prestations_mise_en_place_price" numeric DEFAULT 2000;
  ALTER TABLE "partner_clients" ADD COLUMN "prestations_formation_place_qty" numeric DEFAULT 0;
  ALTER TABLE "partner_clients" ADD COLUMN "prestations_formation_place_price" numeric DEFAULT 800;
  ALTER TABLE "partner_clients" ADD COLUMN "prestations_formation_distance_qty" numeric DEFAULT 0;
  ALTER TABLE "partner_clients" ADD COLUMN "prestations_formation_distance_price" numeric DEFAULT 400;
  ALTER TABLE "partner_clients" ADD COLUMN "prestations_dev_qty" numeric DEFAULT 0;
  ALTER TABLE "partner_clients" ADD COLUMN "prestations_dev_price" numeric DEFAULT 250;
  ALTER TABLE "partner_clients" ADD COLUMN "prestations_dev_api_qty" numeric DEFAULT 0;
  ALTER TABLE "partner_clients" ADD COLUMN "prestations_dev_api_price" numeric DEFAULT 400;
  ALTER TABLE "partner_clients" ADD COLUMN "prestations_note" varchar;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_bureau_qty" numeric DEFAULT 0;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_bureau_price" numeric DEFAULT 8;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_bureau_discount_pct" numeric DEFAULT 0;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_bureau_discount_amount" numeric DEFAULT 0;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_prestations_mise_en_place_qty" numeric DEFAULT 0;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_prestations_mise_en_place_price" numeric DEFAULT 2000;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_prestations_formation_place_qty" numeric DEFAULT 0;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_prestations_formation_place_price" numeric DEFAULT 800;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_prestations_formation_distance_qty" numeric DEFAULT 0;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_prestations_formation_distance_price" numeric DEFAULT 400;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_prestations_dev_qty" numeric DEFAULT 0;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_prestations_dev_price" numeric DEFAULT 250;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_prestations_dev_api_qty" numeric DEFAULT 0;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_prestations_dev_api_price" numeric DEFAULT 400;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_prestations_note" varchar;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "partner_clients" ALTER COLUMN "licences_visuel_price" SET DEFAULT 2.2;
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_licences_visuel_price" SET DEFAULT 2.2;
  ALTER TABLE "partner_clients" DROP COLUMN "licences_bureau_qty";
  ALTER TABLE "partner_clients" DROP COLUMN "licences_bureau_price";
  ALTER TABLE "partner_clients" DROP COLUMN "licences_bureau_discount_pct";
  ALTER TABLE "partner_clients" DROP COLUMN "licences_bureau_discount_amount";
  ALTER TABLE "partner_clients" DROP COLUMN "prestations_mise_en_place_qty";
  ALTER TABLE "partner_clients" DROP COLUMN "prestations_mise_en_place_price";
  ALTER TABLE "partner_clients" DROP COLUMN "prestations_formation_place_qty";
  ALTER TABLE "partner_clients" DROP COLUMN "prestations_formation_place_price";
  ALTER TABLE "partner_clients" DROP COLUMN "prestations_formation_distance_qty";
  ALTER TABLE "partner_clients" DROP COLUMN "prestations_formation_distance_price";
  ALTER TABLE "partner_clients" DROP COLUMN "prestations_dev_qty";
  ALTER TABLE "partner_clients" DROP COLUMN "prestations_dev_price";
  ALTER TABLE "partner_clients" DROP COLUMN "prestations_dev_api_qty";
  ALTER TABLE "partner_clients" DROP COLUMN "prestations_dev_api_price";
  ALTER TABLE "partner_clients" DROP COLUMN "prestations_note";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_bureau_qty";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_bureau_price";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_bureau_discount_pct";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_bureau_discount_amount";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_prestations_mise_en_place_qty";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_prestations_mise_en_place_price";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_prestations_formation_place_qty";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_prestations_formation_place_price";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_prestations_formation_distance_qty";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_prestations_formation_distance_price";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_prestations_dev_qty";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_prestations_dev_price";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_prestations_dev_api_qty";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_prestations_dev_api_price";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_prestations_note";
  -- La valeur 'bureau' des listes de profils reste (Postgres ne retire pas une valeur d'enum simplement).`)
}
