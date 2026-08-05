import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "missions_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"detail" varchar,
  	"url" varchar
  );
  
  ALTER TABLE "missions" ADD COLUMN "proof_hint" varchar;
  ALTER TABLE "missions_steps" ADD CONSTRAINT "missions_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "missions_steps_order_idx" ON "missions_steps" USING btree ("_order");
  CREATE INDEX "missions_steps_parent_id_idx" ON "missions_steps" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "missions_steps" CASCADE;
  ALTER TABLE "missions" DROP COLUMN "proof_hint";`)
}
