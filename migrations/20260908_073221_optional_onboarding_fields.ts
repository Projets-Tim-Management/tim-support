import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_sites" ALTER COLUMN "code" DROP NOT NULL;
  ALTER TABLE "client_vehicles" ALTER COLUMN "plate" DROP NOT NULL;
  ALTER TABLE "client_vehicles" ALTER COLUMN "license_types" DROP NOT NULL;
  ALTER TABLE "client_machines" ALTER COLUMN "serial" DROP NOT NULL;
  ALTER TABLE "client_machines" ALTER COLUMN "caces_types" DROP NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_sites" ALTER COLUMN "code" SET NOT NULL;
  ALTER TABLE "client_vehicles" ALTER COLUMN "plate" SET NOT NULL;
  ALTER TABLE "client_vehicles" ALTER COLUMN "license_types" SET NOT NULL;
  ALTER TABLE "client_machines" ALTER COLUMN "serial" SET NOT NULL;
  ALTER TABLE "client_machines" ALTER COLUMN "caces_types" SET NOT NULL;`)
}
