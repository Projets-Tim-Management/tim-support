import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_partners_scheduling_mode" AS ENUM('creneaux', 'lien');
  ALTER TABLE "partners" ADD COLUMN "scheduling_mode" "enum_partners_scheduling_mode" DEFAULT 'creneaux';
  ALTER TABLE "partners" ADD COLUMN "scheduling_booking_url" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partners" DROP COLUMN "scheduling_mode";
  ALTER TABLE "partners" DROP COLUMN "scheduling_booking_url";
  DROP TYPE "public"."enum_partners_scheduling_mode";`)
}
