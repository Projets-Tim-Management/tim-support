import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "booking_types" ADD COLUMN "no_same_day" boolean DEFAULT true;
  ALTER TABLE "booking_types" ADD COLUMN "limited_slots" boolean DEFAULT true;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "booking_types" DROP COLUMN "no_same_day";
  ALTER TABLE "booking_types" DROP COLUMN "limited_slots";`)
}
