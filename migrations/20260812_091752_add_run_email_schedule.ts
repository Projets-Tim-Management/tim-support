import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "journey_runs_emails" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"subject" varchar,
  	"scheduled_at" timestamp(3) with time zone,
  	"overridden" boolean,
  	"sent_at" timestamp(3) with time zone,
  	"audience" varchar,
  	"anchor" varchar,
  	"offset_days" numeric,
  	"step_key" varchar,
  	"trigger" varchar,
  	"detail" varchar
  );
  
  ALTER TABLE "journey_runs_emails" ADD CONSTRAINT "journey_runs_emails_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."journey_runs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "journey_runs_emails_order_idx" ON "journey_runs_emails" USING btree ("_order");
  CREATE INDEX "journey_runs_emails_parent_id_idx" ON "journey_runs_emails" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "journey_runs_emails" CASCADE;`)
}
