import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// ADDITIVE — générée par scripts/db-migrate-additive.ts (schéma d'avant fusionné : l'ancien moteur vidéo reste en base jusqu'au temps 2).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_parcours_profil" ADD VALUE 'visuel';
  ALTER TYPE "public"."enum__parcours_v_version_profil" ADD VALUE 'visuel';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "parcours" ALTER COLUMN "profil" SET DATA TYPE text;
  DROP TYPE "public"."enum_parcours_profil";
  CREATE TYPE "public"."enum_parcours_profil" AS ENUM('admin', 'conducteur', 'chef-chantier', 'compagnon');
  ALTER TABLE "parcours" ALTER COLUMN "profil" SET DATA TYPE "public"."enum_parcours_profil" USING "profil"::"public"."enum_parcours_profil";
  ALTER TABLE "_parcours_v" ALTER COLUMN "version_profil" SET DATA TYPE text;
  DROP TYPE "public"."enum__parcours_v_version_profil";
  CREATE TYPE "public"."enum__parcours_v_version_profil" AS ENUM('admin', 'conducteur', 'chef-chantier', 'compagnon');
  ALTER TABLE "_parcours_v" ALTER COLUMN "version_profil" SET DATA TYPE "public"."enum__parcours_v_version_profil" USING "version_profil"::"public"."enum__parcours_v_version_profil";`)
}
