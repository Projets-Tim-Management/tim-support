import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "mailbox_connections" ADD COLUMN "synced_up_to" timestamp(3) with time zone;
  ALTER TABLE "mailbox_connections" ADD COLUMN "backfill_before" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "mailbox_connections" DROP COLUMN "synced_up_to";
  ALTER TABLE "mailbox_connections" DROP COLUMN "backfill_before";`)
}
