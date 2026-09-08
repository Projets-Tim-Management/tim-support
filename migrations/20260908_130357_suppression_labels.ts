import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "dev_labels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "dev_labels" CASCADE;
  -- « IF EXISTS » ajouté à la main : le DROP TABLE ... CASCADE ci-dessus a déjà
  -- emporté les clés étrangères qui pointaient vers dev_labels, et les redemander
  -- faisait échouer toute la migration (le générateur les écrit sans condition).
  ALTER TABLE "developments_rels" DROP CONSTRAINT IF EXISTS "developments_rels_dev_labels_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_dev_labels_fk";
  DROP INDEX IF EXISTS "developments_rels_dev_labels_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_dev_labels_id_idx";
  ALTER TABLE "developments_rels" DROP COLUMN "dev_labels_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "dev_labels_id";
  DROP TYPE "public"."enum_dev_labels_color";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_dev_labels_color" AS ENUM('slate', 'blue', 'teal', 'indigo', 'purple', 'green', 'amber', 'rose', 'red', 'gray');
  CREATE TABLE "dev_labels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"color" "enum_dev_labels_color" DEFAULT 'slate',
  	"description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "developments_rels" ADD COLUMN "dev_labels_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "dev_labels_id" integer;
  CREATE UNIQUE INDEX "dev_labels_name_idx" ON "dev_labels" USING btree ("name");
  CREATE INDEX "dev_labels_updated_at_idx" ON "dev_labels" USING btree ("updated_at");
  CREATE INDEX "dev_labels_created_at_idx" ON "dev_labels" USING btree ("created_at");
  ALTER TABLE "developments_rels" ADD CONSTRAINT "developments_rels_dev_labels_fk" FOREIGN KEY ("dev_labels_id") REFERENCES "public"."dev_labels"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_dev_labels_fk" FOREIGN KEY ("dev_labels_id") REFERENCES "public"."dev_labels"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "developments_rels_dev_labels_id_idx" ON "developments_rels" USING btree ("dev_labels_id");
  CREATE INDEX "payload_locked_documents_rels_dev_labels_id_idx" ON "payload_locked_documents_rels" USING btree ("dev_labels_id");`)
}
