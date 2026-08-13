import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_partners_scheduling_weekdays" AS ENUM('1', '2', '3', '4', '5', '6', '7');
  CREATE TYPE "public"."enum_partners_scheduling_start_time" AS ENUM('07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00');
  CREATE TYPE "public"."enum_partners_scheduling_end_time" AS ENUM('07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00');
  CREATE TABLE "partners_scheduling_weekdays" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_partners_scheduling_weekdays",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "partners" ADD COLUMN "scheduling_enabled" boolean DEFAULT true;
  ALTER TABLE "partners" ADD COLUMN "scheduling_start_time" "enum_partners_scheduling_start_time" DEFAULT '09:00';
  ALTER TABLE "partners" ADD COLUMN "scheduling_end_time" "enum_partners_scheduling_end_time" DEFAULT '18:00';
  ALTER TABLE "partners" ADD COLUMN "scheduling_duration_min" numeric DEFAULT 45;
  ALTER TABLE "partners" ADD COLUMN "scheduling_buffer_min" numeric DEFAULT 15;
  ALTER TABLE "partners" ADD COLUMN "scheduling_min_notice_hours" numeric DEFAULT 24;
  ALTER TABLE "partners" ADD COLUMN "scheduling_horizon_days" numeric DEFAULT 15;
  ALTER TABLE "partners_scheduling_weekdays" ADD CONSTRAINT "partners_scheduling_weekdays_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "partners_scheduling_weekdays_order_idx" ON "partners_scheduling_weekdays" USING btree ("order");
  CREATE INDEX "partners_scheduling_weekdays_parent_idx" ON "partners_scheduling_weekdays" USING btree ("parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "partners_scheduling_weekdays" CASCADE;
  ALTER TABLE "partners" DROP COLUMN "scheduling_enabled";
  ALTER TABLE "partners" DROP COLUMN "scheduling_start_time";
  ALTER TABLE "partners" DROP COLUMN "scheduling_end_time";
  ALTER TABLE "partners" DROP COLUMN "scheduling_duration_min";
  ALTER TABLE "partners" DROP COLUMN "scheduling_buffer_min";
  ALTER TABLE "partners" DROP COLUMN "scheduling_min_notice_hours";
  ALTER TABLE "partners" DROP COLUMN "scheduling_horizon_days";
  DROP TYPE "public"."enum_partners_scheduling_weekdays";
  DROP TYPE "public"."enum_partners_scheduling_start_time";
  DROP TYPE "public"."enum_partners_scheduling_end_time";`)
}
