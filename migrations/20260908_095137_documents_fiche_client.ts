import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "partner_clients_documents" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"file_id" integer,
  	"label" varchar,
  	"note" varchar,
  	"added_at" timestamp(3) with time zone,
  	"added_by_id" integer
  );
  
  CREATE TABLE "_partner_clients_v_version_documents" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"file_id" integer,
  	"label" varchar,
  	"note" varchar,
  	"added_at" timestamp(3) with time zone,
  	"added_by_id" integer,
  	"_uuid" varchar
  );
  
  ALTER TABLE "partner_clients_documents" ADD CONSTRAINT "partner_clients_documents_file_id_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "partner_clients_documents" ADD CONSTRAINT "partner_clients_documents_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "partner_clients_documents" ADD CONSTRAINT "partner_clients_documents_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."partner_clients"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_partner_clients_v_version_documents" ADD CONSTRAINT "_partner_clients_v_version_documents_file_id_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_partner_clients_v_version_documents" ADD CONSTRAINT "_partner_clients_v_version_documents_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_partner_clients_v_version_documents" ADD CONSTRAINT "_partner_clients_v_version_documents_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_partner_clients_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "partner_clients_documents_order_idx" ON "partner_clients_documents" USING btree ("_order");
  CREATE INDEX "partner_clients_documents_parent_id_idx" ON "partner_clients_documents" USING btree ("_parent_id");
  CREATE INDEX "partner_clients_documents_file_idx" ON "partner_clients_documents" USING btree ("file_id");
  CREATE INDEX "partner_clients_documents_added_by_idx" ON "partner_clients_documents" USING btree ("added_by_id");
  CREATE INDEX "_partner_clients_v_version_documents_order_idx" ON "_partner_clients_v_version_documents" USING btree ("_order");
  CREATE INDEX "_partner_clients_v_version_documents_parent_id_idx" ON "_partner_clients_v_version_documents" USING btree ("_parent_id");
  CREATE INDEX "_partner_clients_v_version_documents_file_idx" ON "_partner_clients_v_version_documents" USING btree ("file_id");
  CREATE INDEX "_partner_clients_v_version_documents_added_by_idx" ON "_partner_clients_v_version_documents" USING btree ("added_by_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "partner_clients_documents" CASCADE;
  DROP TABLE "_partner_clients_v_version_documents" CASCADE;`)
}
