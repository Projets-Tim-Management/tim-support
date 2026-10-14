import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ad_styles_logo_animation" AS ENUM('construction', 'fondu', 'aucune');
  ALTER TYPE "public"."enum_ad_styles_title_font" ADD VALUE 'kit' BEFORE 'montserrat';
  ALTER TYPE "public"."enum_ad_styles_body_font" ADD VALUE 'kit' BEFORE 'montserrat';
  ALTER TYPE "public"."enum_ad_styles_title_case" ADD VALUE 'kit' BEFORE 'normale';
  ALTER TABLE "ad_styles" ADD COLUMN "logo_animation" "enum_ad_styles_logo_animation" DEFAULT 'construction';
  ALTER TABLE "ads_brand_kit" ADD COLUMN "logo_animated_id" integer;
  ALTER TABLE "ads_brand_kit" ADD CONSTRAINT "ads_brand_kit_logo_animated_id_ad_media_id_fk" FOREIGN KEY ("logo_animated_id") REFERENCES "public"."ad_media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ads_brand_kit_logo_animated_idx" ON "ads_brand_kit" USING btree ("logo_animated_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ads_brand_kit" DROP CONSTRAINT "ads_brand_kit_logo_animated_id_ad_media_id_fk";
  
  ALTER TABLE "ad_styles" ALTER COLUMN "title_font" SET DATA TYPE text;
  DROP TYPE "public"."enum_ad_styles_title_font";
  CREATE TYPE "public"."enum_ad_styles_title_font" AS ENUM('montserrat', 'inter', 'poppins', 'archivo', 'archivo-black', 'bebas-neue', 'space-grotesk', 'dm-sans', 'manrope', 'lato');
  ALTER TABLE "ad_styles" ALTER COLUMN "title_font" SET DATA TYPE "public"."enum_ad_styles_title_font" USING "title_font"::"public"."enum_ad_styles_title_font";
  ALTER TABLE "ad_styles" ALTER COLUMN "body_font" SET DATA TYPE text;
  DROP TYPE "public"."enum_ad_styles_body_font";
  CREATE TYPE "public"."enum_ad_styles_body_font" AS ENUM('montserrat', 'inter', 'poppins', 'archivo', 'archivo-black', 'bebas-neue', 'space-grotesk', 'dm-sans', 'manrope', 'lato');
  ALTER TABLE "ad_styles" ALTER COLUMN "body_font" SET DATA TYPE "public"."enum_ad_styles_body_font" USING "body_font"::"public"."enum_ad_styles_body_font";
  ALTER TABLE "ad_styles" ALTER COLUMN "title_case" SET DATA TYPE text;
  ALTER TABLE "ad_styles" ALTER COLUMN "title_case" SET DEFAULT 'normale'::text;
  DROP TYPE "public"."enum_ad_styles_title_case";
  CREATE TYPE "public"."enum_ad_styles_title_case" AS ENUM('normale', 'majuscules');
  ALTER TABLE "ad_styles" ALTER COLUMN "title_case" SET DEFAULT 'normale'::"public"."enum_ad_styles_title_case";
  ALTER TABLE "ad_styles" ALTER COLUMN "title_case" SET DATA TYPE "public"."enum_ad_styles_title_case" USING "title_case"::"public"."enum_ad_styles_title_case";
  DROP INDEX "ads_brand_kit_logo_animated_idx";
  ALTER TABLE "ad_styles" DROP COLUMN "logo_animation";
  ALTER TABLE "ads_brand_kit" DROP COLUMN "logo_animated_id";
  DROP TYPE "public"."enum_ad_styles_logo_animation";`)
}
