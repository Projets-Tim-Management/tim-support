import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ad_retouches_status" AS ENUM('en-attente', 'en-cours', 'faite', 'echec');
  ALTER TYPE "public"."enum_ad_instructions_origin" ADD VALUE 'retouche';
  CREATE TABLE "ad_retouches" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"creative_id" integer NOT NULL,
  	"instruction" varchar NOT NULL,
  	"author_id" integer,
  	"generalize" boolean DEFAULT false,
  	"instruction_doc_id" integer,
  	"status" "enum_ad_retouches_status" DEFAULT 'en-attente' NOT NULL,
  	"cost_eur" numeric,
  	"done_at" timestamp(3) with time zone,
  	"summary" varchar,
  	"error" varchar,
  	"before" jsonb,
  	"after" jsonb,
  	"attempts" numeric DEFAULT 0,
  	"lease_until" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_retouches_id" integer;
  ALTER TABLE "ad_retouches" ADD CONSTRAINT "ad_retouches_creative_id_ad_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."ad_creatives"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_retouches" ADD CONSTRAINT "ad_retouches_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_retouches" ADD CONSTRAINT "ad_retouches_instruction_doc_id_ad_instructions_id_fk" FOREIGN KEY ("instruction_doc_id") REFERENCES "public"."ad_instructions"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ad_retouches_creative_idx" ON "ad_retouches" USING btree ("creative_id");
  CREATE INDEX "ad_retouches_author_idx" ON "ad_retouches" USING btree ("author_id");
  CREATE INDEX "ad_retouches_instruction_doc_idx" ON "ad_retouches" USING btree ("instruction_doc_id");
  CREATE INDEX "ad_retouches_status_idx" ON "ad_retouches" USING btree ("status");
  CREATE INDEX "ad_retouches_lease_until_idx" ON "ad_retouches" USING btree ("lease_until");
  CREATE INDEX "ad_retouches_updated_at_idx" ON "ad_retouches" USING btree ("updated_at");
  CREATE INDEX "ad_retouches_created_at_idx" ON "ad_retouches" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_retouches_fk" FOREIGN KEY ("ad_retouches_id") REFERENCES "public"."ad_retouches"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ad_retouches_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_retouches_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ad_retouches" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ad_retouches" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_retouches_fk";
  
  ALTER TABLE "ad_instructions" ALTER COLUMN "origin" SET DATA TYPE text;
  ALTER TABLE "ad_instructions" ALTER COLUMN "origin" SET DEFAULT 'saisie'::text;
  DROP TYPE "public"."enum_ad_instructions_origin";
  CREATE TYPE "public"."enum_ad_instructions_origin" AS ENUM('saisie', 'refus');
  ALTER TABLE "ad_instructions" ALTER COLUMN "origin" SET DEFAULT 'saisie'::"public"."enum_ad_instructions_origin";
  ALTER TABLE "ad_instructions" ALTER COLUMN "origin" SET DATA TYPE "public"."enum_ad_instructions_origin" USING "origin"::"public"."enum_ad_instructions_origin";
  DROP INDEX "payload_locked_documents_rels_ad_retouches_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_retouches_id";
  DROP TYPE "public"."enum_ad_retouches_status";`)
}
