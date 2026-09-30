import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ad_creatives" ADD COLUMN "requested_angle" varchar;
  ALTER TABLE "ad_creatives" ADD COLUMN "run_id" integer;
  ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_run_id_ad_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ad_agent_runs"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ad_creatives_run_idx" ON "ad_creatives" USING btree ("run_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ad_creatives" DROP CONSTRAINT "ad_creatives_run_id_ad_agent_runs_id_fk";
  
  DROP INDEX "ad_creatives_run_idx";
  ALTER TABLE "ad_creatives" DROP COLUMN "requested_angle";
  ALTER TABLE "ad_creatives" DROP COLUMN "run_id";`)
}
