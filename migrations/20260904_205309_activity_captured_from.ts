import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_activities" ADD COLUMN "captured_from" varchar;
  CREATE INDEX "client_activities_captured_from_idx" ON "client_activities" USING btree ("captured_from");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "client_activities_captured_from_idx";
  ALTER TABLE "client_activities" DROP COLUMN "captured_from";`)
}
