import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_contracts" ADD COLUMN "params" jsonb;
  ALTER TABLE "client_contracts" ADD COLUMN "variables" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_contracts" DROP COLUMN "params";
  ALTER TABLE "client_contracts" DROP COLUMN "variables";`)
}
