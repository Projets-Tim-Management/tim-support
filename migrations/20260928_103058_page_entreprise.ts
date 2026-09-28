import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "company_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"denomination" varchar,
  	"forme_sociale" varchar,
  	"adresse" varchar,
  	"siren" varchar,
  	"ville_rcs" varchar,
  	"numero_rcs" varchar,
  	"vat_number" varchar,
  	"tribunal" varchar,
  	"representant" varchar,
  	"qualite" varchar,
  	"iban" varchar,
  	"bic" varchar,
  	"email" varchar,
  	"phone" varchar,
  	"website" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  -- Reprise des valeurs déjà saisies sur la page Contrat (onglet « Prestataire »)
  -- avant de retirer ces colonnes : rien ne doit se perdre au déménagement.
  INSERT INTO "company_settings" ("denomination", "forme_sociale", "adresse", "siren", "ville_rcs", "numero_rcs", "tribunal", "representant", "qualite", "iban", "bic", "updated_at", "created_at")
  SELECT "provider_denomination", "provider_forme_sociale", "provider_adresse", '892316035', "provider_ville_rcs", "provider_numero_rcs", "provider_tribunal", "provider_representant", "provider_qualite", "bank_iban", "bank_bic", now(), now()
  FROM "contract_settings" LIMIT 1;
  ALTER TABLE "contract_settings" DROP COLUMN "provider_denomination";
  ALTER TABLE "contract_settings" DROP COLUMN "provider_forme_sociale";
  ALTER TABLE "contract_settings" DROP COLUMN "provider_adresse";
  ALTER TABLE "contract_settings" DROP COLUMN "provider_ville_rcs";
  ALTER TABLE "contract_settings" DROP COLUMN "provider_numero_rcs";
  ALTER TABLE "contract_settings" DROP COLUMN "provider_representant";
  ALTER TABLE "contract_settings" DROP COLUMN "provider_qualite";
  ALTER TABLE "contract_settings" DROP COLUMN "provider_tribunal";
  ALTER TABLE "contract_settings" DROP COLUMN "bank_iban";
  ALTER TABLE "contract_settings" DROP COLUMN "bank_bic";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "company_settings" CASCADE;
  ALTER TABLE "contract_settings" ADD COLUMN "provider_denomination" varchar;
  ALTER TABLE "contract_settings" ADD COLUMN "provider_forme_sociale" varchar;
  ALTER TABLE "contract_settings" ADD COLUMN "provider_adresse" varchar;
  ALTER TABLE "contract_settings" ADD COLUMN "provider_ville_rcs" varchar;
  ALTER TABLE "contract_settings" ADD COLUMN "provider_numero_rcs" varchar;
  ALTER TABLE "contract_settings" ADD COLUMN "provider_representant" varchar;
  ALTER TABLE "contract_settings" ADD COLUMN "provider_qualite" varchar;
  ALTER TABLE "contract_settings" ADD COLUMN "provider_tribunal" varchar;
  ALTER TABLE "contract_settings" ADD COLUMN "bank_iban" varchar;
  ALTER TABLE "contract_settings" ADD COLUMN "bank_bic" varchar;`)
}
