import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_api_alerts_status" AS ENUM('en-panne', 'en-observation', 'retablie');
  CREATE TYPE "public"."enum_api_alerts_kind" AS ENUM('paiement', 'acces', 'autre', 'passager');
  ALTER TYPE "public"."enum_users_team_emails" ADD VALUE 'connexion-api' BEFORE 'agendas';
  ALTER TYPE "public"."enum_team_emails_rules_email" ADD VALUE 'connexion-api' BEFORE 'agendas';
  CREATE TABLE "api_alerts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"provider" varchar NOT NULL,
  	"label" varchar,
  	"status" "enum_api_alerts_status",
  	"kind" "enum_api_alerts_kind",
  	"message" varchar,
  	"failures" numeric,
  	"first_failed_at" timestamp(3) with time zone,
  	"last_failed_at" timestamp(3) with time zone,
  	"emailed_at" timestamp(3) with time zone,
  	"resolved_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "api_alerts_id" integer;
  CREATE UNIQUE INDEX "api_alerts_provider_idx" ON "api_alerts" USING btree ("provider");
  CREATE INDEX "api_alerts_status_idx" ON "api_alerts" USING btree ("status");
  CREATE INDEX "api_alerts_updated_at_idx" ON "api_alerts" USING btree ("updated_at");
  CREATE INDEX "api_alerts_created_at_idx" ON "api_alerts" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_api_alerts_fk" FOREIGN KEY ("api_alerts_id") REFERENCES "public"."api_alerts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_api_alerts_id_idx" ON "payload_locked_documents_rels" USING btree ("api_alerts_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "api_alerts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "api_alerts" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_api_alerts_fk";
  
  ALTER TABLE "users_team_emails" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_users_team_emails";
  CREATE TYPE "public"."enum_users_team_emails" AS ENUM('rapprochement-mois', 'rapprochement-dernier-appel', 'contrat-a-contresigner', 'client-gagne', 'parcours-go-nogo', 'parcours-devis', 'parcours-contrat', 'parcours-dossier', 'parcours-prise-en-main', 'parcours-acces-manquants', 'parcours-etapes', 'publicite-urgence', 'publicite-reconnexion', 'publicite-recap', 'agendas');
  ALTER TABLE "users_team_emails" ALTER COLUMN "value" SET DATA TYPE "public"."enum_users_team_emails" USING "value"::"public"."enum_users_team_emails";
  ALTER TABLE "team_emails_rules" ALTER COLUMN "email" SET DATA TYPE text;
  DROP TYPE "public"."enum_team_emails_rules_email";
  CREATE TYPE "public"."enum_team_emails_rules_email" AS ENUM('rapprochement-mois', 'rapprochement-dernier-appel', 'contrat-a-contresigner', 'client-gagne', 'parcours-go-nogo', 'parcours-devis', 'parcours-contrat', 'parcours-dossier', 'parcours-prise-en-main', 'parcours-acces-manquants', 'parcours-etapes', 'publicite-urgence', 'publicite-reconnexion', 'publicite-recap', 'agendas');
  ALTER TABLE "team_emails_rules" ALTER COLUMN "email" SET DATA TYPE "public"."enum_team_emails_rules_email" USING "email"::"public"."enum_team_emails_rules_email";
  DROP INDEX "payload_locked_documents_rels_api_alerts_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "api_alerts_id";
  DROP TYPE "public"."enum_api_alerts_status";
  DROP TYPE "public"."enum_api_alerts_kind";`)
}
