import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tickets" ADD COLUMN "client_id" integer;
  ALTER TABLE "tickets" ADD CONSTRAINT "tickets_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "tickets_client_idx" ON "tickets" USING btree ("client_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tickets" DROP CONSTRAINT "tickets_client_id_partner_clients_id_fk";
  
  DROP INDEX "tickets_client_idx";
  ALTER TABLE "tickets" DROP COLUMN "client_id";`)
}
