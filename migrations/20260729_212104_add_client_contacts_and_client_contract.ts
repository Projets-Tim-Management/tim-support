import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_partner_clients_payment_method" AS ENUM('prelevement-gocardless', 'virement');
  CREATE TYPE "public"."enum_partner_clients_payment_terms" AS ENUM('1er-du-mois', '7j', '15j', '30j', '45j', '60j');
  CREATE TYPE "public"."enum__partner_clients_v_version_payment_method" AS ENUM('prelevement-gocardless', 'virement');
  CREATE TYPE "public"."enum__partner_clients_v_version_payment_terms" AS ENUM('1er-du-mois', '7j', '15j', '30j', '45j', '60j');
  CREATE TYPE "public"."enum_client_contacts_status" AS ENUM('prospect', 'en-cours');
  CREATE TABLE "client_contacts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client_id" integer NOT NULL,
  	"status" "enum_client_contacts_status" DEFAULT 'prospect',
  	"first_name" varchar,
  	"last_name" varchar,
  	"role" varchar,
  	"email" varchar,
  	"phone" varchar,
  	"partner_id" integer,
  	"display_name" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "partners" ALTER COLUMN "partner_kind" DROP NOT NULL;
  ALTER TABLE "partner_clients" ADD COLUMN "payment_method" "enum_partner_clients_payment_method";
  ALTER TABLE "partner_clients" ADD COLUMN "payment_terms" "enum_partner_clients_payment_terms";
  ALTER TABLE "partner_clients" ADD COLUMN "contract_document_id" integer;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_payment_method" "enum__partner_clients_v_version_payment_method";
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_payment_terms" "enum__partner_clients_v_version_payment_terms";
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_contract_document_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "client_contacts_id" integer;
  ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "client_contacts_client_idx" ON "client_contacts" USING btree ("client_id");
  CREATE INDEX "client_contacts_partner_idx" ON "client_contacts" USING btree ("partner_id");
  CREATE INDEX "client_contacts_updated_at_idx" ON "client_contacts" USING btree ("updated_at");
  CREATE INDEX "client_contacts_created_at_idx" ON "client_contacts" USING btree ("created_at");
  ALTER TABLE "partner_clients" ADD CONSTRAINT "partner_clients_contract_document_id_media_id_fk" FOREIGN KEY ("contract_document_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_partner_clients_v" ADD CONSTRAINT "_partner_clients_v_version_contract_document_id_media_id_fk" FOREIGN KEY ("version_contract_document_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_client_contacts_fk" FOREIGN KEY ("client_contacts_id") REFERENCES "public"."client_contacts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "partner_clients_contract_document_idx" ON "partner_clients" USING btree ("contract_document_id");
  CREATE INDEX "_partner_clients_v_version_version_contract_document_idx" ON "_partner_clients_v" USING btree ("version_contract_document_id");
  CREATE INDEX "payload_locked_documents_rels_client_contacts_id_idx" ON "payload_locked_documents_rels" USING btree ("client_contacts_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_contacts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "client_contacts" CASCADE;
  ALTER TABLE "partner_clients" DROP CONSTRAINT "partner_clients_contract_document_id_media_id_fk";
  
  ALTER TABLE "_partner_clients_v" DROP CONSTRAINT "_partner_clients_v_version_contract_document_id_media_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_client_contacts_fk";
  
  DROP INDEX "partner_clients_contract_document_idx";
  DROP INDEX "_partner_clients_v_version_version_contract_document_idx";
  DROP INDEX "payload_locked_documents_rels_client_contacts_id_idx";
  ALTER TABLE "partners" ALTER COLUMN "partner_kind" SET NOT NULL;
  ALTER TABLE "partner_clients" DROP COLUMN "payment_method";
  ALTER TABLE "partner_clients" DROP COLUMN "payment_terms";
  ALTER TABLE "partner_clients" DROP COLUMN "contract_document_id";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_payment_method";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_payment_terms";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_contract_document_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "client_contacts_id";
  DROP TYPE "public"."enum_partner_clients_payment_method";
  DROP TYPE "public"."enum_partner_clients_payment_terms";
  DROP TYPE "public"."enum__partner_clients_v_version_payment_method";
  DROP TYPE "public"."enum__partner_clients_v_version_payment_terms";
  DROP TYPE "public"."enum_client_contacts_status";`)
}
