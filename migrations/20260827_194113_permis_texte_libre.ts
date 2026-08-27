import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Permis et CACES : de listes fermées à du texte libre.
 *
 * Les deux champs étaient des `select hasMany`, donc stockés dans une table
 * annexe avec un type énuméré. Un client dont le permis ne figurait pas dans la
 * nomenclature ne pouvait rien saisir — et le champ étant obligatoire, tout son
 * dossier de démarrage restait bloqué.
 *
 * La version générée par Payload commençait par `DROP TABLE`, puis ajoutait une
 * colonne `NOT NULL` sans valeur par défaut. Deux défauts : elle jetait les
 * valeurs déjà saisies, et elle ÉCHOUAIT sur une table non vide. Les deux tables
 * sont vides aujourd'hui, mais le dossier est ouvert aux clients : une ligne
 * peut arriver entre l'écriture et l'exécution.
 *
 * On convertit donc avant de supprimer. « c1e » devient « C1E », « r482-b1 »
 * devient « R482 B1 » — lisible, et déjà au format que le champ attend.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "client_vehicles" ADD COLUMN "license_types" varchar;
  ALTER TABLE "client_machines" ADD COLUMN "caces_types" varchar;

  UPDATE "client_vehicles" v SET "license_types" = COALESCE((
    SELECT string_agg(upper(replace(l."value"::text, '-', ' ')), ', ' ORDER BY l."order")
    FROM "client_vehicles_license_types" l WHERE l."parent_id" = v."id"
  ), '');
  UPDATE "client_machines" m SET "caces_types" = COALESCE((
    SELECT string_agg(upper(replace(t."value"::text, '-', ' ')), ', ' ORDER BY t."order")
    FROM "client_machines_caces_types" t WHERE t."parent_id" = m."id"
  ), '');

  ALTER TABLE "client_vehicles" ALTER COLUMN "license_types" SET NOT NULL;
  ALTER TABLE "client_machines" ALTER COLUMN "caces_types" SET NOT NULL;

  DROP TABLE "client_vehicles_license_types" CASCADE;
  DROP TABLE "client_machines_caces_types" CASCADE;
  DROP TYPE "public"."enum_client_vehicles_license_types";
  DROP TYPE "public"."enum_client_machines_caces_types";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_client_vehicles_license_types" AS ENUM('b', 'be', 'c1', 'c1e', 'c', 'ce', 'd', 'de');
  CREATE TYPE "public"."enum_client_machines_caces_types" AS ENUM('r482-a', 'r482-b1', 'r482-b2', 'r482-c1', 'r482-c2', 'r482-c3', 'r482-d', 'r482-e', 'r482-f', 'r482-g', 'r486-a', 'r486-b', 'r486-c', 'r489-1', 'r489-3', 'r489-5', 'r490');
  CREATE TABLE "client_vehicles_license_types" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_client_vehicles_license_types",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "client_machines_caces_types" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_client_machines_caces_types",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "client_vehicles_license_types" ADD CONSTRAINT "client_vehicles_license_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."client_vehicles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "client_machines_caces_types" ADD CONSTRAINT "client_machines_caces_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."client_machines"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "client_vehicles_license_types_order_idx" ON "client_vehicles_license_types" USING btree ("order");
  CREATE INDEX "client_vehicles_license_types_parent_idx" ON "client_vehicles_license_types" USING btree ("parent_id");
  CREATE INDEX "client_machines_caces_types_order_idx" ON "client_machines_caces_types" USING btree ("order");
  CREATE INDEX "client_machines_caces_types_parent_idx" ON "client_machines_caces_types" USING btree ("parent_id");
  ALTER TABLE "client_vehicles" DROP COLUMN "license_types";
  ALTER TABLE "client_machines" DROP COLUMN "caces_types";`)
}
