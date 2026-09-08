import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "dev_groups_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  ALTER TABLE "developments_checklist" DROP CONSTRAINT "developments_checklist_assignee_id_users_id_fk";
  
  ALTER TABLE "developments" DROP CONSTRAINT "developments_assignee_id_users_id_fk";
  
  ALTER TABLE "dev_groups" DROP CONSTRAINT "dev_groups_assignee_id_users_id_fk";
  
  DROP INDEX "developments_checklist_assignee_idx";
  DROP INDEX "developments_assignee_idx";
  DROP INDEX "dev_groups_assignee_idx";
  ALTER TABLE "developments_rels" ADD COLUMN "users_id" integer;
  ALTER TABLE "dev_groups_rels" ADD CONSTRAINT "dev_groups_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."dev_groups"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "dev_groups_rels" ADD CONSTRAINT "dev_groups_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "dev_groups_rels_order_idx" ON "dev_groups_rels" USING btree ("order");
  CREATE INDEX "dev_groups_rels_parent_idx" ON "dev_groups_rels" USING btree ("parent_id");
  CREATE INDEX "dev_groups_rels_path_idx" ON "dev_groups_rels" USING btree ("path");
  CREATE INDEX "dev_groups_rels_users_id_idx" ON "dev_groups_rels" USING btree ("users_id");
  ALTER TABLE "developments_rels" ADD CONSTRAINT "developments_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "developments_rels_users_id_idx" ON "developments_rels" USING btree ("users_id");
  ALTER TABLE "developments_checklist" DROP COLUMN "assignee_id";
  ALTER TABLE "developments" DROP COLUMN "assignee_id";
  ALTER TABLE "dev_groups" DROP COLUMN "assignee_id";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "dev_groups_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "dev_groups_rels" CASCADE;
  ALTER TABLE "developments_rels" DROP CONSTRAINT "developments_rels_users_fk";
  
  DROP INDEX "developments_rels_users_id_idx";
  ALTER TABLE "developments_checklist" ADD COLUMN "assignee_id" integer;
  ALTER TABLE "developments" ADD COLUMN "assignee_id" integer;
  ALTER TABLE "dev_groups" ADD COLUMN "assignee_id" integer;
  ALTER TABLE "developments_checklist" ADD CONSTRAINT "developments_checklist_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "developments" ADD CONSTRAINT "developments_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "dev_groups" ADD CONSTRAINT "dev_groups_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "developments_checklist_assignee_idx" ON "developments_checklist" USING btree ("assignee_id");
  CREATE INDEX "developments_assignee_idx" ON "developments" USING btree ("assignee_id");
  CREATE INDEX "dev_groups_assignee_idx" ON "dev_groups" USING btree ("assignee_id");
  ALTER TABLE "developments_rels" DROP COLUMN "users_id";`)
}
