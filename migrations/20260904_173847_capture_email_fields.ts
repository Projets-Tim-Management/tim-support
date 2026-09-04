import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_client_activities_email_direction" AS ENUM('recu', 'envoye');
  ALTER TABLE "client_activities" ADD COLUMN "email_direction" "enum_client_activities_email_direction";
  ALTER TABLE "client_activities" ADD COLUMN "source_message_id" varchar;
  ALTER TABLE "client_activities" ADD COLUMN "attachment_names" varchar;
  CREATE INDEX "client_activities_email_direction_idx" ON "client_activities" USING btree ("email_direction");
  CREATE INDEX "client_activities_source_message_id_idx" ON "client_activities" USING btree ("source_message_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "client_activities_email_direction_idx";
  DROP INDEX "client_activities_source_message_id_idx";
  ALTER TABLE "client_activities" DROP COLUMN "email_direction";
  ALTER TABLE "client_activities" DROP COLUMN "source_message_id";
  ALTER TABLE "client_activities" DROP COLUMN "attachment_names";
  DROP TYPE "public"."enum_client_activities_email_direction";`)
}
