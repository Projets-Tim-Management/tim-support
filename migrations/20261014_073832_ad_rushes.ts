import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ad_rushes_features" AS ENUM('pointage', 'planning', 'feuilles-heures', 'conges', 'suivi-chantier', 'vehicules', 'documents', 'paie', 'autre');
  CREATE TYPE "public"."enum_ad_rushes_source" AS ENUM('app-mobile', 'app-web', 'chantier', 'bureau', 'autre');
  CREATE TYPE "public"."enum_ad_rushes_media_type" AS ENUM('video', 'image');
  CREATE TYPE "public"."enum_ad_rushes_processing_status" AS ENUM('en-attente', 'en-cours', 'pret', 'echec');
  CREATE TYPE "public"."enum_ad_rushes_ai_status" AS ENUM('proposee', 'validee', 'ecartee');
  CREATE TABLE "ad_rushes_features" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_ad_rushes_features",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "ad_rushes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"original_url" varchar,
  	"original_pathname" varchar,
  	"original_filename" varchar,
  	"original_content_type" varchar,
  	"original_size" numeric,
  	"title" varchar NOT NULL,
  	"source" "enum_ad_rushes_source" NOT NULL,
  	"description" varchar NOT NULL,
  	"origin" varchar,
  	"no_real_data" boolean,
  	"media_type" "enum_ad_rushes_media_type",
  	"processing_status" "enum_ad_rushes_processing_status" DEFAULT 'en-attente',
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
  	"ai_status" "enum_ad_rushes_ai_status",
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_rushes_id" integer;
  ALTER TABLE "ad_rushes_features" ADD CONSTRAINT "ad_rushes_features_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ad_rushes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "ad_rushes_features_order_idx" ON "ad_rushes_features" USING btree ("order");
  CREATE INDEX "ad_rushes_features_parent_idx" ON "ad_rushes_features" USING btree ("parent_id");
  CREATE INDEX "ad_rushes_source_idx" ON "ad_rushes" USING btree ("source");
  CREATE INDEX "ad_rushes_media_type_idx" ON "ad_rushes" USING btree ("media_type");
  CREATE INDEX "ad_rushes_processing_processing_status_idx" ON "ad_rushes" USING btree ("processing_status");
  CREATE INDEX "ad_rushes_processing_processing_lease_until_idx" ON "ad_rushes" USING btree ("processing_lease_until");
  CREATE INDEX "ad_rushes_updated_at_idx" ON "ad_rushes" USING btree ("updated_at");
  CREATE INDEX "ad_rushes_created_at_idx" ON "ad_rushes" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_rushes_fk" FOREIGN KEY ("ad_rushes_id") REFERENCES "public"."ad_rushes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ad_rushes_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_rushes_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ad_rushes_features" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ad_rushes" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ad_rushes_features" CASCADE;
  DROP TABLE "ad_rushes" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_rushes_fk";
  
  DROP INDEX "payload_locked_documents_rels_ad_rushes_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_rushes_id";
  DROP TYPE "public"."enum_ad_rushes_features";
  DROP TYPE "public"."enum_ad_rushes_source";
  DROP TYPE "public"."enum_ad_rushes_media_type";
  DROP TYPE "public"."enum_ad_rushes_processing_status";
  DROP TYPE "public"."enum_ad_rushes_ai_status";`)
}
