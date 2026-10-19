import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "developments" ADD COLUMN "potential" numeric;
  ALTER TABLE "developments" ADD COLUMN "potential_detail" jsonb;
  CREATE INDEX "developments_potential_idx" ON "developments" USING btree ("potential");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "developments_potential_idx";
  ALTER TABLE "developments" DROP COLUMN "potential";
  ALTER TABLE "developments" DROP COLUMN "potential_detail";`)
}
