import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients_history" ADD COLUMN "validated_at" timestamp(3) with time zone;
  ALTER TABLE "partner_clients_history" ADD COLUMN "validated_by_id" integer;
  ALTER TABLE "partner_clients_history" ADD COLUMN "invoice_date" timestamp(3) with time zone;
  ALTER TABLE "_partner_clients_v_version_history" ADD COLUMN "validated_at" timestamp(3) with time zone;
  ALTER TABLE "_partner_clients_v_version_history" ADD COLUMN "validated_by_id" integer;
  ALTER TABLE "_partner_clients_v_version_history" ADD COLUMN "invoice_date" timestamp(3) with time zone;
  ALTER TABLE "partner_clients_history" ADD CONSTRAINT "partner_clients_history_validated_by_id_users_id_fk" FOREIGN KEY ("validated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_partner_clients_v_version_history" ADD CONSTRAINT "_partner_clients_v_version_history_validated_by_id_users_id_fk" FOREIGN KEY ("validated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "partner_clients_history_validated_by_idx" ON "partner_clients_history" USING btree ("validated_by_id");
  CREATE INDEX "_partner_clients_v_version_history_validated_by_idx" ON "_partner_clients_v_version_history" USING btree ("validated_by_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients_history" DROP CONSTRAINT "partner_clients_history_validated_by_id_users_id_fk";
  
  ALTER TABLE "_partner_clients_v_version_history" DROP CONSTRAINT "_partner_clients_v_version_history_validated_by_id_users_id_fk";
  
  DROP INDEX "partner_clients_history_validated_by_idx";
  DROP INDEX "_partner_clients_v_version_history_validated_by_idx";
  ALTER TABLE "partner_clients_history" DROP COLUMN "validated_at";
  ALTER TABLE "partner_clients_history" DROP COLUMN "validated_by_id";
  ALTER TABLE "partner_clients_history" DROP COLUMN "invoice_date";
  ALTER TABLE "_partner_clients_v_version_history" DROP COLUMN "validated_at";
  ALTER TABLE "_partner_clients_v_version_history" DROP COLUMN "validated_by_id";
  ALTER TABLE "_partner_clients_v_version_history" DROP COLUMN "invoice_date";`)
}
