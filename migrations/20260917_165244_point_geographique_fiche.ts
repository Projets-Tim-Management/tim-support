import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients" ADD COLUMN "geo_lat" numeric;
  ALTER TABLE "partner_clients" ADD COLUMN "geo_lng" numeric;
  ALTER TABLE "partner_clients" ADD COLUMN "geo_city" varchar;
  ALTER TABLE "partner_clients" ADD COLUMN "geo_postcode" varchar;
  ALTER TABLE "partner_clients" ADD COLUMN "geo_label" varchar;
  ALTER TABLE "partner_clients" ADD COLUMN "geo_source" varchar;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_geo_lat" numeric;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_geo_lng" numeric;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_geo_city" varchar;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_geo_postcode" varchar;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_geo_label" varchar;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_geo_source" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients" DROP COLUMN "geo_lat";
  ALTER TABLE "partner_clients" DROP COLUMN "geo_lng";
  ALTER TABLE "partner_clients" DROP COLUMN "geo_city";
  ALTER TABLE "partner_clients" DROP COLUMN "geo_postcode";
  ALTER TABLE "partner_clients" DROP COLUMN "geo_label";
  ALTER TABLE "partner_clients" DROP COLUMN "geo_source";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_geo_lat";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_geo_lng";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_geo_city";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_geo_postcode";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_geo_label";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_geo_source";`)
}
