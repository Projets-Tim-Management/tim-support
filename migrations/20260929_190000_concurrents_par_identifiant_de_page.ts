import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Un concurrent se désigne par l'identifiant de sa page Meta (unique,
 * obligatoire) ; le lien collé est gardé à part, tel quel (`source_url`). Le
 * champ « Page Facebook » (`page_url`) disparaît : c'est le lien d'origine qui
 * le remplace.
 *
 * Table vide vérifiée le 29/09/2026 avant d'écrire cette migration : le
 * renommage ne perd rien, et NOT NULL / UNIQUE ne peuvent pas échouer.
 * Écrite à la main — le générateur demandait « créé ou renommé ? » sans
 * terminal pour répondre ; l'instantané JSON est celui de la migration
 * précédente, avec ces trois changements.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ad_competitors" RENAME COLUMN "page_url" TO "source_url";
  ALTER TABLE "ad_competitors" ALTER COLUMN "page_id" SET NOT NULL;
  DROP INDEX "ad_competitors_page_id_idx";
  CREATE UNIQUE INDEX "ad_competitors_page_id_idx" ON "ad_competitors" USING btree ("page_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "ad_competitors_page_id_idx";
  CREATE INDEX "ad_competitors_page_id_idx" ON "ad_competitors" USING btree ("page_id");
  ALTER TABLE "ad_competitors" ALTER COLUMN "page_id" DROP NOT NULL;
  ALTER TABLE "ad_competitors" RENAME COLUMN "source_url" TO "page_url";`)
}
