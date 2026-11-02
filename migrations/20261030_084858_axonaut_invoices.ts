import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// ADDITIVE — générée par scripts/db-migrate-additive.ts (schéma d'avant fusionné : l'ancien moteur vidéo reste en base jusqu'au temps 2).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_axonaut_invoices_kind" AS ENUM('facture', 'avoir');
  CREATE TABLE "axonaut_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" varchar NOT NULL,
	"kind" "enum_axonaut_invoices_kind" NOT NULL,
	"date" timestamp(3) with time zone NOT NULL,
	"month" varchar NOT NULL,
	"client_id" integer,
	"client_name" varchar NOT NULL,
	"siren" varchar,
	"total_h_t" numeric NOT NULL,
	"total_t_t_c" numeric NOT NULL,
	"recurring_h_t" numeric NOT NULL,
	"services_h_t" numeric NOT NULL,
	"credit_for" varchar,
	"note" varchar,
	"lines" jsonb,
	"source_file" varchar,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "axonaut_invoices_id" integer;
  ALTER TABLE "axonaut_invoices" ADD CONSTRAINT "axonaut_invoices_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "axonaut_invoices_number_idx" ON "axonaut_invoices" USING btree ("number");
  CREATE INDEX "axonaut_invoices_date_idx" ON "axonaut_invoices" USING btree ("date");
  CREATE INDEX "axonaut_invoices_month_idx" ON "axonaut_invoices" USING btree ("month");
  CREATE INDEX "axonaut_invoices_client_idx" ON "axonaut_invoices" USING btree ("client_id");
  CREATE INDEX "axonaut_invoices_updated_at_idx" ON "axonaut_invoices" USING btree ("updated_at");
  CREATE INDEX "axonaut_invoices_created_at_idx" ON "axonaut_invoices" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_axonaut_invoices_fk" FOREIGN KEY ("axonaut_invoices_id") REFERENCES "public"."axonaut_invoices"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_axonaut_invoices_id_idx" ON "payload_locked_documents_rels" USING btree ("axonaut_invoices_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "axonaut_invoices" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "axonaut_invoices" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_axonaut_invoices_fk";

  DROP INDEX "payload_locked_documents_rels_axonaut_invoices_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "axonaut_invoices_id";
  DROP TYPE "public"."enum_axonaut_invoices_kind";`)
}
