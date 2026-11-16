import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ai_team_notes_kind" AS ENUM('decision', 'consigne', 'conviction', 'suivi', 'idee');
  CREATE TYPE "public"."enum_ai_team_notes_verdict" AS ENUM('retenue', 'a-tester', 'ecartee', 'imposee');
  CREATE TYPE "public"."enum_ai_team_notes_status" AS ENUM('active', 'terminee', 'abandonnee');
  CREATE TYPE "public"."enum_ai_team_notes_origin" AS ENUM('conversation', 'revue');
  CREATE TABLE "ai_team_notes_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"at" timestamp(3) with time zone,
  	"change" varchar,
  	"reason" varchar
  );
  
  CREATE TABLE "ai_team_notes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"member_id" integer NOT NULL,
  	"kind" "enum_ai_team_notes_kind" NOT NULL,
  	"text" varchar NOT NULL,
  	"reason" varchar,
  	"target_id" integer,
  	"verdict" "enum_ai_team_notes_verdict",
  	"disagreement" varchar,
  	"due_at" timestamp(3) with time zone,
  	"status" "enum_ai_team_notes_status" DEFAULT 'active' NOT NULL,
  	"origin" "enum_ai_team_notes_origin",
  	"source_message_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "ai_team_messages" ADD COLUMN "noted" jsonb;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ai_team_notes_id" integer;
  ALTER TABLE "ai_team_notes_history" ADD CONSTRAINT "ai_team_notes_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ai_team_notes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_team_notes" ADD CONSTRAINT "ai_team_notes_member_id_ai_team_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."ai_team_members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_team_notes" ADD CONSTRAINT "ai_team_notes_target_id_ai_team_members_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."ai_team_members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_team_notes" ADD CONSTRAINT "ai_team_notes_source_message_id_ai_team_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."ai_team_messages"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ai_team_notes_history_order_idx" ON "ai_team_notes_history" USING btree ("_order");
  CREATE INDEX "ai_team_notes_history_parent_id_idx" ON "ai_team_notes_history" USING btree ("_parent_id");
  CREATE INDEX "ai_team_notes_member_idx" ON "ai_team_notes" USING btree ("member_id");
  CREATE INDEX "ai_team_notes_target_idx" ON "ai_team_notes" USING btree ("target_id");
  CREATE INDEX "ai_team_notes_status_idx" ON "ai_team_notes" USING btree ("status");
  CREATE INDEX "ai_team_notes_source_message_idx" ON "ai_team_notes" USING btree ("source_message_id");
  CREATE INDEX "ai_team_notes_updated_at_idx" ON "ai_team_notes" USING btree ("updated_at");
  CREATE INDEX "ai_team_notes_created_at_idx" ON "ai_team_notes" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_team_notes_fk" FOREIGN KEY ("ai_team_notes_id") REFERENCES "public"."ai_team_notes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ai_team_notes_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_team_notes_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ai_team_notes_history" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ai_team_notes" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ai_team_notes_history" CASCADE;
  DROP TABLE "ai_team_notes" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ai_team_notes_fk";
  
  DROP INDEX "payload_locked_documents_rels_ai_team_notes_id_idx";
  ALTER TABLE "ai_team_messages" DROP COLUMN "noted";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ai_team_notes_id";
  DROP TYPE "public"."enum_ai_team_notes_kind";
  DROP TYPE "public"."enum_ai_team_notes_verdict";
  DROP TYPE "public"."enum_ai_team_notes_status";
  DROP TYPE "public"."enum_ai_team_notes_origin";`)
}
