import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "integrations_kind" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_integrations_kind",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "integrations_kind" ADD CONSTRAINT "integrations_kind_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "integrations_kind_order_idx" ON "integrations_kind" USING btree ("order");
  CREATE INDEX "integrations_kind_parent_idx" ON "integrations_kind" USING btree ("parent_id");
  ALTER TABLE "integrations" DROP COLUMN "kind";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "integrations_kind" CASCADE;
  ALTER TABLE "integrations" ADD COLUMN "kind" "enum_integrations_kind" DEFAULT 'autre';`)
}
