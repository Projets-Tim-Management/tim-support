import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tickets" ALTER COLUMN "subject" DROP NOT NULL;
  ALTER TABLE "tickets" ALTER COLUMN "description" DROP NOT NULL;
  ALTER TABLE "tickets" ADD COLUMN "first_name" varchar;
  ALTER TABLE "tickets" ADD COLUMN "company" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tickets" ALTER COLUMN "subject" SET NOT NULL;
  ALTER TABLE "tickets" ALTER COLUMN "description" SET NOT NULL;
  ALTER TABLE "tickets" DROP COLUMN "first_name";
  ALTER TABLE "tickets" DROP COLUMN "company";`)
}
