import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_booking_types_locations" AS ENUM('meet', 'telephone', 'sur-place', 'autre');
  CREATE TYPE "public"."enum_bookings_location_kind" AS ENUM('meet', 'telephone', 'sur-place', 'autre');
  CREATE TABLE "booking_types_locations" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_booking_types_locations",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "booking_types" ALTER COLUMN "location_kind" DROP DEFAULT;
  ALTER TABLE "booking_types" ALTER COLUMN "location_kind" DROP NOT NULL;
  ALTER TABLE "bookings" ADD COLUMN "location_kind" "enum_bookings_location_kind";
  ALTER TABLE "booking_types_locations" ADD CONSTRAINT "booking_types_locations_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."booking_types"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "booking_types_locations_order_idx" ON "booking_types_locations" USING btree ("order");
  CREATE INDEX "booking_types_locations_parent_idx" ON "booking_types_locations" USING btree ("parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "booking_types_locations" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "booking_types_locations" CASCADE;
  ALTER TABLE "booking_types" ALTER COLUMN "location_kind" SET DEFAULT 'meet';
  ALTER TABLE "booking_types" ALTER COLUMN "location_kind" SET NOT NULL;
  ALTER TABLE "bookings" DROP COLUMN "location_kind";
  DROP TYPE "public"."enum_booking_types_locations";
  DROP TYPE "public"."enum_bookings_location_kind";`)
}
