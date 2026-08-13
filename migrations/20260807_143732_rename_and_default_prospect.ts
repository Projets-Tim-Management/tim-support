import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients" ALTER COLUMN "client_status" SET DEFAULT 'prospect';
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_client_status" SET DEFAULT 'prospect';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients" ALTER COLUMN "client_status" SET DEFAULT 'actif';
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_client_status" SET DEFAULT 'actif';`)
}
