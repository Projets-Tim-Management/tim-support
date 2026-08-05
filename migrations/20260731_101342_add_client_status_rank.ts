import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients" ADD COLUMN "status_rank" numeric;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_status_rank" numeric;
  UPDATE "partner_clients" SET "status_rank" = CASE "client_status"
    WHEN 'actif' THEN 0 WHEN 'en-cours' THEN 1 WHEN 'prospect' THEN 2
    WHEN 'resilie' THEN 3 WHEN 'archive' THEN 4 ELSE 9 END;
  UPDATE "_partner_clients_v" SET "version_status_rank" = CASE "version_client_status"
    WHEN 'actif' THEN 0 WHEN 'en-cours' THEN 1 WHEN 'prospect' THEN 2
    WHEN 'resilie' THEN 3 WHEN 'archive' THEN 4 ELSE 9 END;
  CREATE INDEX "partner_clients_status_rank_idx" ON "partner_clients" USING btree ("status_rank");
  CREATE INDEX "_partner_clients_v_version_version_status_rank_idx" ON "_partner_clients_v" USING btree ("version_status_rank");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "partner_clients_status_rank_idx";
  DROP INDEX "_partner_clients_v_version_version_status_rank_idx";
  ALTER TABLE "partner_clients" DROP COLUMN "status_rank";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_status_rank";`)
}
