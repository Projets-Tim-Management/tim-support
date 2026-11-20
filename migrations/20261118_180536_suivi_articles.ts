import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "articles" ADD COLUMN "backlinks_pending" boolean;
  ALTER TABLE "articles" ADD COLUMN "review30" jsonb;
  ALTER TABLE "articles" ADD COLUMN "review90" jsonb;
  ALTER TABLE "articles" ADD COLUMN "backlinks" jsonb;
  CREATE INDEX "articles_backlinks_pending_idx" ON "articles" USING btree ("backlinks_pending");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "articles_backlinks_pending_idx";
  ALTER TABLE "articles" DROP COLUMN "backlinks_pending";
  ALTER TABLE "articles" DROP COLUMN "review30";
  ALTER TABLE "articles" DROP COLUMN "review90";
  ALTER TABLE "articles" DROP COLUMN "backlinks";`)
}
