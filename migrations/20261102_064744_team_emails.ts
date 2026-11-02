import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// ADDITIVE — générée par scripts/db-migrate-additive.ts (schéma d'avant fusionné : l'ancien moteur vidéo reste en base jusqu'au temps 2).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_team_emails" AS ENUM('rapprochement-mois', 'rapprochement-dernier-appel', 'contrat-a-contresigner', 'parcours-go-nogo', 'parcours-devis', 'parcours-contrat', 'parcours-dossier', 'parcours-prise-en-main', 'parcours-acces-manquants', 'parcours-etapes', 'publicite-urgence', 'publicite-reconnexion', 'publicite-recap', 'agendas');
  CREATE TYPE "public"."enum_users_team_emails_mode" AS ENUM('role', 'custom');
  CREATE TYPE "public"."enum_team_emails_rules_roles" AS ENUM('super-admin', 'admin', 'support', 'partner-metier');
  CREATE TYPE "public"."enum_team_emails_rules_email" AS ENUM('rapprochement-mois', 'rapprochement-dernier-appel', 'contrat-a-contresigner', 'parcours-go-nogo', 'parcours-devis', 'parcours-contrat', 'parcours-dossier', 'parcours-prise-en-main', 'parcours-acces-manquants', 'parcours-etapes', 'publicite-urgence', 'publicite-reconnexion', 'publicite-recap', 'agendas');
  CREATE TABLE "users_team_emails" (
	"order" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"value" "enum_users_team_emails",
	"id" serial PRIMARY KEY NOT NULL
);

  CREATE TABLE "team_emails_rules_roles" (
	"order" integer NOT NULL,
	"parent_id" varchar NOT NULL,
	"value" "enum_team_emails_rules_roles",
	"id" serial PRIMARY KEY NOT NULL
);

  CREATE TABLE "team_emails_rules" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"email" "enum_team_emails_rules_email" NOT NULL
);

  CREATE TABLE "team_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_address" varchar,
	"support_address" varchar,
	"updated_at" timestamp(3) with time zone,
	"created_at" timestamp(3) with time zone
);

  ALTER TABLE "users" ADD COLUMN "team_emails_mode" "enum_users_team_emails_mode" DEFAULT 'role';
  ALTER TABLE "users_team_emails" ADD CONSTRAINT "users_team_emails_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "team_emails_rules_roles" ADD CONSTRAINT "team_emails_rules_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."team_emails_rules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "team_emails_rules" ADD CONSTRAINT "team_emails_rules_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."team_emails"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_team_emails_order_idx" ON "users_team_emails" USING btree ("order");
  CREATE INDEX "users_team_emails_parent_idx" ON "users_team_emails" USING btree ("parent_id");
  CREATE INDEX "team_emails_rules_roles_order_idx" ON "team_emails_rules_roles" USING btree ("order");
  CREATE INDEX "team_emails_rules_roles_parent_idx" ON "team_emails_rules_roles" USING btree ("parent_id");
  CREATE INDEX "team_emails_rules_order_idx" ON "team_emails_rules" USING btree ("_order");
  CREATE INDEX "team_emails_rules_parent_id_idx" ON "team_emails_rules" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_team_emails" CASCADE;
  DROP TABLE "team_emails_rules_roles" CASCADE;
  DROP TABLE "team_emails_rules" CASCADE;
  DROP TABLE "team_emails" CASCADE;
  ALTER TABLE "users" DROP COLUMN "team_emails_mode";
  DROP TYPE "public"."enum_users_team_emails";
  DROP TYPE "public"."enum_users_team_emails_mode";
  DROP TYPE "public"."enum_team_emails_rules_roles";
  DROP TYPE "public"."enum_team_emails_rules_email";`)
}
