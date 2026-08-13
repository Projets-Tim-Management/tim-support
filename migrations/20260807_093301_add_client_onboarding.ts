import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_partner_clients_onboarding_status" AS ENUM('en-cours', 'transmis', 'valide');
  CREATE TYPE "public"."enum__partner_clients_v_version_onboarding_status" AS ENUM('en-cours', 'transmis', 'valide');
  CREATE TYPE "public"."enum_client_employees_licence_profile" AS ENUM('admin', 'conducteur', 'chefChantier', 'chefEquipe', 'compagnon');
  CREATE TYPE "public"."enum_client_employees_contract_type" AS ENUM('cdi', 'cdd', 'interim', 'apprentissage', 'stage', 'sous-traitant');
  CREATE TYPE "public"."enum_client_vehicles_license_types" AS ENUM('b', 'be', 'c1', 'c1e', 'c', 'ce', 'd', 'de');
  CREATE TYPE "public"."enum_client_machines_caces_types" AS ENUM('r482-a', 'r482-b1', 'r482-b2', 'r482-c1', 'r482-c2', 'r482-c3', 'r482-d', 'r482-e', 'r482-f', 'r482-g', 'r486-a', 'r486-b', 'r486-c', 'r489-1', 'r489-3', 'r489-5', 'r490');
  CREATE TABLE "client_employees" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client_id" integer NOT NULL,
  	"matricule" varchar,
  	"first_name" varchar NOT NULL,
  	"last_name" varchar NOT NULL,
  	"poste" varchar NOT NULL,
  	"company" varchar,
  	"is_user" boolean DEFAULT false,
  	"licence_profile" "enum_client_employees_licence_profile",
  	"email" varchar,
  	"phone" varchar,
  	"address" varchar,
  	"nationality" varchar,
  	"birth_date" timestamp(3) with time zone,
  	"contract_type" "enum_client_employees_contract_type" NOT NULL,
  	"contract_end_date" timestamp(3) with time zone,
  	"partner_id" integer,
  	"display_name" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "client_sites" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client_id" integer NOT NULL,
  	"name" varchar NOT NULL,
  	"address" varchar NOT NULL,
  	"start_date" timestamp(3) with time zone NOT NULL,
  	"end_date" timestamp(3) with time zone,
  	"zone" varchar,
  	"partner_id" integer,
  	"display_name" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "client_vehicles_license_types" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_client_vehicles_license_types",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "client_vehicles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client_id" integer NOT NULL,
  	"brand" varchar NOT NULL,
  	"year" numeric,
  	"plate" varchar NOT NULL,
  	"insurance_date" timestamp(3) with time zone,
  	"partner_id" integer,
  	"display_name" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "client_machines_caces_types" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_client_machines_caces_types",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "client_machines" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client_id" integer NOT NULL,
  	"brand" varchar NOT NULL,
  	"year" numeric,
  	"serial" varchar NOT NULL,
  	"insurance_date" timestamp(3) with time zone,
  	"partner_id" integer,
  	"display_name" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "partner_clients" ADD COLUMN "onboarding_status" "enum_partner_clients_onboarding_status" DEFAULT 'en-cours';
  ALTER TABLE "partner_clients" ADD COLUMN "onboarding_submitted_at" timestamp(3) with time zone;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_onboarding_status" "enum__partner_clients_v_version_onboarding_status" DEFAULT 'en-cours';
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_onboarding_submitted_at" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "client_employees_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "client_sites_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "client_vehicles_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "client_machines_id" integer;
  ALTER TABLE "client_employees" ADD CONSTRAINT "client_employees_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "client_employees" ADD CONSTRAINT "client_employees_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "client_sites" ADD CONSTRAINT "client_sites_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "client_sites" ADD CONSTRAINT "client_sites_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "client_vehicles_license_types" ADD CONSTRAINT "client_vehicles_license_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."client_vehicles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "client_vehicles" ADD CONSTRAINT "client_vehicles_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "client_vehicles" ADD CONSTRAINT "client_vehicles_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "client_machines_caces_types" ADD CONSTRAINT "client_machines_caces_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."client_machines"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "client_machines" ADD CONSTRAINT "client_machines_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "client_machines" ADD CONSTRAINT "client_machines_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "client_employees_client_idx" ON "client_employees" USING btree ("client_id");
  CREATE INDEX "client_employees_partner_idx" ON "client_employees" USING btree ("partner_id");
  CREATE INDEX "client_employees_updated_at_idx" ON "client_employees" USING btree ("updated_at");
  CREATE INDEX "client_employees_created_at_idx" ON "client_employees" USING btree ("created_at");
  CREATE INDEX "client_sites_client_idx" ON "client_sites" USING btree ("client_id");
  CREATE INDEX "client_sites_partner_idx" ON "client_sites" USING btree ("partner_id");
  CREATE INDEX "client_sites_updated_at_idx" ON "client_sites" USING btree ("updated_at");
  CREATE INDEX "client_sites_created_at_idx" ON "client_sites" USING btree ("created_at");
  CREATE INDEX "client_vehicles_license_types_order_idx" ON "client_vehicles_license_types" USING btree ("order");
  CREATE INDEX "client_vehicles_license_types_parent_idx" ON "client_vehicles_license_types" USING btree ("parent_id");
  CREATE INDEX "client_vehicles_client_idx" ON "client_vehicles" USING btree ("client_id");
  CREATE INDEX "client_vehicles_plate_idx" ON "client_vehicles" USING btree ("plate");
  CREATE INDEX "client_vehicles_partner_idx" ON "client_vehicles" USING btree ("partner_id");
  CREATE INDEX "client_vehicles_updated_at_idx" ON "client_vehicles" USING btree ("updated_at");
  CREATE INDEX "client_vehicles_created_at_idx" ON "client_vehicles" USING btree ("created_at");
  CREATE INDEX "client_machines_caces_types_order_idx" ON "client_machines_caces_types" USING btree ("order");
  CREATE INDEX "client_machines_caces_types_parent_idx" ON "client_machines_caces_types" USING btree ("parent_id");
  CREATE INDEX "client_machines_client_idx" ON "client_machines" USING btree ("client_id");
  CREATE INDEX "client_machines_serial_idx" ON "client_machines" USING btree ("serial");
  CREATE INDEX "client_machines_partner_idx" ON "client_machines" USING btree ("partner_id");
  CREATE INDEX "client_machines_updated_at_idx" ON "client_machines" USING btree ("updated_at");
  CREATE INDEX "client_machines_created_at_idx" ON "client_machines" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_client_employees_fk" FOREIGN KEY ("client_employees_id") REFERENCES "public"."client_employees"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_client_sites_fk" FOREIGN KEY ("client_sites_id") REFERENCES "public"."client_sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_client_vehicles_fk" FOREIGN KEY ("client_vehicles_id") REFERENCES "public"."client_vehicles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_client_machines_fk" FOREIGN KEY ("client_machines_id") REFERENCES "public"."client_machines"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_client_employees_id_idx" ON "payload_locked_documents_rels" USING btree ("client_employees_id");
  CREATE INDEX "payload_locked_documents_rels_client_sites_id_idx" ON "payload_locked_documents_rels" USING btree ("client_sites_id");
  CREATE INDEX "payload_locked_documents_rels_client_vehicles_id_idx" ON "payload_locked_documents_rels" USING btree ("client_vehicles_id");
  CREATE INDEX "payload_locked_documents_rels_client_machines_id_idx" ON "payload_locked_documents_rels" USING btree ("client_machines_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_employees" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "client_sites" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "client_vehicles_license_types" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "client_vehicles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "client_machines_caces_types" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "client_machines" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "client_employees" CASCADE;
  DROP TABLE "client_sites" CASCADE;
  DROP TABLE "client_vehicles_license_types" CASCADE;
  DROP TABLE "client_vehicles" CASCADE;
  DROP TABLE "client_machines_caces_types" CASCADE;
  DROP TABLE "client_machines" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_client_employees_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_client_sites_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_client_vehicles_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_client_machines_fk";
  
  DROP INDEX "payload_locked_documents_rels_client_employees_id_idx";
  DROP INDEX "payload_locked_documents_rels_client_sites_id_idx";
  DROP INDEX "payload_locked_documents_rels_client_vehicles_id_idx";
  DROP INDEX "payload_locked_documents_rels_client_machines_id_idx";
  ALTER TABLE "partner_clients" DROP COLUMN "onboarding_status";
  ALTER TABLE "partner_clients" DROP COLUMN "onboarding_submitted_at";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_onboarding_status";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_onboarding_submitted_at";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "client_employees_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "client_sites_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "client_vehicles_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "client_machines_id";
  DROP TYPE "public"."enum_partner_clients_onboarding_status";
  DROP TYPE "public"."enum__partner_clients_v_version_onboarding_status";
  DROP TYPE "public"."enum_client_employees_licence_profile";
  DROP TYPE "public"."enum_client_employees_contract_type";
  DROP TYPE "public"."enum_client_vehicles_license_types";
  DROP TYPE "public"."enum_client_machines_caces_types";`)
}
