import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_activities" ADD COLUMN "calendar_sync" boolean DEFAULT false;
  ALTER TABLE "client_activities" ADD COLUMN "calendar_event_id" varchar;
  ALTER TABLE "client_activities" ADD COLUMN "calendar_link" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_activities" DROP COLUMN "calendar_sync";
  ALTER TABLE "client_activities" DROP COLUMN "calendar_event_id";
  ALTER TABLE "client_activities" DROP COLUMN "calendar_link";`)
}
