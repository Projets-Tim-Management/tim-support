import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ai_team_goals" ADD COLUMN "reached_at" timestamp(3) with time zone;
  ALTER TABLE "ai_team_goals" ADD COLUMN "celebrated_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ai_team_goals" DROP COLUMN "reached_at";
  ALTER TABLE "ai_team_goals" DROP COLUMN "celebrated_at";`)
}
