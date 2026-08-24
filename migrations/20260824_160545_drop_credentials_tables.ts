import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Retouché à la main : `DROP TABLE … CASCADE` emporte déjà les clés étrangères
// et les index qui pointent vers ces tables. Le générateur émet ensuite leur
// suppression explicite, qui échoue alors sur « does not exist » et annule toute
// la migration. Les `IF EXISTS` rendent ces lignes tolérantes.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_credentials" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "credential_reveals" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "client_credentials" CASCADE;
  DROP TABLE "credential_reveals" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_client_credentials_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_credential_reveals_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_client_credentials_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_credential_reveals_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "client_credentials_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "credential_reveals_id";
  DROP TYPE IF EXISTS "public"."enum_client_credentials_licence_profile";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_client_credentials_licence_profile" AS ENUM('admin', 'conducteur', 'chefChantier', 'chefEquipe', 'compagnon');
  CREATE TABLE "client_credentials" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client_id" integer NOT NULL,
  	"first_name" varchar NOT NULL,
  	"last_name" varchar NOT NULL,
  	"licence_profile" "enum_client_credentials_licence_profile" NOT NULL,
  	"username" varchar NOT NULL,
  	"password" varchar NOT NULL,
  	"employee_id" integer,
  	"contact_id" integer,
  	"delivered_at" timestamp(3) with time zone,
  	"partner_id" integer,
  	"display_name" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "credential_reveals" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"client_id" integer NOT NULL,
  	"code_hash" varchar NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"attempts" numeric DEFAULT 0,
  	"used_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "client_credentials_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "credential_reveals_id" integer;
  ALTER TABLE "client_credentials" ADD CONSTRAINT "client_credentials_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "client_credentials" ADD CONSTRAINT "client_credentials_employee_id_client_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."client_employees"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "client_credentials" ADD CONSTRAINT "client_credentials_contact_id_client_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."client_contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "client_credentials" ADD CONSTRAINT "client_credentials_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "credential_reveals" ADD CONSTRAINT "credential_reveals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "credential_reveals" ADD CONSTRAINT "credential_reveals_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "client_credentials_client_idx" ON "client_credentials" USING btree ("client_id");
  CREATE INDEX "client_credentials_employee_idx" ON "client_credentials" USING btree ("employee_id");
  CREATE INDEX "client_credentials_contact_idx" ON "client_credentials" USING btree ("contact_id");
  CREATE INDEX "client_credentials_partner_idx" ON "client_credentials" USING btree ("partner_id");
  CREATE INDEX "client_credentials_updated_at_idx" ON "client_credentials" USING btree ("updated_at");
  CREATE INDEX "client_credentials_created_at_idx" ON "client_credentials" USING btree ("created_at");
  CREATE INDEX "credential_reveals_user_idx" ON "credential_reveals" USING btree ("user_id");
  CREATE INDEX "credential_reveals_client_idx" ON "credential_reveals" USING btree ("client_id");
  CREATE INDEX "credential_reveals_updated_at_idx" ON "credential_reveals" USING btree ("updated_at");
  CREATE INDEX "credential_reveals_created_at_idx" ON "credential_reveals" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_client_credentials_fk" FOREIGN KEY ("client_credentials_id") REFERENCES "public"."client_credentials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_credential_reveals_fk" FOREIGN KEY ("credential_reveals_id") REFERENCES "public"."credential_reveals"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_client_credentials_id_idx" ON "payload_locked_documents_rels" USING btree ("client_credentials_id");
  CREATE INDEX "payload_locked_documents_rels_credential_reveals_id_idx" ON "payload_locked_documents_rels" USING btree ("credential_reveals_id");`)
}
