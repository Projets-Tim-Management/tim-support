import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_integrations_kind" AS ENUM('compta', 'paie', 'erp', 'crm', 'documents', 'donnees', 'messagerie', 'autre');
  CREATE TYPE "public"."enum_integrations_status" AS ENUM('etude', 'en-cours', 'connectee', 'abandonnee');
  CREATE TABLE "integrations_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar NOT NULL,
  	"label" varchar
  );
  
  CREATE TABLE "integrations_exchanges" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"body" varchar,
  	"asked_to_id" integer,
  	"author_id" integer,
  	"at" timestamp(3) with time zone
  );
  
  CREATE TABLE "integrations_documents" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"file_id" integer NOT NULL,
  	"label" varchar,
  	"note" varchar,
  	"added_at" timestamp(3) with time zone,
  	"added_by_id" integer
  );
  
  CREATE TABLE "integrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"kind" "enum_integrations_kind" DEFAULT 'autre',
  	"status" "enum_integrations_status" DEFAULT 'etude',
  	"website" varchar,
  	"summary" varchar,
  	"capabilities" varchar,
  	"doc_url" varchar,
  	"contact_name" varchar,
  	"contact_role" varchar,
  	"contact_email" varchar,
  	"contact_phone" varchar,
  	"contact_notes" varchar,
  	"demo_url" varchar,
  	"demo_email" varchar,
  	"demo_password" varchar,
  	"demo_notes" varchar,
  	"logo_id" integer,
  	"assignee_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "developments_rels" ADD COLUMN "integrations_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "integrations_id" integer;
  ALTER TABLE "integrations_links" ADD CONSTRAINT "integrations_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "integrations_exchanges" ADD CONSTRAINT "integrations_exchanges_asked_to_id_users_id_fk" FOREIGN KEY ("asked_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "integrations_exchanges" ADD CONSTRAINT "integrations_exchanges_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "integrations_exchanges" ADD CONSTRAINT "integrations_exchanges_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "integrations_documents" ADD CONSTRAINT "integrations_documents_file_id_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "integrations_documents" ADD CONSTRAINT "integrations_documents_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "integrations_documents" ADD CONSTRAINT "integrations_documents_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "integrations" ADD CONSTRAINT "integrations_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "integrations" ADD CONSTRAINT "integrations_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "integrations_links_order_idx" ON "integrations_links" USING btree ("_order");
  CREATE INDEX "integrations_links_parent_id_idx" ON "integrations_links" USING btree ("_parent_id");
  CREATE INDEX "integrations_exchanges_order_idx" ON "integrations_exchanges" USING btree ("_order");
  CREATE INDEX "integrations_exchanges_parent_id_idx" ON "integrations_exchanges" USING btree ("_parent_id");
  CREATE INDEX "integrations_exchanges_asked_to_idx" ON "integrations_exchanges" USING btree ("asked_to_id");
  CREATE INDEX "integrations_exchanges_author_idx" ON "integrations_exchanges" USING btree ("author_id");
  CREATE INDEX "integrations_documents_order_idx" ON "integrations_documents" USING btree ("_order");
  CREATE INDEX "integrations_documents_parent_id_idx" ON "integrations_documents" USING btree ("_parent_id");
  CREATE INDEX "integrations_documents_file_idx" ON "integrations_documents" USING btree ("file_id");
  CREATE INDEX "integrations_documents_added_by_idx" ON "integrations_documents" USING btree ("added_by_id");
  CREATE INDEX "integrations_logo_idx" ON "integrations" USING btree ("logo_id");
  CREATE INDEX "integrations_assignee_idx" ON "integrations" USING btree ("assignee_id");
  CREATE INDEX "integrations_updated_at_idx" ON "integrations" USING btree ("updated_at");
  CREATE INDEX "integrations_created_at_idx" ON "integrations" USING btree ("created_at");
  ALTER TABLE "developments_rels" ADD CONSTRAINT "developments_rels_integrations_fk" FOREIGN KEY ("integrations_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_integrations_fk" FOREIGN KEY ("integrations_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "developments_rels_integrations_id_idx" ON "developments_rels" USING btree ("integrations_id");
  CREATE INDEX "payload_locked_documents_rels_integrations_id_idx" ON "payload_locked_documents_rels" USING btree ("integrations_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "integrations_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "integrations_exchanges" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "integrations_documents" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "integrations" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "integrations_links" CASCADE;
  DROP TABLE "integrations_exchanges" CASCADE;
  DROP TABLE "integrations_documents" CASCADE;
  DROP TABLE "integrations" CASCADE;
  ALTER TABLE "developments_rels" DROP CONSTRAINT "developments_rels_integrations_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_integrations_fk";
  
  DROP INDEX "developments_rels_integrations_id_idx";
  DROP INDEX "payload_locked_documents_rels_integrations_id_idx";
  ALTER TABLE "developments_rels" DROP COLUMN "integrations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "integrations_id";
  DROP TYPE "public"."enum_integrations_kind";
  DROP TYPE "public"."enum_integrations_status";`)
}
