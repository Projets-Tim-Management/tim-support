import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ai_team_objectives_outcome" AS ENUM('a-marche', 'sans-effet', 'a-empire');
  ALTER TABLE "ai_team_objectives" ADD COLUMN "proposed_by" varchar;
  ALTER TABLE "ai_team_objectives" ADD COLUMN "outcome" "enum_ai_team_objectives_outcome";
  ALTER TABLE "ai_team_objectives" ADD COLUMN "verdict" varchar;
  ALTER TABLE "ai_team_objectives" ADD COLUMN "verdict_at" timestamp(3) with time zone;
  CREATE INDEX "ai_team_objectives_proposed_by_idx" ON "ai_team_objectives" USING btree ("proposed_by");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "ai_team_objectives_proposed_by_idx";
  ALTER TABLE "ai_team_objectives" DROP COLUMN "proposed_by";
  ALTER TABLE "ai_team_objectives" DROP COLUMN "outcome";
  ALTER TABLE "ai_team_objectives" DROP COLUMN "verdict";
  ALTER TABLE "ai_team_objectives" DROP COLUMN "verdict_at";
  DROP TYPE "public"."enum_ai_team_objectives_outcome";`)
}
