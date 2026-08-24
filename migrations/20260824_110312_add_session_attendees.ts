import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "journey_runs_session_guests" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"email" varchar NOT NULL,
  	"name" varchar
  );
  
  ALTER TABLE "journey_runs" ADD COLUMN "attendee_first_name" varchar;
  ALTER TABLE "journey_runs" ADD COLUMN "attendee_last_name" varchar;
  ALTER TABLE "journey_runs" ADD COLUMN "attendee_role" varchar;
  ALTER TABLE "journey_runs" ADD COLUMN "attendee_email" varchar;
  ALTER TABLE "journey_runs_session_guests" ADD CONSTRAINT "journey_runs_session_guests_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."journey_runs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "journey_runs_session_guests_order_idx" ON "journey_runs_session_guests" USING btree ("_order");
  CREATE INDEX "journey_runs_session_guests_parent_id_idx" ON "journey_runs_session_guests" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "journey_runs_session_guests" CASCADE;
  ALTER TABLE "journey_runs" DROP COLUMN "attendee_first_name";
  ALTER TABLE "journey_runs" DROP COLUMN "attendee_last_name";
  ALTER TABLE "journey_runs" DROP COLUMN "attendee_role";
  ALTER TABLE "journey_runs" DROP COLUMN "attendee_email";`)
}
