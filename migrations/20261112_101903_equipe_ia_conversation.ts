import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ai_team_messages_from" AS ENUM('direction', 'agent');
  CREATE TABLE "ai_team_messages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"member_id" integer NOT NULL,
  	"from" "enum_ai_team_messages_from" NOT NULL,
  	"text" varchar NOT NULL,
  	"author_id" integer,
  	"cost_eur" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ai_team_messages_id" integer;
  ALTER TABLE "ai_team_messages" ADD CONSTRAINT "ai_team_messages_member_id_ai_team_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."ai_team_members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_team_messages" ADD CONSTRAINT "ai_team_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ai_team_messages_member_idx" ON "ai_team_messages" USING btree ("member_id");
  CREATE INDEX "ai_team_messages_author_idx" ON "ai_team_messages" USING btree ("author_id");
  CREATE INDEX "ai_team_messages_updated_at_idx" ON "ai_team_messages" USING btree ("updated_at");
  CREATE INDEX "ai_team_messages_created_at_idx" ON "ai_team_messages" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_team_messages_fk" FOREIGN KEY ("ai_team_messages_id") REFERENCES "public"."ai_team_messages"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ai_team_messages_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_team_messages_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ai_team_messages" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ai_team_messages" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ai_team_messages_fk";
  
  DROP INDEX "payload_locked_documents_rels_ai_team_messages_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ai_team_messages_id";
  DROP TYPE "public"."enum_ai_team_messages_from";`)
}
