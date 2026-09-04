import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sequences" ADD COLUMN "signature_name" varchar;
  ALTER TABLE "sequences" ADD COLUMN "signature_role" varchar;
  ALTER TABLE "sequences" ADD COLUMN "signature_phone" varchar;
  ALTER TABLE "sequences" ADD COLUMN "signature_website" varchar;
  ALTER TABLE "sequences" ADD COLUMN "signature_photo_id" integer;
  ALTER TABLE "sequences" ADD CONSTRAINT "sequences_signature_photo_id_media_id_fk" FOREIGN KEY ("signature_photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "sequences_signature_photo_idx" ON "sequences" USING btree ("signature_photo_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sequences" DROP CONSTRAINT "sequences_signature_photo_id_media_id_fk";
  
  DROP INDEX "sequences_signature_photo_idx";
  ALTER TABLE "sequences" DROP COLUMN "signature_name";
  ALTER TABLE "sequences" DROP COLUMN "signature_role";
  ALTER TABLE "sequences" DROP COLUMN "signature_phone";
  ALTER TABLE "sequences" DROP COLUMN "signature_website";
  ALTER TABLE "sequences" DROP COLUMN "signature_photo_id";`)
}
