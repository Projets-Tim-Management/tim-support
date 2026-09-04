import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sequences_messages" ALTER COLUMN "cta" DROP NOT NULL;
  ALTER TABLE "sequences_messages" ALTER COLUMN "url" DROP NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sequences_messages" ALTER COLUMN "cta" SET NOT NULL;
  ALTER TABLE "sequences_messages" ALTER COLUMN "url" SET NOT NULL;`)
}
