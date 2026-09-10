import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients" ADD COLUMN "portal_opened" boolean DEFAULT false;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_portal_opened" boolean DEFAULT false;
  ALTER TABLE "client_portal_accounts" ADD COLUMN "invitation_sent_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients" DROP COLUMN "portal_opened";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_portal_opened";
  ALTER TABLE "client_portal_accounts" DROP COLUMN "invitation_sent_at";`)
}
