import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Données seulement, pas de schéma.
 *
 * « Accès distribués aux utilisateurs » s'armait à l'échéance dès la création de
 * la fiche, sans que les accès aient été créés. La règle exige désormais le
 * provisionnement (voir SELF_VALIDATION_REQUIRES) ; le hook nettoie les
 * parcours à leur prochain enregistrement — mais un parcours qu'on n'enregistre
 * pas d'ici son échéance s'acquerrait quand même, à la lecture. On nettoie donc
 * la base une fois pour toutes.
 *
 * Périmètre : parcours ouverts, étape « remise-acces » en attente automatique,
 * sans « provisionnement » fait ni armé.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   UPDATE "journey_runs_steps" s
   SET "state" = 'a-faire', "auto_at" = NULL
   FROM "journey_runs" r
   WHERE s."_parent_id" = r."id"
     AND s."key" = 'remise-acces'
     AND s."state" = 'auto'
     AND r."status" NOT IN ('gagne', 'perdu', 'annule')
     AND NOT EXISTS (
       SELECT 1 FROM "journey_runs_steps" p
       WHERE p."_parent_id" = s."_parent_id"
         AND p."key" = 'provisionnement'
         AND (p."state" = 'fait' OR (p."state" = 'auto' AND p."auto_at" IS NOT NULL))
     );`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Rien à défaire : le hook réarme l'étape à l'enregistrement suivant si le
  // provisionnement est fait. Un compte à rebours retiré à tort ne se perd pas.
}
