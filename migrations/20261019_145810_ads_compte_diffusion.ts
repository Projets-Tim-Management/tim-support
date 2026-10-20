import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Publicité 3b, 19/10/2026 — la diffusion d'un compte : droits du jeton, Page,
 * Instagram et pixel choisis. ADDITIVE : le générateur proposait aussi les
 * suppressions de l'ancien moteur vidéo, gardées pour la migration destructive
 * à part (temps 2), avec l'accord de Charlie.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "ad_accounts" ADD COLUMN "diffusion_page_id" varchar;
  ALTER TABLE "ad_accounts" ADD COLUMN "diffusion_page_name" varchar;
  ALTER TABLE "ad_accounts" ADD COLUMN "diffusion_instagram_id" varchar;
  ALTER TABLE "ad_accounts" ADD COLUMN "diffusion_instagram_name" varchar;
  ALTER TABLE "ad_accounts" ADD COLUMN "diffusion_pixel_id" varchar;
  ALTER TABLE "ad_accounts" ADD COLUMN "diffusion_pixel_name" varchar;
  ALTER TABLE "ad_accounts" ADD COLUMN "diffusion_scopes" jsonb;
  ALTER TABLE "ad_accounts" ADD COLUMN "diffusion_found" jsonb;
  ALTER TABLE "ad_accounts" ADD COLUMN "diffusion_checked_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "ad_accounts" DROP COLUMN "diffusion_page_id";
  ALTER TABLE "ad_accounts" DROP COLUMN "diffusion_page_name";
  ALTER TABLE "ad_accounts" DROP COLUMN "diffusion_instagram_id";
  ALTER TABLE "ad_accounts" DROP COLUMN "diffusion_instagram_name";
  ALTER TABLE "ad_accounts" DROP COLUMN "diffusion_pixel_id";
  ALTER TABLE "ad_accounts" DROP COLUMN "diffusion_pixel_name";
  ALTER TABLE "ad_accounts" DROP COLUMN "diffusion_scopes";
  ALTER TABLE "ad_accounts" DROP COLUMN "diffusion_found";
  ALTER TABLE "ad_accounts" DROP COLUMN "diffusion_checked_at";`)
}
