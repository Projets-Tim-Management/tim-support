import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_partner_clients_naf_source" AS ENUM('insee', 'manuel');
  CREATE TYPE "public"."enum__partner_clients_v_version_naf_source" AS ENUM('insee', 'manuel');
  ALTER TABLE "partner_clients" ADD COLUMN "naf" varchar;
  ALTER TABLE "partner_clients" ADD COLUMN "naf_label" varchar;
  ALTER TABLE "partner_clients" ADD COLUMN "naf_source" "enum_partner_clients_naf_source";
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_naf" varchar;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_naf_label" varchar;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_naf_source" "enum__partner_clients_v_version_naf_source";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients" DROP COLUMN "naf";
  ALTER TABLE "partner_clients" DROP COLUMN "naf_label";
  ALTER TABLE "partner_clients" DROP COLUMN "naf_source";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_naf";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_naf_label";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_naf_source";
  DROP TYPE "public"."enum_partner_clients_naf_source";
  DROP TYPE "public"."enum__partner_clients_v_version_naf_source";`)
}
