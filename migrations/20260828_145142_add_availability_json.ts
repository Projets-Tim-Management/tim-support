import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partners" ALTER COLUMN "scheduling_start_time" SET DATA TYPE varchar;
  ALTER TABLE "partners" ALTER COLUMN "scheduling_start_time" DROP DEFAULT;
  ALTER TABLE "partners" ALTER COLUMN "scheduling_end_time" SET DATA TYPE varchar;
  ALTER TABLE "partners" ALTER COLUMN "scheduling_end_time" DROP DEFAULT;
  ALTER TABLE "partners" ADD COLUMN "scheduling_hours" jsonb;
  ALTER TABLE "partners" ADD COLUMN "scheduling_date_overrides" jsonb;
  DROP TYPE "public"."enum_partners_scheduling_start_time";
  DROP TYPE "public"."enum_partners_scheduling_end_time";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_partners_scheduling_start_time" AS ENUM('07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00');
  CREATE TYPE "public"."enum_partners_scheduling_end_time" AS ENUM('07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00');
  ALTER TABLE "partners" ALTER COLUMN "scheduling_start_time" SET DEFAULT '09:00'::"public"."enum_partners_scheduling_start_time";
  ALTER TABLE "partners" ALTER COLUMN "scheduling_start_time" SET DATA TYPE "public"."enum_partners_scheduling_start_time" USING "scheduling_start_time"::"public"."enum_partners_scheduling_start_time";
  ALTER TABLE "partners" ALTER COLUMN "scheduling_end_time" SET DEFAULT '18:00'::"public"."enum_partners_scheduling_end_time";
  ALTER TABLE "partners" ALTER COLUMN "scheduling_end_time" SET DATA TYPE "public"."enum_partners_scheduling_end_time" USING "scheduling_end_time"::"public"."enum_partners_scheduling_end_time";
  ALTER TABLE "partners" DROP COLUMN "scheduling_hours";
  ALTER TABLE "partners" DROP COLUMN "scheduling_date_overrides";`)
}
