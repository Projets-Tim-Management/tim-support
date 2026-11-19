import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "competitor_snapshots" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"keyword" varchar NOT NULL,
  	"keyword_key" varchar NOT NULL,
  	"taken_at" timestamp(3) with time zone NOT NULL,
  	"cost_usd" numeric,
  	"valid_pages" numeric,
  	"domains" numeric,
  	"check_url" varchar,
  	"serp" jsonb,
  	"questions" jsonb,
  	"pages" jsonb,
  	"corpus" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "articles" ADD COLUMN "score_coverage" numeric;
  ALTER TABLE "articles" ADD COLUMN "coverage_target" numeric;
  ALTER TABLE "articles" ADD COLUMN "competitors_at" timestamp(3) with time zone;
  ALTER TABLE "job_sheets" ADD COLUMN "score_coverage" numeric;
  ALTER TABLE "job_sheets" ADD COLUMN "coverage_target" numeric;
  ALTER TABLE "job_sheets" ADD COLUMN "competitors_at" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "competitor_snapshots_id" integer;
  CREATE INDEX "competitor_snapshots_keyword_key_idx" ON "competitor_snapshots" USING btree ("keyword_key");
  CREATE INDEX "competitor_snapshots_taken_at_idx" ON "competitor_snapshots" USING btree ("taken_at");
  CREATE INDEX "competitor_snapshots_updated_at_idx" ON "competitor_snapshots" USING btree ("updated_at");
  CREATE INDEX "competitor_snapshots_created_at_idx" ON "competitor_snapshots" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_competitor_snapshots_fk" FOREIGN KEY ("competitor_snapshots_id") REFERENCES "public"."competitor_snapshots"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "articles_score_coverage_idx" ON "articles" USING btree ("score_coverage");
  CREATE INDEX "articles_competitors_at_idx" ON "articles" USING btree ("competitors_at");
  CREATE INDEX "job_sheets_score_coverage_idx" ON "job_sheets" USING btree ("score_coverage");
  CREATE INDEX "job_sheets_competitors_at_idx" ON "job_sheets" USING btree ("competitors_at");
  CREATE INDEX "payload_locked_documents_rels_competitor_snapshots_id_idx" ON "payload_locked_documents_rels" USING btree ("competitor_snapshots_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "competitor_snapshots" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "competitor_snapshots" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_competitor_snapshots_fk";
  
  DROP INDEX "articles_score_coverage_idx";
  DROP INDEX "articles_competitors_at_idx";
  DROP INDEX "job_sheets_score_coverage_idx";
  DROP INDEX "job_sheets_competitors_at_idx";
  DROP INDEX "payload_locked_documents_rels_competitor_snapshots_id_idx";
  ALTER TABLE "articles" DROP COLUMN "score_coverage";
  ALTER TABLE "articles" DROP COLUMN "coverage_target";
  ALTER TABLE "articles" DROP COLUMN "competitors_at";
  ALTER TABLE "job_sheets" DROP COLUMN "score_coverage";
  ALTER TABLE "job_sheets" DROP COLUMN "coverage_target";
  ALTER TABLE "job_sheets" DROP COLUMN "competitors_at";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "competitor_snapshots_id";`)
}
