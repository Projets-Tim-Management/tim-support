import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_mailbox_connections_provider" AS ENUM('google');
  CREATE TYPE "public"."enum_mailbox_connections_status" AS ENUM('active', 'erreur', 'suspendue');
  CREATE TABLE "mailbox_connections" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"account_email" varchar NOT NULL,
  	"user_id" integer,
  	"provider" "enum_mailbox_connections_provider" DEFAULT 'google' NOT NULL,
  	"status" "enum_mailbox_connections_status" DEFAULT 'active' NOT NULL,
  	"last_sync_at" timestamp(3) with time zone,
  	"last_error" varchar,
  	"sync_since" timestamp(3) with time zone,
  	"captured_count" numeric DEFAULT 0,
  	"access_token" varchar,
  	"refresh_token" varchar,
  	"expires_at" timestamp(3) with time zone,
  	"history_id" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "mailbox_connections_id" integer;
  ALTER TABLE "mailbox_connections" ADD CONSTRAINT "mailbox_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "mailbox_connections_account_email_idx" ON "mailbox_connections" USING btree ("account_email");
  CREATE INDEX "mailbox_connections_user_idx" ON "mailbox_connections" USING btree ("user_id");
  CREATE INDEX "mailbox_connections_status_idx" ON "mailbox_connections" USING btree ("status");
  CREATE INDEX "mailbox_connections_updated_at_idx" ON "mailbox_connections" USING btree ("updated_at");
  CREATE INDEX "mailbox_connections_created_at_idx" ON "mailbox_connections" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_mailbox_connections_fk" FOREIGN KEY ("mailbox_connections_id") REFERENCES "public"."mailbox_connections"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_mailbox_connections_id_idx" ON "payload_locked_documents_rels" USING btree ("mailbox_connections_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "mailbox_connections" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "mailbox_connections" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_mailbox_connections_fk";
  
  DROP INDEX "payload_locked_documents_rels_mailbox_connections_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "mailbox_connections_id";
  DROP TYPE "public"."enum_mailbox_connections_provider";
  DROP TYPE "public"."enum_mailbox_connections_status";`)
}
