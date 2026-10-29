import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// ADDITIVE — générée par scripts/db-migrate-additive.ts (schéma d'avant fusionné : l'ancien moteur vidéo reste en base jusqu'au temps 2).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ad_alerts_kind" AS ENUM('pub-refusee', 'depense-anormale', 'diffusion-nulle', 'lien-casse', 'clics-sans-lead');
  CREATE TYPE "public"."enum_ad_alerts_stage" AS ENUM('a-confirmer', 'confirmee');
  CREATE TABLE "ad_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"kind" "enum_ad_alerts_kind" NOT NULL,
	"level" varchar,
	"object_external_id" varchar,
	"object_name" varchar,
	"detail" varchar NOT NULL,
	"stage" "enum_ad_alerts_stage" DEFAULT 'confirmee',
	"detected_at" timestamp(3) with time zone NOT NULL,
	"confirmed_at" timestamp(3) with time zone,
	"resolved_at" timestamp(3) with time zone,
	"notified_at" timestamp(3) with time zone,
	"decision_id" integer,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_alerts_id" integer;
  ALTER TABLE "ad_alerts" ADD CONSTRAINT "ad_alerts_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ad_alerts" ADD CONSTRAINT "ad_alerts_decision_id_ad_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."ad_decisions"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ad_alerts_campaign_idx" ON "ad_alerts" USING btree ("campaign_id");
  CREATE INDEX "ad_alerts_kind_idx" ON "ad_alerts" USING btree ("kind");
  CREATE INDEX "ad_alerts_object_external_id_idx" ON "ad_alerts" USING btree ("object_external_id");
  CREATE INDEX "ad_alerts_detected_at_idx" ON "ad_alerts" USING btree ("detected_at");
  CREATE INDEX "ad_alerts_resolved_at_idx" ON "ad_alerts" USING btree ("resolved_at");
  CREATE INDEX "ad_alerts_decision_idx" ON "ad_alerts" USING btree ("decision_id");
  CREATE INDEX "ad_alerts_updated_at_idx" ON "ad_alerts" USING btree ("updated_at");
  CREATE INDEX "ad_alerts_created_at_idx" ON "ad_alerts" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_alerts_fk" FOREIGN KEY ("ad_alerts_id") REFERENCES "public"."ad_alerts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ad_alerts_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_alerts_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ad_alerts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ad_alerts" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_alerts_fk";

  DROP INDEX "payload_locked_documents_rels_ad_alerts_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_alerts_id";
  DROP TYPE "public"."enum_ad_alerts_kind";
  DROP TYPE "public"."enum_ad_alerts_stage";`)
}
