import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tickets" ADD COLUMN "journey_run_id" integer;
  ALTER TABLE "tickets" ADD CONSTRAINT "tickets_journey_run_id_journey_runs_id_fk" FOREIGN KEY ("journey_run_id") REFERENCES "public"."journey_runs"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "tickets_journey_run_idx" ON "tickets" USING btree ("journey_run_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tickets" DROP CONSTRAINT "tickets_journey_run_id_journey_runs_id_fk";
  
  DROP INDEX "tickets_journey_run_idx";
  ALTER TABLE "tickets" DROP COLUMN "journey_run_id";`)
}
