import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ai_team_requests" ADD COLUMN "proposed_by" varchar;
  ALTER TABLE "ai_team_snapshots" ADD COLUMN "mastery" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ai_team_requests" DROP COLUMN "proposed_by";
  ALTER TABLE "ai_team_snapshots" DROP COLUMN "mastery";`)
}
