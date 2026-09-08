import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "developments_checklist" ALTER COLUMN "description" SET DATA TYPE varchar;
  ALTER TABLE "developments" ALTER COLUMN "description" SET DATA TYPE varchar;`)
}

/**
 * NON RÉVERSIBLE, et il vaut mieux le dire que le laisser échouer à mi-chemin.
 *
 * Le `down` généré reconvertissait la colonne en `jsonb` sans clause `USING`.
 * Postgres refuse la conversion telle quelle ; et même avec un cast, le contenu
 * n'est plus du JSON — ce sont désormais des descriptions écrites en texte
 * libre. Un retour en arrière détruirait donc ce que les gens ont écrit depuis.
 *
 * Pour revenir en arrière volontairement : reprendre l'éditeur riche dans la
 * configuration, puis écrire une migration qui convertit chaque texte en état
 * Lexical (`convertMarkdownToLexical`), plutôt que de changer le type de colonne.
 */
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  throw new Error(
    "Migration non réversible : les descriptions sont du texte libre depuis le passage en varchar. " +
      "Un retour en jsonb perdrait leur contenu — voir le commentaire de cette migration.",
  )
}
