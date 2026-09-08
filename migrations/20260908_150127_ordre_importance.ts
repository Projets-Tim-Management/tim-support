import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "developments" ADD COLUMN "rank" numeric;
  CREATE INDEX "developments_rank_idx" ON "developments" USING btree ("rank");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "developments_rank_idx";
  ALTER TABLE "developments" DROP COLUMN "rank";`)
}
