import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients" ADD COLUMN "ga4_qualify_sent_at" timestamp(3) with time zone;
  ALTER TABLE "partner_clients" ADD COLUMN "ga4_close_sent_at" timestamp(3) with time zone;
  ALTER TABLE "partner_clients" ADD COLUMN "ga4_close_wait_since" timestamp(3) with time zone;
  ALTER TABLE "partner_clients" ADD COLUMN "ga4_error" varchar;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_ga4_qualify_sent_at" timestamp(3) with time zone;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_ga4_close_sent_at" timestamp(3) with time zone;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_ga4_close_wait_since" timestamp(3) with time zone;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_ga4_error" varchar;
  ALTER TABLE "form_submissions" ADD COLUMN "ga_client_id" varchar;
  ALTER TABLE "form_submissions" ADD COLUMN "ga_session_id" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients" DROP COLUMN "ga4_qualify_sent_at";
  ALTER TABLE "partner_clients" DROP COLUMN "ga4_close_sent_at";
  ALTER TABLE "partner_clients" DROP COLUMN "ga4_close_wait_since";
  ALTER TABLE "partner_clients" DROP COLUMN "ga4_error";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_ga4_qualify_sent_at";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_ga4_close_sent_at";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_ga4_close_wait_since";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_ga4_error";
  ALTER TABLE "form_submissions" DROP COLUMN "ga_client_id";
  ALTER TABLE "form_submissions" DROP COLUMN "ga_session_id";`)
}
