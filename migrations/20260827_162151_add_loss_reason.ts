import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Motif de clôture d'une opportunité (« Perdue », « Résilié », « Archivé »).
 *
 * Purement ADDITIF : deux colonnes et leurs enums, aucune donnée touchée. Les
 * fiches déjà closes restent sans motif — le garde-fou ne contrôle que les
 * TRANSITIONS, elles ne deviennent donc pas impossibles à enregistrer.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_partner_clients_loss_reason" AS ENUM('prix', 'fonctionnalites', 'concurrent', 'budget', 'cessation', 'autre', 'sans-reponse', 'pas-le-moment', 'besoin-different', 'solution-interne', 'test-non-concluant', 'peu-utilise', 'complexite', 'support', 'reorganisation');
  CREATE TYPE "public"."enum__partner_clients_v_version_loss_reason" AS ENUM('prix', 'fonctionnalites', 'concurrent', 'budget', 'cessation', 'autre', 'sans-reponse', 'pas-le-moment', 'besoin-different', 'solution-interne', 'test-non-concluant', 'peu-utilise', 'complexite', 'support', 'reorganisation');
  ALTER TABLE "partner_clients" ADD COLUMN "loss_reason" "enum_partner_clients_loss_reason";
  ALTER TABLE "partner_clients" ADD COLUMN "loss_reason_detail" varchar;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_loss_reason" "enum__partner_clients_v_version_loss_reason";
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_loss_reason_detail" varchar;
  CREATE INDEX "partner_clients_loss_reason_idx" ON "partner_clients" USING btree ("loss_reason");
  CREATE INDEX "_partner_clients_v_version_version_loss_reason_idx" ON "_partner_clients_v" USING btree ("version_loss_reason");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "partner_clients_loss_reason_idx";
  DROP INDEX "_partner_clients_v_version_version_loss_reason_idx";
  ALTER TABLE "partner_clients" DROP COLUMN "loss_reason";
  ALTER TABLE "partner_clients" DROP COLUMN "loss_reason_detail";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_loss_reason";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_loss_reason_detail";
  DROP TYPE "public"."enum_partner_clients_loss_reason";
  DROP TYPE "public"."enum__partner_clients_v_version_loss_reason";`)
}
