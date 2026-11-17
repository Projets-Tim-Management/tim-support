import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients" DROP COLUMN "licences_annual_plan";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_licences_annual_plan";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients" ADD COLUMN "licences_annual_plan" boolean DEFAULT false;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_licences_annual_plan" boolean DEFAULT false;`)
}
