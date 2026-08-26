import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Nature d'une tâche (à faire, appel, e-mail, réunion, déjeuner, échéance,
 * LinkedIn) — le même vocabulaire que les tâches de Brevo.
 *
 * Additif : une colonne avec valeur par défaut. Les tâches déjà créées restent
 * « À faire », ce qu'elles étaient implicitement.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_client_activities_task_kind" AS ENUM('a-faire', 'appel', 'email', 'reunion', 'dejeuner', 'echeance', 'linkedin');
  ALTER TABLE "client_activities" ADD COLUMN "task_kind" "enum_client_activities_task_kind" DEFAULT 'a-faire';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_activities" DROP COLUMN "task_kind";
  DROP TYPE "public"."enum_client_activities_task_kind";`)
}
