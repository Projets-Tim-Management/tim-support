import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_partner_clients_client_status" ADD VALUE 'prospect' BEFORE 'actif';
  ALTER TYPE "public"."enum_partner_clients_client_status" ADD VALUE 'en-cours' BEFORE 'actif';
  ALTER TYPE "public"."enum__partner_clients_v_version_client_status" ADD VALUE 'prospect' BEFORE 'actif';
  ALTER TYPE "public"."enum__partner_clients_v_version_client_status" ADD VALUE 'en-cours' BEFORE 'actif';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients" ALTER COLUMN "client_status" SET DATA TYPE text;
  ALTER TABLE "partner_clients" ALTER COLUMN "client_status" SET DEFAULT 'actif'::text;
  DROP TYPE "public"."enum_partner_clients_client_status";
  CREATE TYPE "public"."enum_partner_clients_client_status" AS ENUM('actif', 'resilie', 'archive');
  ALTER TABLE "partner_clients" ALTER COLUMN "client_status" SET DEFAULT 'actif'::"public"."enum_partner_clients_client_status";
  ALTER TABLE "partner_clients" ALTER COLUMN "client_status" SET DATA TYPE "public"."enum_partner_clients_client_status" USING "client_status"::"public"."enum_partner_clients_client_status";
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_client_status" SET DATA TYPE text;
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_client_status" SET DEFAULT 'actif'::text;
  DROP TYPE "public"."enum__partner_clients_v_version_client_status";
  CREATE TYPE "public"."enum__partner_clients_v_version_client_status" AS ENUM('actif', 'resilie', 'archive');
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_client_status" SET DEFAULT 'actif'::"public"."enum__partner_clients_v_version_client_status";
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_client_status" SET DATA TYPE "public"."enum__partner_clients_v_version_client_status" USING "version_client_status"::"public"."enum__partner_clients_v_version_client_status";`)
}
