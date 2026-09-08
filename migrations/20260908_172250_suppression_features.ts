import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // « IF EXISTS » ajoutés à la main : les DROP TABLE ... CASCADE ci-dessous
  // emportent déjà les clés étrangères et leurs index. Les redemander sans
  // condition faisait échouer toute la migration — le générateur les écrit
  // toujours, sans savoir ce que la cascade a fait avant lui.
  await db.execute(sql`
   ALTER TABLE "dev_groups" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "dev_groups_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "dev_groups" CASCADE;
  DROP TABLE "dev_groups_rels" CASCADE;
  ALTER TABLE "developments" DROP CONSTRAINT IF EXISTS "developments_group_id_dev_groups_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_dev_groups_fk";
  
  DROP INDEX IF EXISTS "developments_group_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_dev_groups_id_idx";
  ALTER TABLE "developments" DROP COLUMN "group_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "dev_groups_id";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "dev_groups" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"parent_id" integer,
  	"client_id" integer,
  	"path_title" varchar,
  	"sort_key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "dev_groups_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  ALTER TABLE "developments" ADD COLUMN "group_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "dev_groups_id" integer;
  ALTER TABLE "dev_groups" ADD CONSTRAINT "dev_groups_parent_id_dev_groups_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."dev_groups"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "dev_groups" ADD CONSTRAINT "dev_groups_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "dev_groups_rels" ADD CONSTRAINT "dev_groups_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."dev_groups"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "dev_groups_rels" ADD CONSTRAINT "dev_groups_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "dev_groups_parent_idx" ON "dev_groups" USING btree ("parent_id");
  CREATE INDEX "dev_groups_client_idx" ON "dev_groups" USING btree ("client_id");
  CREATE INDEX "dev_groups_updated_at_idx" ON "dev_groups" USING btree ("updated_at");
  CREATE INDEX "dev_groups_created_at_idx" ON "dev_groups" USING btree ("created_at");
  CREATE INDEX "dev_groups_rels_order_idx" ON "dev_groups_rels" USING btree ("order");
  CREATE INDEX "dev_groups_rels_parent_idx" ON "dev_groups_rels" USING btree ("parent_id");
  CREATE INDEX "dev_groups_rels_path_idx" ON "dev_groups_rels" USING btree ("path");
  CREATE INDEX "dev_groups_rels_users_id_idx" ON "dev_groups_rels" USING btree ("users_id");
  ALTER TABLE "developments" ADD CONSTRAINT "developments_group_id_dev_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."dev_groups"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_dev_groups_fk" FOREIGN KEY ("dev_groups_id") REFERENCES "public"."dev_groups"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "developments_group_idx" ON "developments" USING btree ("group_id");
  CREATE INDEX "payload_locked_documents_rels_dev_groups_id_idx" ON "payload_locked_documents_rels" USING btree ("dev_groups_id");`)
}
