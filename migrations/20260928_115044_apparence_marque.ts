import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "appearance" ADD COLUMN "company_logo_id" integer;
  ALTER TABLE "appearance" ADD COLUMN "brand_primary" varchar DEFAULT '#252B59';
  ALTER TABLE "appearance" ADD COLUMN "brand_secondary" varchar DEFAULT '#f1f1ff';
  ALTER TABLE "appearance" ADD COLUMN "brand_red" varchar DEFAULT '#F05761';
  ALTER TABLE "appearance" ADD COLUMN "brand_other" varchar DEFAULT '#f6f9fc';
  ALTER TABLE "appearance" ADD CONSTRAINT "appearance_company_logo_id_media_id_fk" FOREIGN KEY ("company_logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "appearance_company_logo_idx" ON "appearance" USING btree ("company_logo_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "appearance" DROP CONSTRAINT "appearance_company_logo_id_media_id_fk";
  
  DROP INDEX "appearance_company_logo_idx";
  ALTER TABLE "appearance" DROP COLUMN "company_logo_id";
  ALTER TABLE "appearance" DROP COLUMN "brand_primary";
  ALTER TABLE "appearance" DROP COLUMN "brand_secondary";
  ALTER TABLE "appearance" DROP COLUMN "brand_red";
  ALTER TABLE "appearance" DROP COLUMN "brand_other";`)
}
