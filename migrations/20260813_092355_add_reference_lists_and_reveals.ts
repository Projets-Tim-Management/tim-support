import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_client_employees_nationality" AS ENUM('FR', 'AF', 'ZA', 'AL', 'DZ', 'DE', 'AD', 'AO', 'AG', 'SA', 'AR', 'AM', 'AU', 'AT', 'AZ', 'BS', 'BH', 'BD', 'BB', 'BE', 'BZ', 'BJ', 'BT', 'BY', 'BO', 'BA', 'BW', 'BR', 'BN', 'BG', 'BF', 'BI', 'KH', 'CM', 'CA', 'CV', 'CL', 'CN', 'CY', 'CO', 'KM', 'CG', 'CD', 'KP', 'KR', 'CR', 'CI', 'HR', 'CU', 'DK', 'DJ', 'DM', 'EG', 'AE', 'EC', 'ER', 'ES', 'EE', 'SZ', 'VA', 'US', 'ET', 'FJ', 'FI', 'GA', 'GM', 'GE', 'GH', 'GR', 'GD', 'GT', 'GN', 'GQ', 'GW', 'GY', 'HT', 'HN', 'HU', 'SB', 'IN', 'ID', 'IQ', 'IR', 'IE', 'IS', 'IL', 'IT', 'JM', 'JP', 'JO', 'KZ', 'KE', 'KG', 'KI', 'KW', 'LA', 'LS', 'LV', 'LB', 'LR', 'LY', 'LI', 'LT', 'LU', 'MK', 'MG', 'MY', 'MW', 'MV', 'ML', 'MT', 'MA', 'MU', 'MR', 'MX', 'FM', 'MD', 'MC', 'MN', 'ME', 'MZ', 'MM', 'NA', 'NR', 'NP', 'NI', 'NE', 'NG', 'NO', 'NZ', 'OM', 'UG', 'UZ', 'PK', 'PW', 'PA', 'PG', 'PY', 'NL', 'PE', 'PH', 'PL', 'PT', 'QA', 'RO', 'GB', 'RU', 'RW', 'KN', 'SM', 'VC', 'LC', 'SV', 'WS', 'ST', 'SN', 'RS', 'SC', 'SL', 'SG', 'SK', 'SI', 'SO', 'SD', 'SS', 'LK', 'SE', 'CH', 'SR', 'SY', 'TJ', 'TZ', 'TD', 'CZ', 'TH', 'TL', 'TG', 'TO', 'TT', 'TN', 'TM', 'TR', 'TV', 'UA', 'UY', 'VU', 'VE', 'VN', 'YE', 'ZM', 'ZW');
  CREATE TYPE "public"."enum_client_sites_zone" AS ENUM('zone-1', 'zone-2', 'zone-3', 'zone-4', 'zone-5', 'zone-6', 'zone-7', 'zone-8', 'zone-9', 'zone-10');
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
  
  ALTER TABLE "client_employees" ALTER COLUMN "nationality" SET DATA TYPE "public"."enum_client_employees_nationality" USING "nationality"::"public"."enum_client_employees_nationality";
  ALTER TABLE "client_sites" ALTER COLUMN "zone" SET DATA TYPE "public"."enum_client_sites_zone" USING "zone"::"public"."enum_client_sites_zone";
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "credential_reveals_id" integer;
  ALTER TABLE "credential_reveals" ADD CONSTRAINT "credential_reveals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "credential_reveals" ADD CONSTRAINT "credential_reveals_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "credential_reveals_user_idx" ON "credential_reveals" USING btree ("user_id");
  CREATE INDEX "credential_reveals_client_idx" ON "credential_reveals" USING btree ("client_id");
  CREATE INDEX "credential_reveals_updated_at_idx" ON "credential_reveals" USING btree ("updated_at");
  CREATE INDEX "credential_reveals_created_at_idx" ON "credential_reveals" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_credential_reveals_fk" FOREIGN KEY ("credential_reveals_id") REFERENCES "public"."credential_reveals"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_credential_reveals_id_idx" ON "payload_locked_documents_rels" USING btree ("credential_reveals_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "credential_reveals" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "credential_reveals" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_credential_reveals_fk";
  
  DROP INDEX "payload_locked_documents_rels_credential_reveals_id_idx";
  ALTER TABLE "client_employees" ALTER COLUMN "nationality" SET DATA TYPE varchar;
  ALTER TABLE "client_sites" ALTER COLUMN "zone" SET DATA TYPE varchar;
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "credential_reveals_id";
  DROP TYPE "public"."enum_client_employees_nationality";
  DROP TYPE "public"."enum_client_sites_zone";`)
}
