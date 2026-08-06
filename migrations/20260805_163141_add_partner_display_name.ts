import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Titre lisible des fiches partenaires (`displayName`, alimenté par un hook).
 *
 * Le hook ne s'exécute qu'à l'ENREGISTREMENT : sans le remplissage ci-dessous,
 * les fiches déjà en base resteraient sans titre — listes de relation vides et
 * recherche par nom toujours inopérante — jusqu'à ce que chacune soit rouverte
 * et sauvegardée à la main. On applique donc la même règle en SQL, une fois.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partners" ADD COLUMN "display_name" varchar;

  UPDATE "partners"
     SET "display_name" = NULLIF(TRIM(CONCAT_WS(' ', "first_name", "name")), '')
   WHERE "display_name" IS NULL;

  UPDATE "partners"
     SET "display_name" = COALESCE("societe", "email", 'Partenaire')
   WHERE "display_name" IS NULL OR "display_name" = '';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partners" DROP COLUMN "display_name";`)
}
