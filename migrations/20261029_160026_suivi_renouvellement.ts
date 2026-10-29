import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// ADDITIVE — générée par scripts/db-migrate-additive.ts (schéma d'avant fusionné : l'ancien moteur vidéo reste en base jusqu'au temps 2).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_ad_decisions_kind" ADD VALUE 'renouvellement';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ad_decisions" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_ad_decisions_kind";
  CREATE TYPE "public"."enum_ad_decisions_kind" AS ENUM('repartition-budget', 'positionnement', 'angle', 'audience', 'rejet-controleur', 'creation-sous-agent', 'concurrent', 'attente', 'budget', 'pause', 'activation', 'test');
  ALTER TABLE "ad_decisions" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_ad_decisions_kind" USING "kind"::"public"."enum_ad_decisions_kind";`)
}
