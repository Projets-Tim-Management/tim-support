import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_partner_clients_heard_from" AS ENUM('google', 'ia', 'linkedin', 'facebook-instagram', 'youtube', 'recommandation', 'salon', 'autre');
  CREATE TYPE "public"."enum__partner_clients_v_version_heard_from" AS ENUM('google', 'ia', 'linkedin', 'facebook-instagram', 'youtube', 'recommandation', 'salon', 'autre');
  CREATE TYPE "public"."enum_bookings_heard_from" AS ENUM('google', 'ia', 'linkedin', 'facebook-instagram', 'youtube', 'recommandation', 'salon', 'autre');
  ALTER TABLE "booking_types" ALTER COLUMN "scheduling_hours" SET DEFAULT '{"1":[{"start":"08:00","end":"19:00"}],"2":[{"start":"08:00","end":"19:00"}],"3":[{"start":"08:00","end":"19:00"}],"4":[{"start":"08:00","end":"19:00"}],"5":[{"start":"08:00","end":"19:00"}]}'::jsonb;
  ALTER TABLE "booking_types" ALTER COLUMN "buffer_before_min" SET DEFAULT 30;
  ALTER TABLE "booking_types" ALTER COLUMN "buffer_after_min" SET DEFAULT 30;
  ALTER TABLE "partner_clients" ADD COLUMN "heard_from" "enum_partner_clients_heard_from";
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_heard_from" "enum__partner_clients_v_version_heard_from";
  ALTER TABLE "bookings" ADD COLUMN "heard_from" "enum_bookings_heard_from";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "booking_types" ALTER COLUMN "scheduling_hours" DROP DEFAULT;
  ALTER TABLE "booking_types" ALTER COLUMN "buffer_before_min" SET DEFAULT 0;
  ALTER TABLE "booking_types" ALTER COLUMN "buffer_after_min" SET DEFAULT 10;
  ALTER TABLE "partner_clients" DROP COLUMN "heard_from";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_heard_from";
  ALTER TABLE "bookings" DROP COLUMN "heard_from";
  DROP TYPE "public"."enum_partner_clients_heard_from";
  DROP TYPE "public"."enum__partner_clients_v_version_heard_from";
  DROP TYPE "public"."enum_bookings_heard_from";`)
}
