import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_employees" ALTER COLUMN "poste" DROP NOT NULL;
  ALTER TABLE "client_employees" ALTER COLUMN "company" SET NOT NULL;
  ALTER TABLE "client_employees" ALTER COLUMN "contract_type" DROP NOT NULL;
  ALTER TABLE "client_sites" ALTER COLUMN "end_date" SET NOT NULL;
  ALTER TABLE "client_vehicles" ALTER COLUMN "year" SET NOT NULL;
  ALTER TABLE "client_vehicles" ALTER COLUMN "insurance_date" SET NOT NULL;
  ALTER TABLE "client_machines" ALTER COLUMN "year" SET NOT NULL;
  ALTER TABLE "client_machines" ALTER COLUMN "insurance_date" SET NOT NULL;
  ALTER TABLE "client_sites" ADD COLUMN "code" varchar NOT NULL;
  CREATE INDEX "client_sites_code_idx" ON "client_sites" USING btree ("code");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "client_sites_code_idx";
  ALTER TABLE "client_employees" ALTER COLUMN "company" DROP NOT NULL;
  ALTER TABLE "client_employees" ALTER COLUMN "poste" SET NOT NULL;
  ALTER TABLE "client_employees" ALTER COLUMN "contract_type" SET NOT NULL;
  ALTER TABLE "client_sites" ALTER COLUMN "end_date" DROP NOT NULL;
  ALTER TABLE "client_vehicles" ALTER COLUMN "year" DROP NOT NULL;
  ALTER TABLE "client_vehicles" ALTER COLUMN "insurance_date" DROP NOT NULL;
  ALTER TABLE "client_machines" ALTER COLUMN "year" DROP NOT NULL;
  ALTER TABLE "client_machines" ALTER COLUMN "insurance_date" DROP NOT NULL;
  ALTER TABLE "client_sites" DROP COLUMN "code";`)
}
