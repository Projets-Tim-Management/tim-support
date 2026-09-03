import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "tickets_documents" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"file_id" integer NOT NULL,
  	"label" varchar,
  	"note" varchar,
  	"added_at" timestamp(3) with time zone,
  	"added_by_id" integer
  );
  
  ALTER TABLE "tickets_documents" ADD CONSTRAINT "tickets_documents_file_id_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tickets_documents" ADD CONSTRAINT "tickets_documents_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tickets_documents" ADD CONSTRAINT "tickets_documents_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "tickets_documents_order_idx" ON "tickets_documents" USING btree ("_order");
  CREATE INDEX "tickets_documents_parent_id_idx" ON "tickets_documents" USING btree ("_parent_id");
  CREATE INDEX "tickets_documents_file_idx" ON "tickets_documents" USING btree ("file_id");
  CREATE INDEX "tickets_documents_added_by_idx" ON "tickets_documents" USING btree ("added_by_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "tickets_documents" CASCADE;`)
}
