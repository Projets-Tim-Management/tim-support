import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_electronic_signatures_kind" AS ENUM('devis', 'contrat');
  CREATE TYPE "public"."enum_electronic_signatures_status" AS ENUM('en-attente', 'signe', 'expire');
  CREATE TABLE "electronic_signatures" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client_id" integer NOT NULL,
  	"partner_id" integer,
  	"display_name" varchar,
  	"kind" "enum_electronic_signatures_kind" NOT NULL,
  	"status" "enum_electronic_signatures_status" DEFAULT 'en-attente',
  	"signer_first_name" varchar,
  	"signer_last_name" varchar,
  	"signer_role" varchar,
  	"signer_email" varchar,
  	"consent_text" varchar,
  	"document_original_id" integer,
  	"document_hash" varchar,
  	"code_sent_at" timestamp(3) with time zone,
  	"signed_at" timestamp(3) with time zone,
  	"ip" varchar,
  	"user_agent" varchar,
  	"signed_document_id" integer,
  	"signed_hash" varchar,
  	"code_hash" varchar,
  	"code_expires_at" timestamp(3) with time zone,
  	"attempts" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "electronic_signatures_id" integer;
  ALTER TABLE "electronic_signatures" ADD CONSTRAINT "electronic_signatures_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "electronic_signatures" ADD CONSTRAINT "electronic_signatures_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "electronic_signatures" ADD CONSTRAINT "electronic_signatures_document_original_id_media_id_fk" FOREIGN KEY ("document_original_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "electronic_signatures" ADD CONSTRAINT "electronic_signatures_signed_document_id_media_id_fk" FOREIGN KEY ("signed_document_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "electronic_signatures_client_idx" ON "electronic_signatures" USING btree ("client_id");
  CREATE INDEX "electronic_signatures_partner_idx" ON "electronic_signatures" USING btree ("partner_id");
  CREATE INDEX "electronic_signatures_document_original_idx" ON "electronic_signatures" USING btree ("document_original_id");
  CREATE INDEX "electronic_signatures_signed_document_idx" ON "electronic_signatures" USING btree ("signed_document_id");
  CREATE INDEX "electronic_signatures_updated_at_idx" ON "electronic_signatures" USING btree ("updated_at");
  CREATE INDEX "electronic_signatures_created_at_idx" ON "electronic_signatures" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_electronic_signatures_fk" FOREIGN KEY ("electronic_signatures_id") REFERENCES "public"."electronic_signatures"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_electronic_signatures_id_idx" ON "payload_locked_documents_rels" USING btree ("electronic_signatures_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "electronic_signatures" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "electronic_signatures" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_electronic_signatures_fk";
  
  DROP INDEX "payload_locked_documents_rels_electronic_signatures_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "electronic_signatures_id";
  DROP TYPE "public"."enum_electronic_signatures_kind";
  DROP TYPE "public"."enum_electronic_signatures_status";`)
}
