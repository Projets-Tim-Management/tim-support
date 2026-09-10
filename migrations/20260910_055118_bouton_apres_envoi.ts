import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "forms" ADD COLUMN "success_cta_label" varchar;
  ALTER TABLE "forms" ADD COLUMN "success_cta_url" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "forms" DROP COLUMN "success_cta_label";
  ALTER TABLE "forms" DROP COLUMN "success_cta_url";`)
}
