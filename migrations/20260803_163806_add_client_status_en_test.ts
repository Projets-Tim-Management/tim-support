import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Ajoute le statut client « En test » (entre « En cours » et « Actif »).
 *
 * ⚠️ La génération automatique avait AUSSI produit, sans rapport avec ce
 * changement, la suppression de `payload_locked_documents_rels.partner_clients_id`
 * (son index et sa contrainte) — séquelle du passage de `lockDocuments` à false
 * sur la collection le 31/07. Statements DESTRUCTIFS sur une base partagée avec
 * la prod, retirés d'ici : cette colonne interne à Payload n'est plus écrite, la
 * laisser ne coûte rien. À traiter dans une migration dédiée, si on le décide.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_partner_clients_client_status" ADD VALUE 'en-test' BEFORE 'actif';
  ALTER TYPE "public"."enum__partner_clients_v_version_client_status" ADD VALUE 'en-test' BEFORE 'actif';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Postgres ne sait pas retirer une valeur d'un enum : il faut le recréer.
  // Échouera (volontairement) si des clients portent encore le statut « en-test ».
  await db.execute(sql`
   ALTER TABLE "partner_clients" ALTER COLUMN "client_status" SET DATA TYPE text;
  ALTER TABLE "partner_clients" ALTER COLUMN "client_status" SET DEFAULT 'actif'::text;
  DROP TYPE "public"."enum_partner_clients_client_status";
  CREATE TYPE "public"."enum_partner_clients_client_status" AS ENUM('prospect', 'en-cours', 'actif', 'resilie', 'archive');
  ALTER TABLE "partner_clients" ALTER COLUMN "client_status" SET DEFAULT 'actif'::"public"."enum_partner_clients_client_status";
  ALTER TABLE "partner_clients" ALTER COLUMN "client_status" SET DATA TYPE "public"."enum_partner_clients_client_status" USING "client_status"::"public"."enum_partner_clients_client_status";
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_client_status" SET DATA TYPE text;
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_client_status" SET DEFAULT 'actif'::text;
  DROP TYPE "public"."enum__partner_clients_v_version_client_status";
  CREATE TYPE "public"."enum__partner_clients_v_version_client_status" AS ENUM('prospect', 'en-cours', 'actif', 'resilie', 'archive');
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_client_status" SET DEFAULT 'actif'::"public"."enum__partner_clients_v_version_client_status";
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_client_status" SET DATA TYPE "public"."enum__partner_clients_v_version_client_status" USING "version_client_status"::"public"."enum__partner_clients_v_version_client_status";`)
}
