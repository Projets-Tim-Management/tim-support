import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_contacts" DROP COLUMN "status";
  DROP TYPE "public"."enum_client_contacts_status";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_client_contacts_status" AS ENUM('prospect', 'en-cours');
  ALTER TABLE "client_contacts" ADD COLUMN "status" "enum_client_contacts_status" DEFAULT 'prospect';`)
}
