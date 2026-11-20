import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "articles" ADD COLUMN "gsc_queries" jsonb;
  ALTER TABLE "articles" ADD COLUMN "changes_log" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "articles" DROP COLUMN "gsc_queries";
  ALTER TABLE "articles" DROP COLUMN "changes_log";`)
}
