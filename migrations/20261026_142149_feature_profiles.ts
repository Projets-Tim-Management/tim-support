import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// ADDITIVE — générée par scripts/db-migrate-additive.ts (schéma d'avant fusionné : l'ancien moteur vidéo reste en base jusqu'au temps 2).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_features_profiles" AS ENUM('conducteur', 'chefChantier', 'chefEquipe', 'compagnon', 'visuel', 'bureau');
  CREATE TYPE "public"."enum__features_v_version_profiles" AS ENUM('conducteur', 'chefChantier', 'chefEquipe', 'compagnon', 'visuel', 'bureau');
  CREATE TABLE "features_profiles" (
	"order" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"value" "enum_features_profiles",
	"id" serial PRIMARY KEY NOT NULL
);

  CREATE TABLE "_features_v_version_profiles" (
	"order" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"value" "enum__features_v_version_profiles",
	"id" serial PRIMARY KEY NOT NULL
);

  ALTER TABLE "features_profiles" ADD CONSTRAINT "features_profiles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_features_v_version_profiles" ADD CONSTRAINT "_features_v_version_profiles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_features_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "features_profiles_order_idx" ON "features_profiles" USING btree ("order");
  CREATE INDEX "features_profiles_parent_idx" ON "features_profiles" USING btree ("parent_id");
  CREATE INDEX "_features_v_version_profiles_order_idx" ON "_features_v_version_profiles" USING btree ("order");
  CREATE INDEX "_features_v_version_profiles_parent_idx" ON "_features_v_version_profiles" USING btree ("parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "features_profiles" CASCADE;
  DROP TABLE "_features_v_version_profiles" CASCADE;
  DROP TYPE "public"."enum_features_profiles";
  DROP TYPE "public"."enum__features_v_version_profiles";`)
}
