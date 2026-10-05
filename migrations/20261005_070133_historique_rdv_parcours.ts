import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_activities" ADD COLUMN "journey_run_id" integer;
  ALTER TABLE "client_activities" ADD COLUMN "journey_step" varchar;
  ALTER TABLE "client_activities" ADD CONSTRAINT "client_activities_journey_run_id_journey_runs_id_fk" FOREIGN KEY ("journey_run_id") REFERENCES "public"."journey_runs"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "client_activities_journey_run_idx" ON "client_activities" USING btree ("journey_run_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_activities" DROP CONSTRAINT "client_activities_journey_run_id_journey_runs_id_fk";
  
  DROP INDEX "client_activities_journey_run_idx";
  ALTER TABLE "client_activities" DROP COLUMN "journey_run_id";
  ALTER TABLE "client_activities" DROP COLUMN "journey_step";`)
}
