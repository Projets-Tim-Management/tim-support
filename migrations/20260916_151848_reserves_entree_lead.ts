import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "partner_clients_intake_issues" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"field" varchar,
  	"raw" varchar,
  	"message" varchar
  );
  
  CREATE TABLE "_partner_clients_v_version_intake_issues" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"field" varchar,
  	"raw" varchar,
  	"message" varchar,
  	"_uuid" varchar
  );
  
  ALTER TABLE "partner_clients_intake_issues" ADD CONSTRAINT "partner_clients_intake_issues_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."partner_clients"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_partner_clients_v_version_intake_issues" ADD CONSTRAINT "_partner_clients_v_version_intake_issues_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_partner_clients_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "partner_clients_intake_issues_order_idx" ON "partner_clients_intake_issues" USING btree ("_order");
  CREATE INDEX "partner_clients_intake_issues_parent_id_idx" ON "partner_clients_intake_issues" USING btree ("_parent_id");
  CREATE INDEX "_partner_clients_v_version_intake_issues_order_idx" ON "_partner_clients_v_version_intake_issues" USING btree ("_order");
  CREATE INDEX "_partner_clients_v_version_intake_issues_parent_id_idx" ON "_partner_clients_v_version_intake_issues" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "partner_clients_intake_issues" CASCADE;
  DROP TABLE "_partner_clients_v_version_intake_issues" CASCADE;`)
}
