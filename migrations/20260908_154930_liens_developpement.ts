import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "developments_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar NOT NULL,
  	"label" varchar
  );
  
  ALTER TABLE "developments_links" ADD CONSTRAINT "developments_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."developments"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "developments_links_order_idx" ON "developments_links" USING btree ("_order");
  CREATE INDEX "developments_links_parent_id_idx" ON "developments_links" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "developments_links" CASCADE;`)
}
