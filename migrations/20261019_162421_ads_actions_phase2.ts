import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// ADDITIVE — générée par scripts/db-migrate-additive.ts (schéma d'avant fusionné : l'ancien moteur vidéo reste en base jusqu'au temps 2).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ad_campaigns_autonomy" AS ENUM('observer', 'proposer', 'autonome');
  ALTER TYPE "public"."enum_ad_decisions_kind" ADD VALUE 'budget';
  ALTER TYPE "public"."enum_ad_decisions_kind" ADD VALUE 'pause';
  ALTER TYPE "public"."enum_ad_decisions_kind" ADD VALUE 'activation';
  ALTER TABLE "ad_campaigns" ADD COLUMN "autonomy" "enum_ad_campaigns_autonomy" DEFAULT 'proposer';
  ALTER TABLE "ad_decisions" ADD COLUMN "target" varchar;
  ALTER TABLE "ad_decisions" ADD COLUMN "executed_at" timestamp(3) with time zone;
  ALTER TABLE "ad_decisions" ADD COLUMN "reviewed_by_id" integer;
  ALTER TABLE "ads_settings" ADD COLUMN "max_budget_change_pct" numeric DEFAULT 20 NOT NULL;
  ALTER TABLE "ads_settings" ADD COLUMN "min_hours_between_changes" numeric DEFAULT 72 NOT NULL;
  ALTER TABLE "ad_decisions" ADD CONSTRAINT "ad_decisions_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ad_decisions_target_idx" ON "ad_decisions" USING btree ("target");
  CREATE INDEX "ad_decisions_executed_at_idx" ON "ad_decisions" USING btree ("executed_at");
  CREATE INDEX "ad_decisions_reviewed_by_idx" ON "ad_decisions" USING btree ("reviewed_by_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ad_decisions" DROP CONSTRAINT "ad_decisions_reviewed_by_id_users_id_fk";

  ALTER TABLE "ad_decisions" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_ad_decisions_kind";
  CREATE TYPE "public"."enum_ad_decisions_kind" AS ENUM('repartition-budget', 'positionnement', 'angle', 'audience', 'rejet-controleur', 'creation-sous-agent', 'concurrent', 'attente');
  ALTER TABLE "ad_decisions" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_ad_decisions_kind" USING "kind"::"public"."enum_ad_decisions_kind";
  DROP INDEX "ad_decisions_target_idx";
  DROP INDEX "ad_decisions_executed_at_idx";
  DROP INDEX "ad_decisions_reviewed_by_idx";
  ALTER TABLE "ad_campaigns" DROP COLUMN "autonomy";
  ALTER TABLE "ad_decisions" DROP COLUMN "target";
  ALTER TABLE "ad_decisions" DROP COLUMN "executed_at";
  ALTER TABLE "ad_decisions" DROP COLUMN "reviewed_by_id";
  ALTER TABLE "ads_settings" DROP COLUMN "max_budget_change_pct";
  ALTER TABLE "ads_settings" DROP COLUMN "min_hours_between_changes";
  DROP TYPE "public"."enum_ad_campaigns_autonomy";`)
}
