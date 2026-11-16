import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ad_recaps" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ad_recaps" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_ad_recaps_fk";
  
  -- Le récap du lundi n'existe plus : ses réglages d'envoi disparaissent avec lui (sinon le changement de type échoue).
  DELETE FROM "users_team_emails" WHERE "value" = 'publicite-recap';
  DELETE FROM "team_emails_rules" WHERE "email" = 'publicite-recap';
  ALTER TABLE "users_team_emails" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_users_team_emails";
  CREATE TYPE "public"."enum_users_team_emails" AS ENUM('rapprochement-mois', 'rapprochement-dernier-appel', 'contrat-a-contresigner', 'client-gagne', 'parcours-go-nogo', 'parcours-devis', 'parcours-contrat', 'parcours-dossier', 'parcours-prise-en-main', 'parcours-acces-manquants', 'parcours-etapes', 'publicite-urgence', 'publicite-reconnexion', 'connexion-api', 'agendas');
  ALTER TABLE "users_team_emails" ALTER COLUMN "value" SET DATA TYPE "public"."enum_users_team_emails" USING "value"::"public"."enum_users_team_emails";
  ALTER TABLE "team_emails_rules" ALTER COLUMN "email" SET DATA TYPE text;
  DROP TYPE "public"."enum_team_emails_rules_email";
  CREATE TYPE "public"."enum_team_emails_rules_email" AS ENUM('rapprochement-mois', 'rapprochement-dernier-appel', 'contrat-a-contresigner', 'client-gagne', 'parcours-go-nogo', 'parcours-devis', 'parcours-contrat', 'parcours-dossier', 'parcours-prise-en-main', 'parcours-acces-manquants', 'parcours-etapes', 'publicite-urgence', 'publicite-reconnexion', 'connexion-api', 'agendas');
  ALTER TABLE "team_emails_rules" ALTER COLUMN "email" SET DATA TYPE "public"."enum_team_emails_rules_email" USING "email"::"public"."enum_team_emails_rules_email";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_ad_recaps_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_recaps_id";
  DROP TYPE "public"."enum_ad_recaps_status";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ad_recaps_status" AS ENUM('envoye', 'vide', 'echec');
  ALTER TYPE "public"."enum_users_team_emails" ADD VALUE 'publicite-recap' BEFORE 'connexion-api';
  ALTER TYPE "public"."enum_team_emails_rules_email" ADD VALUE 'publicite-recap' BEFORE 'connexion-api';
  CREATE TABLE "ad_recaps" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"week" varchar NOT NULL,
  	"status" "enum_ad_recaps_status" NOT NULL,
  	"text" varchar,
  	"sent_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_recaps_id" integer;
  CREATE UNIQUE INDEX "ad_recaps_week_idx" ON "ad_recaps" USING btree ("week");
  CREATE INDEX "ad_recaps_updated_at_idx" ON "ad_recaps" USING btree ("updated_at");
  CREATE INDEX "ad_recaps_created_at_idx" ON "ad_recaps" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_recaps_fk" FOREIGN KEY ("ad_recaps_id") REFERENCES "public"."ad_recaps"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ad_recaps_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_recaps_id");`)
}
