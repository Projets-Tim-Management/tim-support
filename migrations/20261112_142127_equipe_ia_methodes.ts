import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ai_team_methods_status" AS ENUM('en-cours', 'faite', 'echec');
  CREATE TYPE "public"."enum_ai_team_methods_trigger" AS ENUM('semaine', 'direction');
  CREATE TABLE "ai_team_methods" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"member_id" integer NOT NULL,
  	"week" varchar NOT NULL,
  	"status" "enum_ai_team_methods_status" DEFAULT 'en-cours' NOT NULL,
  	"trigger" "enum_ai_team_methods_trigger",
  	"method" varchar,
  	"changes" varchar,
  	"ideas" jsonb,
  	"sources" jsonb,
  	"searches" numeric,
  	"cost_eur" numeric,
  	"error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ai_team_methods_id" integer;
  ALTER TABLE "ai_team_methods" ADD CONSTRAINT "ai_team_methods_member_id_ai_team_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."ai_team_members"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ai_team_methods_member_idx" ON "ai_team_methods" USING btree ("member_id");
  CREATE INDEX "ai_team_methods_week_idx" ON "ai_team_methods" USING btree ("week");
  CREATE INDEX "ai_team_methods_updated_at_idx" ON "ai_team_methods" USING btree ("updated_at");
  CREATE INDEX "ai_team_methods_created_at_idx" ON "ai_team_methods" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_team_methods_fk" FOREIGN KEY ("ai_team_methods_id") REFERENCES "public"."ai_team_methods"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ai_team_methods_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_team_methods_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ai_team_methods" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ai_team_methods" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ai_team_methods_fk";
  
  DROP INDEX "payload_locked_documents_rels_ai_team_methods_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ai_team_methods_id";
  DROP TYPE "public"."enum_ai_team_methods_status";
  DROP TYPE "public"."enum_ai_team_methods_trigger";`)
}
