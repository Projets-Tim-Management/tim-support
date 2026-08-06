import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "rewards" ADD COLUMN "purchase_price" numeric;
  ALTER TABLE "rewards" ADD COLUMN "supplier" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "rewards" DROP COLUMN "purchase_price";
  ALTER TABLE "rewards" DROP COLUMN "supplier";`)
}
