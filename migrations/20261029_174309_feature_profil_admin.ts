import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// ADDITIVE — générée par scripts/db-migrate-additive.ts (schéma d'avant fusionné : l'ancien moteur vidéo reste en base jusqu'au temps 2).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_features_profiles" ADD VALUE 'admin';
  ALTER TYPE "public"."enum__features_v_version_profiles" ADD VALUE 'admin';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "features_profiles" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_features_profiles";
  CREATE TYPE "public"."enum_features_profiles" AS ENUM('conducteur', 'chefChantier', 'chefEquipe', 'compagnon', 'visuel', 'bureau');
  ALTER TABLE "features_profiles" ALTER COLUMN "value" SET DATA TYPE "public"."enum_features_profiles" USING "value"::"public"."enum_features_profiles";
  ALTER TABLE "_features_v_version_profiles" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum__features_v_version_profiles";
  CREATE TYPE "public"."enum__features_v_version_profiles" AS ENUM('conducteur', 'chefChantier', 'chefEquipe', 'compagnon', 'visuel', 'bureau');
  ALTER TABLE "_features_v_version_profiles" ALTER COLUMN "value" SET DATA TYPE "public"."enum__features_v_version_profiles" USING "value"::"public"."enum__features_v_version_profiles";`)
}
