import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// ADDITIVE — générée par scripts/db-migrate-additive.ts (schéma d'avant fusionné : l'ancien moteur vidéo reste en base jusqu'au temps 2).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_users_team_emails" ADD VALUE 'client-gagne';
  ALTER TYPE "public"."enum_team_emails_rules_email" ADD VALUE 'client-gagne';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DELETE FROM "users_team_emails" WHERE "value" = 'client-gagne';
  DELETE FROM "team_emails_rules" WHERE "email" = 'client-gagne';
  ALTER TABLE "users_team_emails" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_users_team_emails";
  CREATE TYPE "public"."enum_users_team_emails" AS ENUM('rapprochement-mois', 'rapprochement-dernier-appel', 'contrat-a-contresigner', 'parcours-go-nogo', 'parcours-devis', 'parcours-contrat', 'parcours-dossier', 'parcours-prise-en-main', 'parcours-acces-manquants', 'parcours-etapes', 'publicite-urgence', 'publicite-reconnexion', 'publicite-recap', 'agendas');
  ALTER TABLE "users_team_emails" ALTER COLUMN "value" SET DATA TYPE "public"."enum_users_team_emails" USING "value"::"public"."enum_users_team_emails";
  ALTER TABLE "team_emails_rules" ALTER COLUMN "email" SET DATA TYPE text;
  DROP TYPE "public"."enum_team_emails_rules_email";
  CREATE TYPE "public"."enum_team_emails_rules_email" AS ENUM('rapprochement-mois', 'rapprochement-dernier-appel', 'contrat-a-contresigner', 'parcours-go-nogo', 'parcours-devis', 'parcours-contrat', 'parcours-dossier', 'parcours-prise-en-main', 'parcours-acces-manquants', 'parcours-etapes', 'publicite-urgence', 'publicite-reconnexion', 'publicite-recap', 'agendas');
  ALTER TABLE "team_emails_rules" ALTER COLUMN "email" SET DATA TYPE "public"."enum_team_emails_rules_email" USING "email"::"public"."enum_team_emails_rules_email";`)
}
