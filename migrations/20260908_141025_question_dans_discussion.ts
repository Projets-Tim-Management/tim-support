import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "developments_checklist_comments" ADD COLUMN "asked_to_id" integer;
  ALTER TABLE "developments_checklist_comments" ADD CONSTRAINT "developments_checklist_comments_asked_to_id_users_id_fk" FOREIGN KEY ("asked_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "developments_checklist_comments_asked_to_idx" ON "developments_checklist_comments" USING btree ("asked_to_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "developments_checklist_comments" DROP CONSTRAINT "developments_checklist_comments_asked_to_id_users_id_fk";
  
  DROP INDEX "developments_checklist_comments_asked_to_idx";
  ALTER TABLE "developments_checklist_comments" DROP COLUMN "asked_to_id";`)
}
