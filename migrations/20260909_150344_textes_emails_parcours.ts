import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "marketing_journeys_email_texts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"slot" varchar NOT NULL,
  	"value" varchar
  );
  
  ALTER TABLE "marketing_journeys_email_texts" ADD CONSTRAINT "marketing_journeys_email_texts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."marketing_journeys"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "marketing_journeys_email_texts_order_idx" ON "marketing_journeys_email_texts" USING btree ("_order");
  CREATE INDEX "marketing_journeys_email_texts_parent_id_idx" ON "marketing_journeys_email_texts" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "marketing_journeys_email_texts" CASCADE;`)
}
