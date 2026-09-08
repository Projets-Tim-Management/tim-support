import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_developments_status" AS ENUM('a-trier', 'qualification', 'etude', 'investigation', 'chiffrage', 'attente-validation', 'prete', 'en-cours', 'en-revue', 'en-recette', 'a-deployer', 'en-production', 'a-documenter', 'termine', 'en-attente', 'non-retenu', 'abandonne', 'doublon');
  CREATE TYPE "public"."enum_developments_type" AS ENUM('feature', 'evolution', 'bug', 'depannage', 'technique', 'etude');
  CREATE TYPE "public"."enum_developments_priority" AS ENUM('urgente', 'haute', 'normale', 'basse');
  CREATE TYPE "public"."enum_dev_labels_color" AS ENUM('slate', 'blue', 'teal', 'indigo', 'purple', 'green', 'amber', 'rose', 'red', 'gray');
  CREATE TABLE "developments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"description" jsonb,
  	"internal_notes" varchar,
  	"feature_id" integer,
  	"number" numeric,
  	"status" "enum_developments_status" DEFAULT 'a-trier',
  	"type" "enum_developments_type" DEFAULT 'feature',
  	"priority" "enum_developments_priority" DEFAULT 'normale',
  	"group_id" integer,
  	"assignee_id" integer,
  	"due_date" timestamp(3) with time zone,
  	"started_at" timestamp(3) with time zone,
  	"delivered_at" timestamp(3) with time zone,
  	"demand_count" numeric DEFAULT 0,
  	"status_rank" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "developments_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"partner_clients_id" integer,
  	"tickets_id" integer,
  	"dev_labels_id" integer,
  	"platforms_id" integer
  );
  
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
  
  CREATE TABLE "dev_labels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"color" "enum_dev_labels_color" DEFAULT 'slate',
  	"description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "developments_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "dev_groups_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "dev_labels_id" integer;
  ALTER TABLE "developments" ADD CONSTRAINT "developments_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "developments" ADD CONSTRAINT "developments_group_id_dev_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."dev_groups"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "developments" ADD CONSTRAINT "developments_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "developments_rels" ADD CONSTRAINT "developments_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."developments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "developments_rels" ADD CONSTRAINT "developments_rels_partner_clients_fk" FOREIGN KEY ("partner_clients_id") REFERENCES "public"."partner_clients"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "developments_rels" ADD CONSTRAINT "developments_rels_tickets_fk" FOREIGN KEY ("tickets_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "developments_rels" ADD CONSTRAINT "developments_rels_dev_labels_fk" FOREIGN KEY ("dev_labels_id") REFERENCES "public"."dev_labels"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "developments_rels" ADD CONSTRAINT "developments_rels_platforms_fk" FOREIGN KEY ("platforms_id") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "dev_groups" ADD CONSTRAINT "dev_groups_parent_id_dev_groups_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."dev_groups"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "dev_groups" ADD CONSTRAINT "dev_groups_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "developments_feature_idx" ON "developments" USING btree ("feature_id");
  CREATE UNIQUE INDEX "developments_number_idx" ON "developments" USING btree ("number");
  CREATE INDEX "developments_status_idx" ON "developments" USING btree ("status");
  CREATE INDEX "developments_type_idx" ON "developments" USING btree ("type");
  CREATE INDEX "developments_priority_idx" ON "developments" USING btree ("priority");
  CREATE INDEX "developments_group_idx" ON "developments" USING btree ("group_id");
  CREATE INDEX "developments_assignee_idx" ON "developments" USING btree ("assignee_id");
  CREATE INDEX "developments_due_date_idx" ON "developments" USING btree ("due_date");
  CREATE INDEX "developments_delivered_at_idx" ON "developments" USING btree ("delivered_at");
  CREATE INDEX "developments_demand_count_idx" ON "developments" USING btree ("demand_count");
  CREATE INDEX "developments_status_rank_idx" ON "developments" USING btree ("status_rank");
  CREATE INDEX "developments_updated_at_idx" ON "developments" USING btree ("updated_at");
  CREATE INDEX "developments_created_at_idx" ON "developments" USING btree ("created_at");
  CREATE INDEX "developments_rels_order_idx" ON "developments_rels" USING btree ("order");
  CREATE INDEX "developments_rels_parent_idx" ON "developments_rels" USING btree ("parent_id");
  CREATE INDEX "developments_rels_path_idx" ON "developments_rels" USING btree ("path");
  CREATE INDEX "developments_rels_partner_clients_id_idx" ON "developments_rels" USING btree ("partner_clients_id");
  CREATE INDEX "developments_rels_tickets_id_idx" ON "developments_rels" USING btree ("tickets_id");
  CREATE INDEX "developments_rels_dev_labels_id_idx" ON "developments_rels" USING btree ("dev_labels_id");
  CREATE INDEX "developments_rels_platforms_id_idx" ON "developments_rels" USING btree ("platforms_id");
  CREATE INDEX "dev_groups_parent_idx" ON "dev_groups" USING btree ("parent_id");
  CREATE INDEX "dev_groups_client_idx" ON "dev_groups" USING btree ("client_id");
  CREATE INDEX "dev_groups_updated_at_idx" ON "dev_groups" USING btree ("updated_at");
  CREATE INDEX "dev_groups_created_at_idx" ON "dev_groups" USING btree ("created_at");
  CREATE UNIQUE INDEX "dev_labels_name_idx" ON "dev_labels" USING btree ("name");
  CREATE INDEX "dev_labels_updated_at_idx" ON "dev_labels" USING btree ("updated_at");
  CREATE INDEX "dev_labels_created_at_idx" ON "dev_labels" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_developments_fk" FOREIGN KEY ("developments_id") REFERENCES "public"."developments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_dev_groups_fk" FOREIGN KEY ("dev_groups_id") REFERENCES "public"."dev_groups"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_dev_labels_fk" FOREIGN KEY ("dev_labels_id") REFERENCES "public"."dev_labels"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_developments_id_idx" ON "payload_locked_documents_rels" USING btree ("developments_id");
  CREATE INDEX "payload_locked_documents_rels_dev_groups_id_idx" ON "payload_locked_documents_rels" USING btree ("dev_groups_id");
  CREATE INDEX "payload_locked_documents_rels_dev_labels_id_idx" ON "payload_locked_documents_rels" USING btree ("dev_labels_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "developments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "developments_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "dev_groups" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "dev_labels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "developments" CASCADE;
  DROP TABLE "developments_rels" CASCADE;
  DROP TABLE "dev_groups" CASCADE;
  DROP TABLE "dev_labels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_developments_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_dev_groups_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_dev_labels_fk";
  
  DROP INDEX "payload_locked_documents_rels_developments_id_idx";
  DROP INDEX "payload_locked_documents_rels_dev_groups_id_idx";
  DROP INDEX "payload_locked_documents_rels_dev_labels_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "developments_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "dev_groups_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "dev_labels_id";
  DROP TYPE "public"."enum_developments_status";
  DROP TYPE "public"."enum_developments_type";
  DROP TYPE "public"."enum_developments_priority";
  DROP TYPE "public"."enum_dev_labels_color";`)
}
