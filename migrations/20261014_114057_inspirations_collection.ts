import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ad_inspirations_verdict" AS ENUM('aimer', 'eviter');
  CREATE TYPE "public"."enum_ad_inspirations_media_type" AS ENUM('video', 'image');
  CREATE TYPE "public"."enum_ad_inspirations_processing_status" AS ENUM('en-attente', 'en-cours', 'pret', 'echec');
  CREATE TYPE "public"."enum_ad_inspirations_ai_status" AS ENUM('proposee', 'validee', 'ecartee');
  CREATE TABLE "ad_inspirations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"original_url" varchar,
  	"original_pathname" varchar,
  	"original_filename" varchar,
  	"original_content_type" varchar,
  	"original_size" numeric,
  	"title" varchar NOT NULL,
  	"verdict" "enum_ad_inspirations_verdict" DEFAULT 'aimer' NOT NULL,
  	"link" varchar,
  	"why" varchar NOT NULL,
  	"media_type" "enum_ad_inspirations_media_type",
  	"processing_status" "enum_ad_inspirations_processing_status" DEFAULT 'en-attente',
  	"processing_error" varchar,
  	"processing_attempts" numeric DEFAULT 0,
  	"processing_processed_at" timestamp(3) with time zone,
  	"processing_lease_until" timestamp(3) with time zone,
  	"working_url" varchar,
  	"working_poster_url" varchar,
  	"working_keyframes" jsonb,
  	"working_meta" jsonb,
  	"ai_proposal" varchar,
  	"ai_timeline" jsonb,
  	"ai_status" "enum_ad_inspirations_ai_status",
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_inspirations_id" integer;
  CREATE INDEX "ad_inspirations_media_type_idx" ON "ad_inspirations" USING btree ("media_type");
  CREATE INDEX "ad_inspirations_processing_processing_status_idx" ON "ad_inspirations" USING btree ("processing_status");
  CREATE INDEX "ad_inspirations_processing_processing_lease_until_idx" ON "ad_inspirations" USING btree ("processing_lease_until");
  CREATE INDEX "ad_inspirations_updated_at_idx" ON "ad_inspirations" USING btree ("updated_at");
  CREATE INDEX "ad_inspirations_created_at_idx" ON "ad_inspirations" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_inspirations_fk" FOREIGN KEY ("ad_inspirations_id") REFERENCES "public"."ad_inspirations"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ad_inspirations_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_inspirations_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ad_inspirations" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ad_inspirations" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_inspirations_fk";
  
  DROP INDEX "payload_locked_documents_rels_ad_inspirations_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_inspirations_id";
  DROP TYPE "public"."enum_ad_inspirations_verdict";
  DROP TYPE "public"."enum_ad_inspirations_media_type";
  DROP TYPE "public"."enum_ad_inspirations_processing_status";
  DROP TYPE "public"."enum_ad_inspirations_ai_status";`)
}
