import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients" ADD COLUMN "logo_id" integer;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_logo_id" integer;
  ALTER TABLE "partner_clients" ADD CONSTRAINT "partner_clients_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_partner_clients_v" ADD CONSTRAINT "_partner_clients_v_version_logo_id_media_id_fk" FOREIGN KEY ("version_logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "partner_clients_logo_idx" ON "partner_clients" USING btree ("logo_id");
  CREATE INDEX "_partner_clients_v_version_version_logo_idx" ON "_partner_clients_v" USING btree ("version_logo_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients" DROP CONSTRAINT "partner_clients_logo_id_media_id_fk";
  
  ALTER TABLE "_partner_clients_v" DROP CONSTRAINT "_partner_clients_v_version_logo_id_media_id_fk";
  
  DROP INDEX "partner_clients_logo_idx";
  DROP INDEX "_partner_clients_v_version_version_logo_idx";
  ALTER TABLE "partner_clients" DROP COLUMN "logo_id";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_logo_id";`)
}
