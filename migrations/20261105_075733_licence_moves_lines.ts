import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// ADDITIVE — générée par scripts/db-migrate-additive.ts (schéma d'avant fusionné : l'ancien moteur vidéo reste en base jusqu'au temps 2).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_partner_clients_licence_moves_lines_profile" AS ENUM('admin', 'conducteur', 'chefChantier', 'chefEquipe', 'compagnon', 'bureau', 'visuel');
  CREATE TYPE "public"."enum__partner_clients_v_version_licence_moves_lines_profile" AS ENUM('admin', 'conducteur', 'chefChantier', 'chefEquipe', 'compagnon', 'bureau', 'visuel');
  CREATE TABLE "partner_clients_licence_moves_lines" (
	"_order" integer NOT NULL,
	"_parent_id" varchar NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"profile" "enum_partner_clients_licence_moves_lines_profile",
	"before" numeric,
	"after" numeric,
	"price" numeric
);

  CREATE TABLE "_partner_clients_v_version_licence_moves_lines" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"profile" "enum__partner_clients_v_version_licence_moves_lines_profile",
	"before" numeric,
	"after" numeric,
	"price" numeric,
	"_uuid" varchar
);

  ALTER TABLE "partner_clients_licence_moves_lines" ADD CONSTRAINT "partner_clients_licence_moves_lines_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."partner_clients_licence_moves"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_partner_clients_v_version_licence_moves_lines" ADD CONSTRAINT "_partner_clients_v_version_licence_moves_lines_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_partner_clients_v_version_licence_moves"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "partner_clients_licence_moves_lines_order_idx" ON "partner_clients_licence_moves_lines" USING btree ("_order");
  CREATE INDEX "partner_clients_licence_moves_lines_parent_id_idx" ON "partner_clients_licence_moves_lines" USING btree ("_parent_id");
  CREATE INDEX "_partner_clients_v_version_licence_moves_lines_order_idx" ON "_partner_clients_v_version_licence_moves_lines" USING btree ("_order");
  CREATE INDEX "_partner_clients_v_version_licence_moves_lines_parent_id_idx" ON "_partner_clients_v_version_licence_moves_lines" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "partner_clients_licence_moves_lines" CASCADE;
  DROP TABLE "_partner_clients_v_version_licence_moves_lines" CASCADE;
  DROP TYPE "public"."enum_partner_clients_licence_moves_lines_profile";
  DROP TYPE "public"."enum__partner_clients_v_version_licence_moves_lines_profile";`)
}
