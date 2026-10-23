import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// ADDITIVE — générée par scripts/db-migrate-additive.ts (schéma d'avant fusionné : l'ancien moteur vidéo reste en base jusqu'au temps 2).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "presentation_bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"summary" varchar,
	"at" timestamp(3) with time zone NOT NULL,
	"client_id" integer,
	"first_name" varchar NOT NULL,
	"last_name" varchar NOT NULL,
	"email" varchar NOT NULL,
	"phone" varchar,
	"company" varchar NOT NULL,
	"message" varchar,
	"notes" varchar,
	"meeting_url" varchar,
	"event_id" varchar,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "presentation_bookings_id" integer;
  ALTER TABLE "presentation_bookings" ADD CONSTRAINT "presentation_bookings_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "presentation_bookings_at_idx" ON "presentation_bookings" USING btree ("at");
  CREATE INDEX "presentation_bookings_client_idx" ON "presentation_bookings" USING btree ("client_id");
  CREATE INDEX "presentation_bookings_email_idx" ON "presentation_bookings" USING btree ("email");
  CREATE INDEX "presentation_bookings_updated_at_idx" ON "presentation_bookings" USING btree ("updated_at");
  CREATE INDEX "presentation_bookings_created_at_idx" ON "presentation_bookings" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_presentation_bookings_fk" FOREIGN KEY ("presentation_bookings_id") REFERENCES "public"."presentation_bookings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_presentation_bookings_id_idx" ON "payload_locked_documents_rels" USING btree ("presentation_bookings_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "presentation_bookings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "presentation_bookings" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_presentation_bookings_fk";

  DROP INDEX "payload_locked_documents_rels_presentation_bookings_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "presentation_bookings_id";`)
}
