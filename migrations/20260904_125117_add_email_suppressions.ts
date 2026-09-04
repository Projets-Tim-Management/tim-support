import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_email_suppressions_reason" AS ENUM('desinscription', 'rejet-definitif', 'spam', 'manuelle');
  CREATE TABLE "email_suppressions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"email" varchar NOT NULL,
  	"reason" "enum_email_suppressions_reason" DEFAULT 'manuelle' NOT NULL,
  	"source" varchar,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "email_suppressions_id" integer;
  CREATE UNIQUE INDEX "email_suppressions_email_idx" ON "email_suppressions" USING btree ("email");
  CREATE INDEX "email_suppressions_reason_idx" ON "email_suppressions" USING btree ("reason");
  CREATE INDEX "email_suppressions_updated_at_idx" ON "email_suppressions" USING btree ("updated_at");
  CREATE INDEX "email_suppressions_created_at_idx" ON "email_suppressions" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_email_suppressions_fk" FOREIGN KEY ("email_suppressions_id") REFERENCES "public"."email_suppressions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_email_suppressions_id_idx" ON "payload_locked_documents_rels" USING btree ("email_suppressions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "email_suppressions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "email_suppressions" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_email_suppressions_fk";
  
  DROP INDEX "payload_locked_documents_rels_email_suppressions_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "email_suppressions_id";
  DROP TYPE "public"."enum_email_suppressions_reason";`)
}
