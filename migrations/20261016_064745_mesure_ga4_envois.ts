import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ga4_sends_step" AS ENUM('qualify', 'close');
  CREATE TABLE "ga4_sends" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client_id" integer NOT NULL,
  	"step" "enum_ga4_sends_step" NOT NULL,
  	"reached_at" timestamp(3) with time zone NOT NULL,
  	"sent_at" timestamp(3) with time zone,
  	"value" numeric,
  	"note" varchar,
  	"error" varchar,
  	"claimed_at" timestamp(3) with time zone,
  	"attempts" numeric DEFAULT 0,
  	"next_try_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ga4_sends_id" integer;
  ALTER TABLE "ga4_sends" ADD CONSTRAINT "ga4_sends_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ga4_sends_client_idx" ON "ga4_sends" USING btree ("client_id");
  CREATE INDEX "ga4_sends_sent_at_idx" ON "ga4_sends" USING btree ("sent_at");
  CREATE INDEX "ga4_sends_next_try_at_idx" ON "ga4_sends" USING btree ("next_try_at");
  CREATE INDEX "ga4_sends_updated_at_idx" ON "ga4_sends" USING btree ("updated_at");
  CREATE INDEX "ga4_sends_created_at_idx" ON "ga4_sends" USING btree ("created_at");
  CREATE UNIQUE INDEX "client_step_idx" ON "ga4_sends" USING btree ("client_id","step");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ga4_sends_fk" FOREIGN KEY ("ga4_sends_id") REFERENCES "public"."ga4_sends"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ga4_sends_id_idx" ON "payload_locked_documents_rels" USING btree ("ga4_sends_id");
  ALTER TABLE "partner_clients" DROP COLUMN "ga4_qualify_sent_at";
  ALTER TABLE "partner_clients" DROP COLUMN "ga4_close_sent_at";
  ALTER TABLE "partner_clients" DROP COLUMN "ga4_close_wait_since";
  ALTER TABLE "partner_clients" DROP COLUMN "ga4_error";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_ga4_qualify_sent_at";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_ga4_close_sent_at";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_ga4_close_wait_since";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_ga4_error";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ga4_sends" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ga4_sends" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ga4_sends_fk";
  
  DROP INDEX "payload_locked_documents_rels_ga4_sends_id_idx";
  ALTER TABLE "partner_clients" ADD COLUMN "ga4_qualify_sent_at" timestamp(3) with time zone;
  ALTER TABLE "partner_clients" ADD COLUMN "ga4_close_sent_at" timestamp(3) with time zone;
  ALTER TABLE "partner_clients" ADD COLUMN "ga4_close_wait_since" timestamp(3) with time zone;
  ALTER TABLE "partner_clients" ADD COLUMN "ga4_error" varchar;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_ga4_qualify_sent_at" timestamp(3) with time zone;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_ga4_close_sent_at" timestamp(3) with time zone;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_ga4_close_wait_since" timestamp(3) with time zone;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_ga4_error" varchar;
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ga4_sends_id";
  DROP TYPE "public"."enum_ga4_sends_step";`)
}
