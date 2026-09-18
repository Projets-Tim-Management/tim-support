import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "client_activities_attempts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"at" timestamp(3) with time zone,
  	"by_id" integer
  );
  
  ALTER TABLE "client_activities_attempts" ADD CONSTRAINT "client_activities_attempts_by_id_users_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "client_activities_attempts" ADD CONSTRAINT "client_activities_attempts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."client_activities"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "client_activities_attempts_order_idx" ON "client_activities_attempts" USING btree ("_order");
  CREATE INDEX "client_activities_attempts_parent_id_idx" ON "client_activities_attempts" USING btree ("_parent_id");
  CREATE INDEX "client_activities_attempts_by_idx" ON "client_activities_attempts" USING btree ("by_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "client_activities_attempts" CASCADE;`)
}
