import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Pièces jointes des e-mails envoyés depuis une opportunité.
 *
 * Purement ADDITIF : une table de liaison, aucune donnée existante touchée.
 * `ON DELETE cascade` des deux côtés — une activité supprimée emporte ses liens,
 * un média supprimé aussi (le fichier n'existe plus, la trace du lien non plus).
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "client_activities_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  ALTER TABLE "client_activities_rels" ADD CONSTRAINT "client_activities_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."client_activities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "client_activities_rels" ADD CONSTRAINT "client_activities_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "client_activities_rels_order_idx" ON "client_activities_rels" USING btree ("order");
  CREATE INDEX "client_activities_rels_parent_idx" ON "client_activities_rels" USING btree ("parent_id");
  CREATE INDEX "client_activities_rels_path_idx" ON "client_activities_rels" USING btree ("path");
  CREATE INDEX "client_activities_rels_media_id_idx" ON "client_activities_rels" USING btree ("media_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "client_activities_rels" CASCADE;`)
}
