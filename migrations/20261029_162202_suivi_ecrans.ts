import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// ADDITIVE — générée par scripts/db-migrate-additive.ts (schéma d'avant fusionné : l'ancien moteur vidéo reste en base jusqu'au temps 2).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ad_recaps_status" AS ENUM('envoye', 'vide', 'echec');
  CREATE TABLE "ad_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"question" varchar NOT NULL,
	"answer" varchar,
	"error" varchar,
	"asked_by_id" integer,
	"cost_eur" numeric,
	"asked_at" timestamp(3) with time zone NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);

  CREATE TABLE "ad_recaps" (
	"id" serial PRIMARY KEY NOT NULL,
	"week" varchar NOT NULL,
	"status" "enum_ad_recaps_status" NOT NULL,
	"text" varchar,
	"sent_at" timestamp(3) with time zone,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_questions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_recaps_id" integer;
  ALTER TABLE "ad_questions" ADD CONSTRAINT "ad_questions_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_questions" ADD CONSTRAINT "ad_questions_asked_by_id_users_id_fk" FOREIGN KEY ("asked_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ad_questions_campaign_idx" ON "ad_questions" USING btree ("campaign_id");
  CREATE INDEX "ad_questions_asked_by_idx" ON "ad_questions" USING btree ("asked_by_id");
  CREATE INDEX "ad_questions_asked_at_idx" ON "ad_questions" USING btree ("asked_at");
  CREATE INDEX "ad_questions_updated_at_idx" ON "ad_questions" USING btree ("updated_at");
  CREATE INDEX "ad_questions_created_at_idx" ON "ad_questions" USING btree ("created_at");
  CREATE UNIQUE INDEX "ad_recaps_week_idx" ON "ad_recaps" USING btree ("week");
  CREATE INDEX "ad_recaps_updated_at_idx" ON "ad_recaps" USING btree ("updated_at");
  CREATE INDEX "ad_recaps_created_at_idx" ON "ad_recaps" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_questions_fk" FOREIGN KEY ("ad_questions_id") REFERENCES "public"."ad_questions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_recaps_fk" FOREIGN KEY ("ad_recaps_id") REFERENCES "public"."ad_recaps"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ad_questions_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_questions_id");
  CREATE INDEX "payload_locked_documents_rels_ad_recaps_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_recaps_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ad_questions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ad_recaps" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ad_questions" CASCADE;
  DROP TABLE "ad_recaps" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_questions_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_recaps_fk";

  DROP INDEX "payload_locked_documents_rels_ad_questions_id_idx";
  DROP INDEX "payload_locked_documents_rels_ad_recaps_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_questions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_recaps_id";
  DROP TYPE "public"."enum_ad_recaps_status";`)
}
