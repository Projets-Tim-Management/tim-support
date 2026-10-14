import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ad_elements_base" AS ENUM('liste', 'notification', 'bouton', 'planning', 'fiche', 'champ', 'badge', 'tap', 'surbrillance', 'fleche', 'soulignement', 'titre', 'etiquette', 'bulle', 'compteur', 'logo', 'cta', 'pastilles', 'confettis');
  CREATE TYPE "public"."enum_ad_elements_status" AS ENUM('brouillon', 'actif', 'retire');
  CREATE TYPE "public"."enum_ad_elements_preview_status" AS ENUM('en-attente', 'en-cours', 'pret', 'echec');
  CREATE TYPE "public"."enum_ad_element_notes_kind" AS ENUM('idee', 'proposition', 'decision');
  CREATE TYPE "public"."enum_ad_element_notes_status" AS ENUM('a-decider', 'appliquee', 'variante', 'ecartee', 'hors-reglages', 'developpement');
  CREATE TABLE "ad_elements" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"base" "enum_ad_elements_base" NOT NULL,
  	"status" "enum_ad_elements_status" DEFAULT 'brouillon' NOT NULL,
  	"variant_of_id" integer,
  	"when_to_use" varchar NOT NULL,
  	"params" jsonb,
  	"versions" jsonb,
  	"preview_status" "enum_ad_elements_preview_status" DEFAULT 'en-attente',
  	"preview_video_url" varchar,
  	"preview_image_url" varchar,
  	"preview_error" varchar,
  	"preview_attempts" numeric DEFAULT 0,
  	"preview_lease_until" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ad_element_notes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"element_id" integer NOT NULL,
  	"kind" "enum_ad_element_notes_kind" NOT NULL,
  	"author_id" integer,
  	"body" varchar NOT NULL,
  	"proposal" jsonb,
  	"status" "enum_ad_element_notes_status",
  	"variant_id" integer,
  	"development_id" integer,
  	"cost_eur" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_elements_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_element_notes_id" integer;
  ALTER TABLE "ad_elements" ADD CONSTRAINT "ad_elements_variant_of_id_ad_elements_id_fk" FOREIGN KEY ("variant_of_id") REFERENCES "public"."ad_elements"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_element_notes" ADD CONSTRAINT "ad_element_notes_element_id_ad_elements_id_fk" FOREIGN KEY ("element_id") REFERENCES "public"."ad_elements"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_element_notes" ADD CONSTRAINT "ad_element_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_element_notes" ADD CONSTRAINT "ad_element_notes_variant_id_ad_elements_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."ad_elements"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_element_notes" ADD CONSTRAINT "ad_element_notes_development_id_developments_id_fk" FOREIGN KEY ("development_id") REFERENCES "public"."developments"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "ad_elements_name_idx" ON "ad_elements" USING btree ("name");
  CREATE INDEX "ad_elements_base_idx" ON "ad_elements" USING btree ("base");
  CREATE INDEX "ad_elements_status_idx" ON "ad_elements" USING btree ("status");
  CREATE INDEX "ad_elements_variant_of_idx" ON "ad_elements" USING btree ("variant_of_id");
  CREATE INDEX "ad_elements_preview_preview_status_idx" ON "ad_elements" USING btree ("preview_status");
  CREATE INDEX "ad_elements_preview_preview_lease_until_idx" ON "ad_elements" USING btree ("preview_lease_until");
  CREATE INDEX "ad_elements_updated_at_idx" ON "ad_elements" USING btree ("updated_at");
  CREATE INDEX "ad_elements_created_at_idx" ON "ad_elements" USING btree ("created_at");
  CREATE INDEX "ad_element_notes_element_idx" ON "ad_element_notes" USING btree ("element_id");
  CREATE INDEX "ad_element_notes_author_idx" ON "ad_element_notes" USING btree ("author_id");
  CREATE INDEX "ad_element_notes_status_idx" ON "ad_element_notes" USING btree ("status");
  CREATE INDEX "ad_element_notes_variant_idx" ON "ad_element_notes" USING btree ("variant_id");
  CREATE INDEX "ad_element_notes_development_idx" ON "ad_element_notes" USING btree ("development_id");
  CREATE INDEX "ad_element_notes_updated_at_idx" ON "ad_element_notes" USING btree ("updated_at");
  CREATE INDEX "ad_element_notes_created_at_idx" ON "ad_element_notes" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_elements_fk" FOREIGN KEY ("ad_elements_id") REFERENCES "public"."ad_elements"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_element_notes_fk" FOREIGN KEY ("ad_element_notes_id") REFERENCES "public"."ad_element_notes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ad_elements_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_elements_id");
  CREATE INDEX "payload_locked_documents_rels_ad_element_notes_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_element_notes_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ad_elements" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ad_element_notes" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ad_elements" CASCADE;
  DROP TABLE "ad_element_notes" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_elements_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_element_notes_fk";
  
  DROP INDEX "payload_locked_documents_rels_ad_elements_id_idx";
  DROP INDEX "payload_locked_documents_rels_ad_element_notes_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_elements_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_element_notes_id";
  DROP TYPE "public"."enum_ad_elements_base";
  DROP TYPE "public"."enum_ad_elements_status";
  DROP TYPE "public"."enum_ad_elements_preview_status";
  DROP TYPE "public"."enum_ad_element_notes_kind";
  DROP TYPE "public"."enum_ad_element_notes_status";`)
}
