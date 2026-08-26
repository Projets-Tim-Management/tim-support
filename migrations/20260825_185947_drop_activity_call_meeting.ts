import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * « Appel » et « Réunion » cessent d'être des TYPES d'activité : ce sont des
 * natures de TÂCHE (colonne `task_kind`). Les avoir aux deux endroits obligeait
 * à choisir entre consigner un appel passé et en planifier un — une distinction
 * que personne ne fait au moment de cliquer.
 *
 * ⚠️ Contient un `DROP TYPE`, donc à appliquer avec `--allow-destructive` : c'est
 * le SEUL moyen de retirer des valeurs d'un enum Postgres. Aucune donnée n'est
 * perdue pour autant — la colonne est d'abord convertie en texte, les éventuelles
 * lignes « appel »/« réunion » sont RECLASSÉES EN NOTE (leur contenu, lui, reste
 * intact), et seul l'ancien type est détruit.
 *
 * Sans ce reclassement, le cast final échouerait sur la première ligne portant
 * l'une des deux valeurs — et la migration serait impossible à passer.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_activities" ALTER COLUMN "type" SET DATA TYPE text;
  ALTER TABLE "client_activities" ALTER COLUMN "type" SET DEFAULT 'note'::text;
  UPDATE "client_activities" SET "type" = 'note' WHERE "type" IN ('appel', 'reunion');
  DROP TYPE "public"."enum_client_activities_type";
  CREATE TYPE "public"."enum_client_activities_type" AS ENUM('note', 'email', 'tache', 'systeme');
  ALTER TABLE "client_activities" ALTER COLUMN "type" SET DEFAULT 'note'::"public"."enum_client_activities_type";
  ALTER TABLE "client_activities" ALTER COLUMN "type" SET DATA TYPE "public"."enum_client_activities_type" USING "type"::"public"."enum_client_activities_type";`)
}

/** Les deux valeurs reviennent ; les lignes reclassées en note, elles, restent des notes. */
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_client_activities_type" ADD VALUE 'appel' BEFORE 'email';
  ALTER TYPE "public"."enum_client_activities_type" ADD VALUE 'reunion' BEFORE 'email';`)
}
