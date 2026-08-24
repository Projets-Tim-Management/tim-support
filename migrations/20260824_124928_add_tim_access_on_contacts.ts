import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_contacts" ADD COLUMN "tim_code" varchar;
  ALTER TABLE "client_contacts" ADD COLUMN "tim_password" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_contacts" DROP COLUMN "tim_code";
  ALTER TABLE "client_contacts" DROP COLUMN "tim_password";`)
}
