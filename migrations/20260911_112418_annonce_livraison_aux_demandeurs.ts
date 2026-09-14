import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_dev_statuses_roles" ADD VALUE 'annonce';
  ALTER TABLE "developments" ADD COLUMN "announced_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "dev_statuses_roles" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_dev_statuses_roles";
  CREATE TYPE "public"."enum_dev_statuses_roles" AS ENUM('demarre', 'livre', 'cloture');
  ALTER TABLE "dev_statuses_roles" ALTER COLUMN "value" SET DATA TYPE "public"."enum_dev_statuses_roles" USING "value"::"public"."enum_dev_statuses_roles";
  ALTER TABLE "developments" DROP COLUMN "announced_at";`)
}
