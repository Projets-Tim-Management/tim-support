import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "ads_settings_history" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"changed_by_id" integer,
  	"summary" varchar NOT NULL,
  	"changes" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ads_settings_history_id" integer;
  ALTER TABLE "ads_settings_history" ADD CONSTRAINT "ads_settings_history_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ads_settings_history_changed_by_idx" ON "ads_settings_history" USING btree ("changed_by_id");
  CREATE INDEX "ads_settings_history_updated_at_idx" ON "ads_settings_history" USING btree ("updated_at");
  CREATE INDEX "ads_settings_history_created_at_idx" ON "ads_settings_history" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ads_settings_history_fk" FOREIGN KEY ("ads_settings_history_id") REFERENCES "public"."ads_settings_history"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ads_settings_history_id_idx" ON "payload_locked_documents_rels" USING btree ("ads_settings_history_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ads_settings_history" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ads_settings_history" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ads_settings_history_fk";
  
  DROP INDEX "payload_locked_documents_rels_ads_settings_history_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ads_settings_history_id";`)
}
