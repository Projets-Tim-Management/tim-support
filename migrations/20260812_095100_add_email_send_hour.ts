import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "journey_runs_emails" ADD COLUMN "send_hour" varchar;
  ALTER TABLE "marketing_journeys_emails" ADD COLUMN "send_hour" varchar DEFAULT '08:00';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "journey_runs_emails" DROP COLUMN "send_hour";
  ALTER TABLE "marketing_journeys_emails" DROP COLUMN "send_hour";`)
}
