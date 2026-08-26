import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Pipeline commercial aligné sur les étapes Brevo + date de début de contrat.
 *
 * ⚠️ SQL ÉCRIT À LA MAIN. La génération automatique proposait de DÉTRUIRE puis
 * recréer l'enum des statuts (`DROP TYPE` + `USING ...::enum`) : le cast aurait
 * échoué sur toutes les fiches portant `prospect` ou `en-cours`, valeurs absentes
 * du nouvel enum — migration en erreur, et perte de données si elle passait.
 *
 * On procède donc en trois temps, sans jamais réécrire une seule ligne de statut :
 *  1. RENAME des deux valeurs héritées : `prospect` → `nouvelle`,
 *     `en-cours` → `en-qualification`. Les fiches gardent leur place, et leur
 *     `status_rank` reste juste (mêmes rangs qu'avant : 2 et 1).
 *  2. ADD des quatre étapes nouvelles (démo, engagement, attente longue, perdue).
 *  3. Les colonnes de l'import (provenance, identifiant Brevo, demande du lead)
 *     et la date de début de contrat.
 *
 * REPRISE des clients existants : `contract_start_date` reçoit la date de
 * signature (à défaut la date de création) pour tout ce qui a été un client.
 * Sans elle, `isBillableClient` cesserait de facturer du jour au lendemain —
 * CA et commissions à zéro sur des contrats bien en cours.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_partner_clients_client_status" RENAME VALUE 'prospect' TO 'nouvelle';
  ALTER TYPE "public"."enum_partner_clients_client_status" RENAME VALUE 'en-cours' TO 'en-qualification';
  ALTER TYPE "public"."enum_partner_clients_client_status" ADD VALUE 'demo-programmee' BEFORE 'en-test';
  ALTER TYPE "public"."enum_partner_clients_client_status" ADD VALUE 'attente-engagement' BEFORE 'en-test';
  ALTER TYPE "public"."enum_partner_clients_client_status" ADD VALUE 'attente-longue' BEFORE 'en-test';
  ALTER TYPE "public"."enum_partner_clients_client_status" ADD VALUE 'perdue' AFTER 'actif';
  ALTER TYPE "public"."enum__partner_clients_v_version_client_status" RENAME VALUE 'prospect' TO 'nouvelle';
  ALTER TYPE "public"."enum__partner_clients_v_version_client_status" RENAME VALUE 'en-cours' TO 'en-qualification';
  ALTER TYPE "public"."enum__partner_clients_v_version_client_status" ADD VALUE 'demo-programmee' BEFORE 'en-test';
  ALTER TYPE "public"."enum__partner_clients_v_version_client_status" ADD VALUE 'attente-engagement' BEFORE 'en-test';
  ALTER TYPE "public"."enum__partner_clients_v_version_client_status" ADD VALUE 'attente-longue' BEFORE 'en-test';
  ALTER TYPE "public"."enum__partner_clients_v_version_client_status" ADD VALUE 'perdue' AFTER 'actif';
  ALTER TABLE "partner_clients" ALTER COLUMN "client_status" SET DEFAULT 'nouvelle';
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_client_status" SET DEFAULT 'nouvelle';
  CREATE TYPE "public"."enum_partner_clients_source" AS ENUM('manuelle', 'site-vitrine');
  CREATE TYPE "public"."enum__partner_clients_v_version_source" AS ENUM('manuelle', 'site-vitrine');
  ALTER TABLE "partner_clients" ADD COLUMN "source" "enum_partner_clients_source" DEFAULT 'manuelle';
  ALTER TABLE "partner_clients" ADD COLUMN "brevo_deal_id" varchar;
  ALTER TABLE "partner_clients" ADD COLUMN "lead_notes" varchar;
  ALTER TABLE "partner_clients" ADD COLUMN "contract_start_date" timestamp(3) with time zone;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_source" "enum__partner_clients_v_version_source" DEFAULT 'manuelle';
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_brevo_deal_id" varchar;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_lead_notes" varchar;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_contract_start_date" timestamp(3) with time zone;
  CREATE UNIQUE INDEX "partner_clients_brevo_deal_id_idx" ON "partner_clients" USING btree ("brevo_deal_id");
  CREATE INDEX "partner_clients_contract_start_date_idx" ON "partner_clients" USING btree ("contract_start_date");
  CREATE INDEX "_partner_clients_v_version_version_brevo_deal_id_idx" ON "_partner_clients_v" USING btree ("version_brevo_deal_id");
  CREATE INDEX "_partner_clients_v_version_version_contract_start_date_idx" ON "_partner_clients_v" USING btree ("version_contract_start_date");
  UPDATE "partner_clients" SET "contract_start_date" = COALESCE("signature_date", "created_at")
    WHERE "client_status" IN ('actif', 'resilie', 'archive') AND "contract_start_date" IS NULL;
  UPDATE "_partner_clients_v" SET "version_contract_start_date" = COALESCE("version_signature_date", "version_created_at")
    WHERE "version_client_status" IN ('actif', 'resilie', 'archive') AND "version_contract_start_date" IS NULL;`)
}

/**
 * Retour en arrière. Postgres ne sait pas retirer une valeur d'un enum : il faut
 * le recréer. Les fiches posées sur une étape qui n'existait pas avant sont
 * d'abord ramenées à l'équivalent hérité le plus proche (sinon le cast échoue et
 * la migration inverse est impossible) :
 *   démo programmée / en attente d'engagement / en attente longue → « en cours »,
 *   perdue → « archivé ».
 */
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   UPDATE "partner_clients" SET "client_status" = 'en-qualification'
    WHERE "client_status" IN ('demo-programmee', 'attente-engagement', 'attente-longue');
  UPDATE "partner_clients" SET "client_status" = 'archive' WHERE "client_status" = 'perdue';
  UPDATE "_partner_clients_v" SET "version_client_status" = 'en-qualification'
    WHERE "version_client_status" IN ('demo-programmee', 'attente-engagement', 'attente-longue');
  UPDATE "_partner_clients_v" SET "version_client_status" = 'archive' WHERE "version_client_status" = 'perdue';
  ALTER TABLE "partner_clients" ALTER COLUMN "client_status" SET DATA TYPE text;
  ALTER TABLE "partner_clients" ALTER COLUMN "client_status" SET DEFAULT 'prospect'::text;
  UPDATE "partner_clients" SET "client_status" = 'prospect' WHERE "client_status" = 'nouvelle';
  UPDATE "partner_clients" SET "client_status" = 'en-cours' WHERE "client_status" = 'en-qualification';
  DROP TYPE "public"."enum_partner_clients_client_status";
  CREATE TYPE "public"."enum_partner_clients_client_status" AS ENUM('prospect', 'en-cours', 'en-test', 'actif', 'resilie', 'archive');
  ALTER TABLE "partner_clients" ALTER COLUMN "client_status" SET DEFAULT 'prospect'::"public"."enum_partner_clients_client_status";
  ALTER TABLE "partner_clients" ALTER COLUMN "client_status" SET DATA TYPE "public"."enum_partner_clients_client_status" USING "client_status"::"public"."enum_partner_clients_client_status";
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_client_status" SET DATA TYPE text;
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_client_status" SET DEFAULT 'prospect'::text;
  UPDATE "_partner_clients_v" SET "version_client_status" = 'prospect' WHERE "version_client_status" = 'nouvelle';
  UPDATE "_partner_clients_v" SET "version_client_status" = 'en-cours' WHERE "version_client_status" = 'en-qualification';
  DROP TYPE "public"."enum__partner_clients_v_version_client_status";
  CREATE TYPE "public"."enum__partner_clients_v_version_client_status" AS ENUM('prospect', 'en-cours', 'en-test', 'actif', 'resilie', 'archive');
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_client_status" SET DEFAULT 'prospect'::"public"."enum__partner_clients_v_version_client_status";
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_client_status" SET DATA TYPE "public"."enum__partner_clients_v_version_client_status" USING "version_client_status"::"public"."enum__partner_clients_v_version_client_status";
  DROP INDEX "partner_clients_brevo_deal_id_idx";
  DROP INDEX "partner_clients_contract_start_date_idx";
  DROP INDEX "_partner_clients_v_version_version_brevo_deal_id_idx";
  DROP INDEX "_partner_clients_v_version_version_contract_start_date_idx";
  ALTER TABLE "partner_clients" DROP COLUMN "source";
  ALTER TABLE "partner_clients" DROP COLUMN "brevo_deal_id";
  ALTER TABLE "partner_clients" DROP COLUMN "lead_notes";
  ALTER TABLE "partner_clients" DROP COLUMN "contract_start_date";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_source";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_brevo_deal_id";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_lead_notes";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_contract_start_date";
  DROP TYPE "public"."enum_partner_clients_source";
  DROP TYPE "public"."enum__partner_clients_v_version_source";`)
}
