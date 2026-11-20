import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_articles_facts_origin" AS ENUM('recherche', 'manuel');
  CREATE TYPE "public"."enum_articles_write_stage" AS ENUM('attente', 'recherche', 'preparation', 'redaction', 'relance', 'termine', 'echec');
  ALTER TYPE "public"."enum_articles_status" ADD VALUE 'a-relire' BEFORE 'a-verifier';
  CREATE TABLE "articles_facts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"fact" varchar NOT NULL,
  	"source" varchar NOT NULL,
  	"url" varchar,
  	"year" varchar,
  	"origin" "enum_articles_facts_origin" DEFAULT 'manuel',
  	"excerpt" varchar
  );
  
  ALTER TABLE "articles" ADD COLUMN "write_stage" "enum_articles_write_stage";
  ALTER TABLE "articles" ADD COLUMN "write_attempts" numeric;
  ALTER TABLE "articles" ADD COLUMN "rules_version" numeric;
  ALTER TABLE "articles" ADD COLUMN "write_cost_eur" numeric;
  ALTER TABLE "articles" ADD COLUMN "write_started_at" timestamp(3) with time zone;
  ALTER TABLE "articles" ADD COLUMN "write_finished_at" timestamp(3) with time zone;
  ALTER TABLE "articles" ADD COLUMN "write_locked_until" timestamp(3) with time zone;
  ALTER TABLE "articles" ADD COLUMN "write_errors" varchar;
  ALTER TABLE "articles" ADD COLUMN "write_warnings" varchar;
  ALTER TABLE "articles" ADD COLUMN "wordcount_target" numeric;
  ALTER TABLE "articles" ADD COLUMN "client_case" varchar;
  ALTER TABLE "articles" ADD COLUMN "rejected_facts" jsonb;
  ALTER TABLE "articles" ADD COLUMN "write_context" jsonb;
  ALTER TABLE "articles" ADD COLUMN "draft" jsonb;
  ALTER TABLE "articles_facts" ADD CONSTRAINT "articles_facts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "articles_facts_order_idx" ON "articles_facts" USING btree ("_order");
  CREATE INDEX "articles_facts_parent_id_idx" ON "articles_facts" USING btree ("_parent_id");
  CREATE INDEX "articles_write_started_at_idx" ON "articles" USING btree ("write_started_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "articles_facts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "articles_facts" CASCADE;
  ALTER TABLE "articles" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "articles" ALTER COLUMN "status" SET DEFAULT 'idee'::text;
  DROP TYPE "public"."enum_articles_status";
  CREATE TYPE "public"."enum_articles_status" AS ENUM('idee', 'validee', 'redaction', 'a-verifier', 'image', 'pret', 'programme', 'publie', 'a-rafraichir', 'depublie', 'arretee');
  ALTER TABLE "articles" ALTER COLUMN "status" SET DEFAULT 'idee'::"public"."enum_articles_status";
  ALTER TABLE "articles" ALTER COLUMN "status" SET DATA TYPE "public"."enum_articles_status" USING "status"::"public"."enum_articles_status";
  DROP INDEX "articles_write_started_at_idx";
  ALTER TABLE "articles" DROP COLUMN "write_stage";
  ALTER TABLE "articles" DROP COLUMN "write_attempts";
  ALTER TABLE "articles" DROP COLUMN "rules_version";
  ALTER TABLE "articles" DROP COLUMN "write_cost_eur";
  ALTER TABLE "articles" DROP COLUMN "write_started_at";
  ALTER TABLE "articles" DROP COLUMN "write_finished_at";
  ALTER TABLE "articles" DROP COLUMN "write_locked_until";
  ALTER TABLE "articles" DROP COLUMN "write_errors";
  ALTER TABLE "articles" DROP COLUMN "write_warnings";
  ALTER TABLE "articles" DROP COLUMN "wordcount_target";
  ALTER TABLE "articles" DROP COLUMN "client_case";
  ALTER TABLE "articles" DROP COLUMN "rejected_facts";
  ALTER TABLE "articles" DROP COLUMN "write_context";
  ALTER TABLE "articles" DROP COLUMN "draft";
  DROP TYPE "public"."enum_articles_facts_origin";
  DROP TYPE "public"."enum_articles_write_stage";`)
}
