import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients_history" ADD COLUMN "annual" boolean;
  ALTER TABLE "_partner_clients_v_version_history" ADD COLUMN "annual" boolean;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients_history" DROP COLUMN "annual";
  ALTER TABLE "_partner_clients_v_version_history" DROP COLUMN "annual";`)
}
