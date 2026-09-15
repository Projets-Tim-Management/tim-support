import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients" ADD COLUMN "licences_admin_discount_pct" numeric DEFAULT 0;
  ALTER TABLE "partner_clients" ADD COLUMN "licences_admin_discount_amount" numeric DEFAULT 0;
  ALTER TABLE "partner_clients" ADD COLUMN "licences_conducteur_discount_pct" numeric DEFAULT 0;
  ALTER TABLE "partner_clients" ADD COLUMN "licences_conducteur_discount_amount" numeric DEFAULT 0;
  ALTER TABLE "partner_clients" ADD COLUMN "licences_chef_chantier_discount_pct" numeric DEFAULT 0;
  ALTER TABLE "partner_clients" ADD COLUMN "licences_chef_chantier_discount_amount" numeric DEFAULT 0;
  ALTER TABLE "partner_clients" ADD COLUMN "licences_chef_equipe_discount_pct" numeric DEFAULT 0;
  ALTER TABLE "partner_clients" ADD COLUMN "licences_chef_equipe_discount_amount" numeric DEFAULT 0;
  ALTER TABLE "partner_clients" ADD COLUMN "licences_compagnon_discount_pct" numeric DEFAULT 0;
  ALTER TABLE "partner_clients" ADD COLUMN "licences_compagnon_discount_amount" numeric DEFAULT 0;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_admin_discount_pct" numeric DEFAULT 0;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_admin_discount_amount" numeric DEFAULT 0;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_conducteur_discount_pct" numeric DEFAULT 0;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_conducteur_discount_amount" numeric DEFAULT 0;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_chef_chantier_discount_pct" numeric DEFAULT 0;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_chef_chantier_discount_amount" numeric DEFAULT 0;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_chef_equipe_discount_pct" numeric DEFAULT 0;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_chef_equipe_discount_amount" numeric DEFAULT 0;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_compagnon_discount_pct" numeric DEFAULT 0;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_compagnon_discount_amount" numeric DEFAULT 0;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients" DROP COLUMN "licences_admin_discount_pct";
  ALTER TABLE "partner_clients" DROP COLUMN "licences_admin_discount_amount";
  ALTER TABLE "partner_clients" DROP COLUMN "licences_conducteur_discount_pct";
  ALTER TABLE "partner_clients" DROP COLUMN "licences_conducteur_discount_amount";
  ALTER TABLE "partner_clients" DROP COLUMN "licences_chef_chantier_discount_pct";
  ALTER TABLE "partner_clients" DROP COLUMN "licences_chef_chantier_discount_amount";
  ALTER TABLE "partner_clients" DROP COLUMN "licences_chef_equipe_discount_pct";
  ALTER TABLE "partner_clients" DROP COLUMN "licences_chef_equipe_discount_amount";
  ALTER TABLE "partner_clients" DROP COLUMN "licences_compagnon_discount_pct";
  ALTER TABLE "partner_clients" DROP COLUMN "licences_compagnon_discount_amount";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_admin_discount_pct";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_admin_discount_amount";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_conducteur_discount_pct";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_conducteur_discount_amount";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_chef_chantier_discount_pct";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_chef_chantier_discount_amount";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_chef_equipe_discount_pct";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_chef_equipe_discount_amount";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_compagnon_discount_pct";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_compagnon_discount_amount";`)
}
