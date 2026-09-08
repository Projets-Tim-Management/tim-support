import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_dev_statuses_roles" AS ENUM('demarre', 'livre', 'cloture');
  CREATE TYPE "public"."enum_dev_statuses_color" AS ENUM('slate', 'blue', 'teal', 'indigo', 'purple', 'green', 'amber', 'rose', 'red', 'gray');
  CREATE TYPE "public"."enum_dev_statuses_phase" AS ENUM('entree', 'etude', 'realisation', 'livraison', 'hors-flux');
  CREATE TABLE "dev_statuses_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_dev_statuses_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "dev_statuses" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"color" "enum_dev_statuses_color" DEFAULT 'slate',
  	"phase" "enum_dev_statuses_phase" DEFAULT 'entree' NOT NULL,
  	"hint" varchar,
  	"position" numeric DEFAULT 999 NOT NULL,
  	"key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  DROP INDEX "developments_status_idx";
  ALTER TABLE "developments" ADD COLUMN "status_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "dev_statuses_id" integer;
  ALTER TABLE "dev_statuses_roles" ADD CONSTRAINT "dev_statuses_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."dev_statuses"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "dev_statuses_roles_order_idx" ON "dev_statuses_roles" USING btree ("order");
  CREATE INDEX "dev_statuses_roles_parent_idx" ON "dev_statuses_roles" USING btree ("parent_id");
  CREATE INDEX "dev_statuses_phase_idx" ON "dev_statuses" USING btree ("phase");
  CREATE INDEX "dev_statuses_position_idx" ON "dev_statuses" USING btree ("position");
  CREATE UNIQUE INDEX "dev_statuses_key_idx" ON "dev_statuses" USING btree ("key");
  CREATE INDEX "dev_statuses_updated_at_idx" ON "dev_statuses" USING btree ("updated_at");
  CREATE INDEX "dev_statuses_created_at_idx" ON "dev_statuses" USING btree ("created_at");
  ALTER TABLE "developments" ADD CONSTRAINT "developments_status_id_dev_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."dev_statuses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_dev_statuses_fk" FOREIGN KEY ("dev_statuses_id") REFERENCES "public"."dev_statuses"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_dev_statuses_id_idx" ON "payload_locked_documents_rels" USING btree ("dev_statuses_id");
  CREATE INDEX "developments_status_idx" ON "developments" USING btree ("status_id");
  ALTER TABLE "developments" DROP COLUMN "status";
  DROP TYPE "public"."enum_developments_status";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_developments_status" AS ENUM('a-trier', 'qualification', 'etude', 'investigation', 'chiffrage', 'attente-validation', 'prete', 'en-cours', 'en-revue', 'en-recette', 'a-deployer', 'en-production', 'a-documenter', 'termine', 'en-attente', 'non-retenu', 'abandonne', 'doublon');
  ALTER TABLE "dev_statuses_roles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "dev_statuses" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "dev_statuses_roles" CASCADE;
  DROP TABLE "dev_statuses" CASCADE;
  ALTER TABLE "developments" DROP CONSTRAINT "developments_status_id_dev_statuses_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_dev_statuses_fk";
  
  DROP INDEX "payload_locked_documents_rels_dev_statuses_id_idx";
  DROP INDEX "developments_status_idx";
  ALTER TABLE "developments" ADD COLUMN "status" "enum_developments_status" DEFAULT 'a-trier';
  CREATE INDEX "developments_status_idx" ON "developments" USING btree ("status");
  ALTER TABLE "developments" DROP COLUMN "status_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "dev_statuses_id";
  DROP TYPE "public"."enum_dev_statuses_roles";
  DROP TYPE "public"."enum_dev_statuses_color";
  DROP TYPE "public"."enum_dev_statuses_phase";`)
}
