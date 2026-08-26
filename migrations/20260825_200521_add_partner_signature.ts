import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Signature d'e-mail d'un partenaire : fonction, entreprise, téléphone, site et
 * photo. Ajoutée au bas des messages envoyés depuis une opportunité.
 *
 * Purement ADDITIF : cinq colonnes, aucune donnée existante touchée.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partners" ADD COLUMN "signature_job_title" varchar;
  ALTER TABLE "partners" ADD COLUMN "signature_company" varchar;
  ALTER TABLE "partners" ADD COLUMN "signature_phone" varchar;
  ALTER TABLE "partners" ADD COLUMN "signature_website" varchar;
  ALTER TABLE "partners" ADD COLUMN "signature_photo_id" integer;
  ALTER TABLE "partners" ADD CONSTRAINT "partners_signature_photo_id_media_id_fk" FOREIGN KEY ("signature_photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "partners_signature_photo_idx" ON "partners" USING btree ("signature_photo_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partners" DROP CONSTRAINT "partners_signature_photo_id_media_id_fk";
  
  DROP INDEX "partners_signature_photo_idx";
  ALTER TABLE "partners" DROP COLUMN "signature_job_title";
  ALTER TABLE "partners" DROP COLUMN "signature_company";
  ALTER TABLE "partners" DROP COLUMN "signature_phone";
  ALTER TABLE "partners" DROP COLUMN "signature_website";
  ALTER TABLE "partners" DROP COLUMN "signature_photo_id";`)
}
