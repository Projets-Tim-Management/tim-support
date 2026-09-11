import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Données seulement, AVANT le retrait de la valeur d'enum (migration suivante).
 *
 * Le motif provisoire « À qualifier — repris de Brevo » disparaît : l'équipe a
 * qualifié l'historique en le passant en « Autre motif » (11/09/2026). Il en
 * reste des traces dans les anciennes versions des fiches et dans le réglage
 * d'une séquence ; la recréation de l'enum échouerait dessus.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   UPDATE "partner_clients" SET "loss_reason" = 'autre' WHERE "loss_reason" = 'a-qualifier';
   UPDATE "_partner_clients_v" SET "version_loss_reason" = 'autre' WHERE "version_loss_reason" = 'a-qualifier';
   DELETE FROM "sequences_loss_reasons" WHERE "value" = 'a-qualifier';`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Rien à défaire : on ne sait plus quelles fiches portaient le motif provisoire.
}
