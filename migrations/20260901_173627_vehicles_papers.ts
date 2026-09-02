import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_vehicles" ALTER COLUMN "insurance_date" DROP NOT NULL;
  ALTER TABLE "client_machines" ALTER COLUMN "insurance_date" DROP NOT NULL;
  ALTER TABLE "client_vehicles" ADD COLUMN "registration_date" timestamp(3) with time zone;
  ALTER TABLE "client_vehicles" ADD COLUMN "inspection_date" timestamp(3) with time zone;
  ALTER TABLE "client_machines" ADD COLUMN "registration_date" timestamp(3) with time zone;
  ALTER TABLE "client_machines" ADD COLUMN "inspection_date" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_vehicles" ALTER COLUMN "insurance_date" SET NOT NULL;
  ALTER TABLE "client_machines" ALTER COLUMN "insurance_date" SET NOT NULL;
  ALTER TABLE "client_vehicles" DROP COLUMN "registration_date";
  ALTER TABLE "client_vehicles" DROP COLUMN "inspection_date";
  ALTER TABLE "client_machines" DROP COLUMN "registration_date";
  ALTER TABLE "client_machines" DROP COLUMN "inspection_date";`)
}
