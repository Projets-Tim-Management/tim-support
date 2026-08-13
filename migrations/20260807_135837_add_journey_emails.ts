import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_marketing_journeys_emails_audience" AS ENUM('client', 'partenaire');
  CREATE TYPE "public"."enum_marketing_journeys_emails_anchor" AS ENUM('aucun', 'debut', 'milieu', 'fin');
  CREATE TABLE "marketing_journeys_emails" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"subject" varchar NOT NULL,
  	"audience" "enum_marketing_journeys_emails_audience" DEFAULT 'client',
  	"anchor" "enum_marketing_journeys_emails_anchor" DEFAULT 'aucun',
  	"offset_days" numeric DEFAULT 0,
  	"trigger" varchar,
  	"detail" varchar
  );
  
  ALTER TABLE "marketing_journeys" ADD COLUMN "seed_version" numeric;
  ALTER TABLE "marketing_journeys_emails" ADD CONSTRAINT "marketing_journeys_emails_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."marketing_journeys"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "marketing_journeys_emails_order_idx" ON "marketing_journeys_emails" USING btree ("_order");
  CREATE INDEX "marketing_journeys_emails_parent_id_idx" ON "marketing_journeys_emails" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "marketing_journeys_emails" CASCADE;
  ALTER TABLE "marketing_journeys" DROP COLUMN "seed_version";
  DROP TYPE "public"."enum_marketing_journeys_emails_audience";
  DROP TYPE "public"."enum_marketing_journeys_emails_anchor";`)
}
