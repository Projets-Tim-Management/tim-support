import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// ADDITIVE — générée par scripts/db-migrate-additive.ts (schéma d'avant fusionné : l'ancien moteur vidéo reste en base jusqu'au temps 2).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ad_conversions_event" AS ENUM('Lead', 'QualifiedLead', 'WonDeal');
  CREATE TYPE "public"."enum_ad_conversions_status" AS ENUM('envoye', 'ignore', 'echec');
  ALTER TYPE "public"."enum_ad_decisions_kind" ADD VALUE 'bascule';
  CREATE TABLE "ad_conversions" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" integer NOT NULL,
	"event" "enum_ad_conversions_event" NOT NULL,
	"event_id" varchar NOT NULL,
	"pixel_id" varchar,
	"status" "enum_ad_conversions_status" NOT NULL,
	"detail" varchar,
	"sent_at" timestamp(3) with time zone NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);

  ALTER TABLE "form_submissions" ADD COLUMN "ads_consent" boolean;
  ALTER TABLE "form_submissions" ADD COLUMN "fbp" varchar;
  ALTER TABLE "form_submissions" ADD COLUMN "fbc" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_conversions_id" integer;
  ALTER TABLE "ad_conversions" ADD CONSTRAINT "ad_conversions_submission_id_form_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."form_submissions"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ad_conversions_submission_idx" ON "ad_conversions" USING btree ("submission_id");
  CREATE INDEX "ad_conversions_event_idx" ON "ad_conversions" USING btree ("event");
  CREATE INDEX "ad_conversions_sent_at_idx" ON "ad_conversions" USING btree ("sent_at");
  CREATE INDEX "ad_conversions_updated_at_idx" ON "ad_conversions" USING btree ("updated_at");
  CREATE INDEX "ad_conversions_created_at_idx" ON "ad_conversions" USING btree ("created_at");
  CREATE UNIQUE INDEX "submission_event_idx" ON "ad_conversions" USING btree ("submission_id","event");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_conversions_fk" FOREIGN KEY ("ad_conversions_id") REFERENCES "public"."ad_conversions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ad_conversions_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_conversions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ad_conversions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ad_conversions" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_conversions_fk";

  ALTER TABLE "ad_decisions" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_ad_decisions_kind";
  CREATE TYPE "public"."enum_ad_decisions_kind" AS ENUM('repartition-budget', 'positionnement', 'angle', 'audience', 'rejet-controleur', 'creation-sous-agent', 'concurrent', 'attente', 'budget', 'pause', 'activation', 'test', 'renouvellement');
  ALTER TABLE "ad_decisions" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_ad_decisions_kind" USING "kind"::"public"."enum_ad_decisions_kind";
  DROP INDEX "payload_locked_documents_rels_ad_conversions_id_idx";
  ALTER TABLE "form_submissions" DROP COLUMN "ads_consent";
  ALTER TABLE "form_submissions" DROP COLUMN "fbp";
  ALTER TABLE "form_submissions" DROP COLUMN "fbc";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_conversions_id";
  DROP TYPE "public"."enum_ad_conversions_event";
  DROP TYPE "public"."enum_ad_conversions_status";`)
}
