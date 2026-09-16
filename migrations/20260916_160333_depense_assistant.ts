import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "support_connections_entries" ADD COLUMN "spend_day" varchar;
  ALTER TABLE "support_connections_entries" ADD COLUMN "spend_eur" numeric;
  ALTER TABLE "support_connections_entries" ADD COLUMN "spend_questions" numeric;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "support_connections_entries" DROP COLUMN "spend_day";
  ALTER TABLE "support_connections_entries" DROP COLUMN "spend_eur";
  ALTER TABLE "support_connections_entries" DROP COLUMN "spend_questions";`)
}
