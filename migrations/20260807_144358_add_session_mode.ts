import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_journey_runs_session_mode" AS ENUM('visio', 'sur-place');
  ALTER TABLE "journey_runs" ADD COLUMN "session_mode" "enum_journey_runs_session_mode" DEFAULT 'visio';
  ALTER TABLE "journey_runs" ADD COLUMN "session_link" varchar;
  ALTER TABLE "journey_runs" ADD COLUMN "session_location" varchar;
  ALTER TABLE "journey_runs" ADD COLUMN "session_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "journey_runs" DROP COLUMN "session_mode";
  ALTER TABLE "journey_runs" DROP COLUMN "session_link";
  ALTER TABLE "journey_runs" DROP COLUMN "session_location";
  ALTER TABLE "journey_runs" DROP COLUMN "session_at";
  DROP TYPE "public"."enum_journey_runs_session_mode";`)
}
