import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Données seulement : le statut « Terminé » (clé `termine`) reçoit le rôle
 * « prévient les demandeurs », comme dans le jeu livré (DEV_STATUS_SEED).
 *
 * Les statuts vivent en base : ajouter le rôle au code ne change rien aux
 * lignes existantes. Migration SÉPARÉE de celle qui crée la valeur d'enum —
 * Postgres refuse d'utiliser une valeur d'enum dans la transaction qui l'a
 * ajoutée.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   INSERT INTO "dev_statuses_roles" ("order", "parent_id", "value")
   SELECT
     COALESCE((SELECT MAX(r."order") FROM "dev_statuses_roles" r WHERE r."parent_id" = s."id"), 0) + 1,
     s."id",
     'annonce'
   FROM "dev_statuses" s
   WHERE s."key" = 'termine'
     AND NOT EXISTS (
       SELECT 1 FROM "dev_statuses_roles" r
       WHERE r."parent_id" = s."id" AND r."value" = 'annonce'
     );`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // La migration précédente recrée l'enum SANS `annonce` et reconvertit la
  // colonne : une ligne qui porte encore cette valeur ferait échouer le
  // retour en arrière. On la retire d'abord.
  await db.execute(sql`DELETE FROM "dev_statuses_roles" WHERE "value" = 'annonce';`)
}
