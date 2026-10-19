import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// ADDITIVE — générée par scripts/db-migrate-additive.ts (schéma d'avant fusionné : l'ancien moteur vidéo reste en base jusqu'au temps 2).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ad_campaigns_publication_status" AS ENUM('en-cours', 'en-pause', 'active', 'echec');
  ALTER TABLE "ad_campaigns" ADD COLUMN "publication_status" "enum_ad_campaigns_publication_status";
  ALTER TABLE "ad_campaigns" ADD COLUMN "publication" jsonb;
  ALTER TABLE "ad_campaigns" ADD COLUMN "publication_lease_until" timestamp(3) with time zone;
  CREATE INDEX "ad_campaigns_publication_status_idx" ON "ad_campaigns" USING btree ("publication_status");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "ad_campaigns_publication_status_idx";
  ALTER TABLE "ad_campaigns" DROP COLUMN "publication_status";
  ALTER TABLE "ad_campaigns" DROP COLUMN "publication";
  ALTER TABLE "ad_campaigns" DROP COLUMN "publication_lease_until";
  DROP TYPE "public"."enum_ad_campaigns_publication_status";`)
}
