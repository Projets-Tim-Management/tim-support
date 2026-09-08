import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "dev_groups_checklist_comments" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"body" varchar NOT NULL,
  	"author_id" integer,
  	"at" timestamp(3) with time zone
  );
  
  CREATE TABLE "dev_groups_checklist" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"done" boolean,
  	"title" varchar NOT NULL,
  	"description" jsonb
  );
  
  ALTER TABLE "dev_groups" ADD COLUMN "checklist_progress" varchar;
  ALTER TABLE "dev_groups_checklist_comments" ADD CONSTRAINT "dev_groups_checklist_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "dev_groups_checklist_comments" ADD CONSTRAINT "dev_groups_checklist_comments_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."dev_groups_checklist"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "dev_groups_checklist" ADD CONSTRAINT "dev_groups_checklist_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."dev_groups"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "dev_groups_checklist_comments_order_idx" ON "dev_groups_checklist_comments" USING btree ("_order");
  CREATE INDEX "dev_groups_checklist_comments_parent_id_idx" ON "dev_groups_checklist_comments" USING btree ("_parent_id");
  CREATE INDEX "dev_groups_checklist_comments_author_idx" ON "dev_groups_checklist_comments" USING btree ("author_id");
  CREATE INDEX "dev_groups_checklist_order_idx" ON "dev_groups_checklist" USING btree ("_order");
  CREATE INDEX "dev_groups_checklist_parent_id_idx" ON "dev_groups_checklist" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "dev_groups_checklist_comments" CASCADE;
  DROP TABLE "dev_groups_checklist" CASCADE;
  ALTER TABLE "dev_groups" DROP COLUMN "checklist_progress";`)
}
