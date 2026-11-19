import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_article_rule_proposals_evidence_level" AS ENUM('officiel', 'mesure', 'indice');
  CREATE TYPE "public"."enum_article_rule_proposals_status" AS ENUM('proposee', 'appliquee', 'a-developper', 'refusee', 'inapplicable');
  CREATE TYPE "public"."enum_article_rule_proposals_kind" AS ENUM('ajout', 'modification', 'retrait');
  ALTER TYPE "public"."enum_ai_team_audits_kind" ADD VALUE 'regles';
  CREATE TABLE "article_rule_versions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"number" numeric NOT NULL,
  	"effective_at" timestamp(3) with time zone NOT NULL,
  	"changes" varchar,
  	"text" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "article_rule_proposals_evidence" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar NOT NULL,
  	"source" varchar,
  	"date" varchar,
  	"level" "enum_article_rule_proposals_evidence_level",
  	"verified" boolean,
  	"quote" varchar
  );
  
  CREATE TABLE "article_rule_proposals" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"status" "enum_article_rule_proposals_status" DEFAULT 'proposee' NOT NULL,
  	"month" varchar,
  	"proposed_by" varchar,
  	"applied_version" numeric,
  	"decided_at" timestamp(3) with time zone,
  	"title" varchar NOT NULL,
  	"part" varchar,
  	"kind" "enum_article_rule_proposals_kind",
  	"why" varchar,
  	"effect" varchar,
  	"anchor" varchar,
  	"current_text" varchar,
  	"proposed_text" varchar,
  	"decision_note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "article_rule_versions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "article_rule_proposals_id" integer;
  ALTER TABLE "article_rule_proposals_evidence" ADD CONSTRAINT "article_rule_proposals_evidence_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."article_rule_proposals"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "article_rule_versions_number_idx" ON "article_rule_versions" USING btree ("number");
  CREATE INDEX "article_rule_versions_updated_at_idx" ON "article_rule_versions" USING btree ("updated_at");
  CREATE INDEX "article_rule_versions_created_at_idx" ON "article_rule_versions" USING btree ("created_at");
  CREATE INDEX "article_rule_proposals_evidence_order_idx" ON "article_rule_proposals_evidence" USING btree ("_order");
  CREATE INDEX "article_rule_proposals_evidence_parent_id_idx" ON "article_rule_proposals_evidence" USING btree ("_parent_id");
  CREATE INDEX "article_rule_proposals_status_idx" ON "article_rule_proposals" USING btree ("status");
  CREATE INDEX "article_rule_proposals_month_idx" ON "article_rule_proposals" USING btree ("month");
  CREATE INDEX "article_rule_proposals_updated_at_idx" ON "article_rule_proposals" USING btree ("updated_at");
  CREATE INDEX "article_rule_proposals_created_at_idx" ON "article_rule_proposals" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_article_rule_versions_fk" FOREIGN KEY ("article_rule_versions_id") REFERENCES "public"."article_rule_versions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_article_rule_proposals_fk" FOREIGN KEY ("article_rule_proposals_id") REFERENCES "public"."article_rule_proposals"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_article_rule_versions_id_idx" ON "payload_locked_documents_rels" USING btree ("article_rule_versions_id");
  CREATE INDEX "payload_locked_documents_rels_article_rule_proposals_id_idx" ON "payload_locked_documents_rels" USING btree ("article_rule_proposals_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "article_rule_versions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "article_rule_proposals_evidence" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "article_rule_proposals" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "article_rule_versions" CASCADE;
  DROP TABLE "article_rule_proposals_evidence" CASCADE;
  DROP TABLE "article_rule_proposals" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_article_rule_versions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_article_rule_proposals_fk";
  
  ALTER TABLE "ai_team_audits" ALTER COLUMN "kind" SET DATA TYPE text;
  ALTER TABLE "ai_team_audits" ALTER COLUMN "kind" SET DEFAULT 'site'::text;
  DROP TYPE "public"."enum_ai_team_audits_kind";
  CREATE TYPE "public"."enum_ai_team_audits_kind" AS ENUM('site', 'concurrence', 'contenu', 'ia', 'technique', 'autorite', 'reseaux', 'pipeline', 'conversion', 'essais', 'sante');
  ALTER TABLE "ai_team_audits" ALTER COLUMN "kind" SET DEFAULT 'site'::"public"."enum_ai_team_audits_kind";
  ALTER TABLE "ai_team_audits" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_ai_team_audits_kind" USING "kind"::"public"."enum_ai_team_audits_kind";
  DROP INDEX "payload_locked_documents_rels_article_rule_versions_id_idx";
  DROP INDEX "payload_locked_documents_rels_article_rule_proposals_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "article_rule_versions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "article_rule_proposals_id";
  DROP TYPE "public"."enum_article_rule_proposals_evidence_level";
  DROP TYPE "public"."enum_article_rule_proposals_status";
  DROP TYPE "public"."enum_article_rule_proposals_kind";`)
}
