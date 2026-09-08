import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "developments_checklist" ADD COLUMN "assignee_id" integer;
  ALTER TABLE "dev_groups" ADD COLUMN "assignee_id" integer;
  ALTER TABLE "developments_checklist" ADD CONSTRAINT "developments_checklist_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "dev_groups" ADD CONSTRAINT "dev_groups_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "developments_checklist_assignee_idx" ON "developments_checklist" USING btree ("assignee_id");
  CREATE INDEX "dev_groups_assignee_idx" ON "dev_groups" USING btree ("assignee_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "developments_checklist" DROP CONSTRAINT "developments_checklist_assignee_id_users_id_fk";
  
  ALTER TABLE "dev_groups" DROP CONSTRAINT "dev_groups_assignee_id_users_id_fk";
  
  DROP INDEX "developments_checklist_assignee_idx";
  DROP INDEX "dev_groups_assignee_idx";
  ALTER TABLE "developments_checklist" DROP COLUMN "assignee_id";
  ALTER TABLE "dev_groups" DROP COLUMN "assignee_id";`)
}
