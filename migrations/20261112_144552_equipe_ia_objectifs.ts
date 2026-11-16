import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ai_team_members" ADD COLUMN "target_value" numeric;
  ALTER TABLE "ai_team_methods" ADD COLUMN "benchmark" jsonb;
  ALTER TABLE "ai_team_snapshots" ADD COLUMN "tracking" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ai_team_members" DROP COLUMN "target_value";
  ALTER TABLE "ai_team_methods" DROP COLUMN "benchmark";
  ALTER TABLE "ai_team_snapshots" DROP COLUMN "tracking";`)
}
