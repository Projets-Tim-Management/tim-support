import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_activities" ADD COLUMN "email_subject" varchar;
  ALTER TABLE "client_activities" ADD COLUMN "email_from" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_activities" DROP COLUMN "email_subject";
  ALTER TABLE "client_activities" DROP COLUMN "email_from";`)
}
