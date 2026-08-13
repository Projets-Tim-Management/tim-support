import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_client_credentials_licence_profile" AS ENUM('admin', 'conducteur', 'chefChantier', 'chefEquipe', 'compagnon');
  CREATE TABLE "client_portal_accounts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client_id" integer NOT NULL,
  	"email" varchar NOT NULL,
  	"first_name" varchar,
  	"last_name" varchar,
  	"active" boolean DEFAULT true,
  	"last_login_at" timestamp(3) with time zone,
  	"code_hash" varchar,
  	"code_expires_at" timestamp(3) with time zone,
  	"code_attempts" numeric,
  	"request_count" numeric,
  	"request_window_start" timestamp(3) with time zone,
  	"partner_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "client_credentials" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client_id" integer NOT NULL,
  	"first_name" varchar NOT NULL,
  	"last_name" varchar NOT NULL,
  	"licence_profile" "enum_client_credentials_licence_profile" NOT NULL,
  	"username" varchar NOT NULL,
  	"password" varchar NOT NULL,
  	"employee_id" integer,
  	"delivered_at" timestamp(3) with time zone,
  	"partner_id" integer,
  	"display_name" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "client_portal_accounts_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "client_credentials_id" integer;
  ALTER TABLE "client_portal_accounts" ADD CONSTRAINT "client_portal_accounts_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "client_portal_accounts" ADD CONSTRAINT "client_portal_accounts_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "client_credentials" ADD CONSTRAINT "client_credentials_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "client_credentials" ADD CONSTRAINT "client_credentials_employee_id_client_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."client_employees"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "client_credentials" ADD CONSTRAINT "client_credentials_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "client_portal_accounts_client_idx" ON "client_portal_accounts" USING btree ("client_id");
  CREATE UNIQUE INDEX "client_portal_accounts_email_idx" ON "client_portal_accounts" USING btree ("email");
  CREATE INDEX "client_portal_accounts_partner_idx" ON "client_portal_accounts" USING btree ("partner_id");
  CREATE INDEX "client_portal_accounts_updated_at_idx" ON "client_portal_accounts" USING btree ("updated_at");
  CREATE INDEX "client_portal_accounts_created_at_idx" ON "client_portal_accounts" USING btree ("created_at");
  CREATE INDEX "client_credentials_client_idx" ON "client_credentials" USING btree ("client_id");
  CREATE INDEX "client_credentials_employee_idx" ON "client_credentials" USING btree ("employee_id");
  CREATE INDEX "client_credentials_partner_idx" ON "client_credentials" USING btree ("partner_id");
  CREATE INDEX "client_credentials_updated_at_idx" ON "client_credentials" USING btree ("updated_at");
  CREATE INDEX "client_credentials_created_at_idx" ON "client_credentials" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_client_portal_accounts_fk" FOREIGN KEY ("client_portal_accounts_id") REFERENCES "public"."client_portal_accounts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_client_credentials_fk" FOREIGN KEY ("client_credentials_id") REFERENCES "public"."client_credentials"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_client_portal_accounts_id_idx" ON "payload_locked_documents_rels" USING btree ("client_portal_accounts_id");
  CREATE INDEX "payload_locked_documents_rels_client_credentials_id_idx" ON "payload_locked_documents_rels" USING btree ("client_credentials_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_portal_accounts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "client_credentials" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "client_portal_accounts" CASCADE;
  DROP TABLE "client_credentials" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_client_portal_accounts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_client_credentials_fk";
  
  DROP INDEX "payload_locked_documents_rels_client_portal_accounts_id_idx";
  DROP INDEX "payload_locked_documents_rels_client_credentials_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "client_portal_accounts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "client_credentials_id";
  DROP TYPE "public"."enum_client_credentials_licence_profile";`)
}
