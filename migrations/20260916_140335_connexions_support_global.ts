import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "support_connections_entries" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"notes" varchar,
  	"last_test_at" timestamp(3) with time zone,
  	"last_test_ok" boolean,
  	"last_test_message" varchar
  );
  
  CREATE TABLE "support_connections" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "support_connections_entries" ADD CONSTRAINT "support_connections_entries_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_connections"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "support_connections_entries_order_idx" ON "support_connections_entries" USING btree ("_order");
  CREATE INDEX "support_connections_entries_parent_id_idx" ON "support_connections_entries" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "support_connections_entries" CASCADE;
  DROP TABLE "support_connections" CASCADE;`)
}
