import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "journey_runs" ADD COLUMN "satisfaction" numeric;
  ALTER TABLE "journey_runs" ADD COLUMN "satisfaction_at" timestamp(3) with time zone;
  ALTER TABLE "journey_runs" ADD COLUMN "satisfaction_comment" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "journey_runs" DROP COLUMN "satisfaction";
  ALTER TABLE "journey_runs" DROP COLUMN "satisfaction_at";
  ALTER TABLE "journey_runs" DROP COLUMN "satisfaction_comment";`)
}
