import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_client_contracts_status" AS ENUM('brouillon', 'envoye', 'signe-client', 'signe', 'remplace', 'annule');
  CREATE TABLE "client_contracts_overrides" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"body" varchar
  );
  
  CREATE TABLE "client_contracts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client_id" integer NOT NULL,
  	"partner_id" integer,
  	"reference" varchar,
  	"version" numeric,
  	"status" "enum_client_contracts_status" DEFAULT 'brouillon',
  	"template_version" numeric,
  	"pdf_id" integer,
  	"pdf_hash" varchar,
  	"sent_at" timestamp(3) with time zone,
  	"sent_by_id" integer,
  	"client_signed_at" timestamp(3) with time zone,
  	"signed_document_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "client_contracts_id" integer;
  ALTER TABLE "client_contracts_overrides" ADD CONSTRAINT "client_contracts_overrides_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."client_contracts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "client_contracts" ADD CONSTRAINT "client_contracts_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "client_contracts" ADD CONSTRAINT "client_contracts_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "client_contracts" ADD CONSTRAINT "client_contracts_pdf_id_media_id_fk" FOREIGN KEY ("pdf_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "client_contracts" ADD CONSTRAINT "client_contracts_sent_by_id_users_id_fk" FOREIGN KEY ("sent_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "client_contracts" ADD CONSTRAINT "client_contracts_signed_document_id_media_id_fk" FOREIGN KEY ("signed_document_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "client_contracts_overrides_order_idx" ON "client_contracts_overrides" USING btree ("_order");
  CREATE INDEX "client_contracts_overrides_parent_id_idx" ON "client_contracts_overrides" USING btree ("_parent_id");
  CREATE INDEX "client_contracts_client_idx" ON "client_contracts" USING btree ("client_id");
  CREATE INDEX "client_contracts_partner_idx" ON "client_contracts" USING btree ("partner_id");
  CREATE INDEX "client_contracts_pdf_idx" ON "client_contracts" USING btree ("pdf_id");
  CREATE INDEX "client_contracts_sent_by_idx" ON "client_contracts" USING btree ("sent_by_id");
  CREATE INDEX "client_contracts_signed_document_idx" ON "client_contracts" USING btree ("signed_document_id");
  CREATE INDEX "client_contracts_updated_at_idx" ON "client_contracts" USING btree ("updated_at");
  CREATE INDEX "client_contracts_created_at_idx" ON "client_contracts" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_client_contracts_fk" FOREIGN KEY ("client_contracts_id") REFERENCES "public"."client_contracts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_client_contracts_id_idx" ON "payload_locked_documents_rels" USING btree ("client_contracts_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_contracts_overrides" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "client_contracts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "client_contracts_overrides" CASCADE;
  DROP TABLE "client_contracts" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_client_contracts_fk";
  
  DROP INDEX "payload_locked_documents_rels_client_contracts_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "client_contracts_id";
  DROP TYPE "public"."enum_client_contracts_status";`)
}
