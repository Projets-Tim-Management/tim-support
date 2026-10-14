import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ads_brand_kit_graphics" AS ENUM('pastilles', 'soulignements', 'bandeaux');
  CREATE TYPE "public"."enum_ads_brand_kit_transitions" AS ENUM('coupe', 'glisse', 'zoom');
  CREATE TYPE "public"."enum_ads_brand_kit_inspirations_verdict" AS ENUM('aimer', 'eviter');
  CREATE TYPE "public"."enum_ads_brand_kit_title_font" AS ENUM('montserrat', 'inter', 'poppins', 'archivo', 'archivo-black', 'bebas-neue', 'space-grotesk', 'dm-sans', 'manrope', 'lato');
  CREATE TYPE "public"."enum_ads_brand_kit_body_font" AS ENUM('montserrat', 'inter', 'poppins', 'archivo', 'archivo-black', 'bebas-neue', 'space-grotesk', 'dm-sans', 'manrope', 'lato');
  CREATE TYPE "public"."enum_ads_brand_kit_title_case" AS ENUM('normale', 'majuscules');
  CREATE TYPE "public"."enum_ads_brand_kit_corners" AS ENUM('carres', 'arrondis', 'pilule');
  CREATE TYPE "public"."enum_ads_brand_kit_phone_frame" AS ENUM('maquette', 'ecran-seul', 'incline');
  CREATE TYPE "public"."enum_ads_brand_kit_pace" AS ENUM('pose', 'dynamique', 'rapide');
  CREATE TYPE "public"."enum_ads_brand_kit_subtitles" AS ENUM('bandeau', 'mot-a-mot', 'aucun');
  ALTER TYPE "public"."enum_ad_media_kind" ADD VALUE 'inspiration' BEFORE 'crea';
  CREATE TABLE "ads_brand_kit_graphics" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_ads_brand_kit_graphics",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "ads_brand_kit_transitions" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_ads_brand_kit_transitions",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "ads_brand_kit_inspirations" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"verdict" "enum_ads_brand_kit_inspirations_verdict" DEFAULT 'aimer' NOT NULL,
  	"image_id" integer,
  	"link" varchar,
  	"why" varchar NOT NULL
  );
  
  ALTER TABLE "ads_brand_kit" ADD COLUMN "logo_on_light_id" integer;
  ALTER TABLE "ads_brand_kit" ADD COLUMN "logo_symbol_id" integer;
  ALTER TABLE "ads_brand_kit" ADD COLUMN "palette_primary" varchar DEFAULT '#252B59';
  ALTER TABLE "ads_brand_kit" ADD COLUMN "palette_accent" varchar DEFAULT '#F05761';
  ALTER TABLE "ads_brand_kit" ADD COLUMN "palette_dark_bg" varchar DEFAULT '#252B59';
  ALTER TABLE "ads_brand_kit" ADD COLUMN "palette_light_bg" varchar DEFAULT '#f6f9fc';
  ALTER TABLE "ads_brand_kit" ADD COLUMN "palette_text_on_dark" varchar DEFAULT '#FFFFFF';
  ALTER TABLE "ads_brand_kit" ADD COLUMN "palette_text_on_light" varchar DEFAULT '#252B59';
  ALTER TABLE "ads_brand_kit" ADD COLUMN "title_font" "enum_ads_brand_kit_title_font" DEFAULT 'montserrat';
  ALTER TABLE "ads_brand_kit" ADD COLUMN "body_font" "enum_ads_brand_kit_body_font" DEFAULT 'inter';
  ALTER TABLE "ads_brand_kit" ADD COLUMN "title_case" "enum_ads_brand_kit_title_case" DEFAULT 'normale';
  ALTER TABLE "ads_brand_kit" ADD COLUMN "corners" "enum_ads_brand_kit_corners" DEFAULT 'arrondis';
  ALTER TABLE "ads_brand_kit" ADD COLUMN "phone_frame" "enum_ads_brand_kit_phone_frame" DEFAULT 'maquette';
  ALTER TABLE "ads_brand_kit" ADD COLUMN "pace" "enum_ads_brand_kit_pace" DEFAULT 'dynamique';
  ALTER TABLE "ads_brand_kit" ADD COLUMN "subtitles" "enum_ads_brand_kit_subtitles" DEFAULT 'mot-a-mot';
  ALTER TABLE "ads_brand_kit" ADD COLUMN "music_id" integer;
  ALTER TABLE "ads_brand_kit" ADD COLUMN "end_card_seconds" numeric DEFAULT 2.5;
  ALTER TABLE "ads_brand_kit" ADD COLUMN "end_card_url" varchar DEFAULT 'tim-management.co';
  ALTER TABLE "ads_brand_kit" ADD COLUMN "end_card_show_logo" boolean DEFAULT true;
  ALTER TABLE "ads_brand_kit_graphics" ADD CONSTRAINT "ads_brand_kit_graphics_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ads_brand_kit"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ads_brand_kit_transitions" ADD CONSTRAINT "ads_brand_kit_transitions_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ads_brand_kit"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ads_brand_kit_inspirations" ADD CONSTRAINT "ads_brand_kit_inspirations_image_id_ad_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."ad_media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ads_brand_kit_inspirations" ADD CONSTRAINT "ads_brand_kit_inspirations_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ads_brand_kit"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "ads_brand_kit_graphics_order_idx" ON "ads_brand_kit_graphics" USING btree ("order");
  CREATE INDEX "ads_brand_kit_graphics_parent_idx" ON "ads_brand_kit_graphics" USING btree ("parent_id");
  CREATE INDEX "ads_brand_kit_transitions_order_idx" ON "ads_brand_kit_transitions" USING btree ("order");
  CREATE INDEX "ads_brand_kit_transitions_parent_idx" ON "ads_brand_kit_transitions" USING btree ("parent_id");
  CREATE INDEX "ads_brand_kit_inspirations_order_idx" ON "ads_brand_kit_inspirations" USING btree ("_order");
  CREATE INDEX "ads_brand_kit_inspirations_parent_id_idx" ON "ads_brand_kit_inspirations" USING btree ("_parent_id");
  CREATE INDEX "ads_brand_kit_inspirations_image_idx" ON "ads_brand_kit_inspirations" USING btree ("image_id");
  ALTER TABLE "ads_brand_kit" ADD CONSTRAINT "ads_brand_kit_logo_on_light_id_ad_media_id_fk" FOREIGN KEY ("logo_on_light_id") REFERENCES "public"."ad_media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ads_brand_kit" ADD CONSTRAINT "ads_brand_kit_logo_symbol_id_ad_media_id_fk" FOREIGN KEY ("logo_symbol_id") REFERENCES "public"."ad_media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ads_brand_kit" ADD CONSTRAINT "ads_brand_kit_music_id_ad_media_id_fk" FOREIGN KEY ("music_id") REFERENCES "public"."ad_media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ads_brand_kit_logo_on_light_idx" ON "ads_brand_kit" USING btree ("logo_on_light_id");
  CREATE INDEX "ads_brand_kit_logo_symbol_idx" ON "ads_brand_kit" USING btree ("logo_symbol_id");
  CREATE INDEX "ads_brand_kit_music_idx" ON "ads_brand_kit" USING btree ("music_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ads_brand_kit_graphics" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ads_brand_kit_transitions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ads_brand_kit_inspirations" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ads_brand_kit_graphics" CASCADE;
  DROP TABLE "ads_brand_kit_transitions" CASCADE;
  DROP TABLE "ads_brand_kit_inspirations" CASCADE;
  ALTER TABLE "ads_brand_kit" DROP CONSTRAINT "ads_brand_kit_logo_on_light_id_ad_media_id_fk";
  
  ALTER TABLE "ads_brand_kit" DROP CONSTRAINT "ads_brand_kit_logo_symbol_id_ad_media_id_fk";
  
  ALTER TABLE "ads_brand_kit" DROP CONSTRAINT "ads_brand_kit_music_id_ad_media_id_fk";
  
  ALTER TABLE "ad_media" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_ad_media_kind";
  CREATE TYPE "public"."enum_ad_media_kind" AS ENUM('logo', 'police', 'capture', 'photo', 'musique', 'fond', 'crea');
  ALTER TABLE "ad_media" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_ad_media_kind" USING "kind"::"public"."enum_ad_media_kind";
  DROP INDEX "ads_brand_kit_logo_on_light_idx";
  DROP INDEX "ads_brand_kit_logo_symbol_idx";
  DROP INDEX "ads_brand_kit_music_idx";
  ALTER TABLE "ads_brand_kit" DROP COLUMN "logo_on_light_id";
  ALTER TABLE "ads_brand_kit" DROP COLUMN "logo_symbol_id";
  ALTER TABLE "ads_brand_kit" DROP COLUMN "palette_primary";
  ALTER TABLE "ads_brand_kit" DROP COLUMN "palette_accent";
  ALTER TABLE "ads_brand_kit" DROP COLUMN "palette_dark_bg";
  ALTER TABLE "ads_brand_kit" DROP COLUMN "palette_light_bg";
  ALTER TABLE "ads_brand_kit" DROP COLUMN "palette_text_on_dark";
  ALTER TABLE "ads_brand_kit" DROP COLUMN "palette_text_on_light";
  ALTER TABLE "ads_brand_kit" DROP COLUMN "title_font";
  ALTER TABLE "ads_brand_kit" DROP COLUMN "body_font";
  ALTER TABLE "ads_brand_kit" DROP COLUMN "title_case";
  ALTER TABLE "ads_brand_kit" DROP COLUMN "corners";
  ALTER TABLE "ads_brand_kit" DROP COLUMN "phone_frame";
  ALTER TABLE "ads_brand_kit" DROP COLUMN "pace";
  ALTER TABLE "ads_brand_kit" DROP COLUMN "subtitles";
  ALTER TABLE "ads_brand_kit" DROP COLUMN "music_id";
  ALTER TABLE "ads_brand_kit" DROP COLUMN "end_card_seconds";
  ALTER TABLE "ads_brand_kit" DROP COLUMN "end_card_url";
  ALTER TABLE "ads_brand_kit" DROP COLUMN "end_card_show_logo";
  DROP TYPE "public"."enum_ads_brand_kit_graphics";
  DROP TYPE "public"."enum_ads_brand_kit_transitions";
  DROP TYPE "public"."enum_ads_brand_kit_inspirations_verdict";
  DROP TYPE "public"."enum_ads_brand_kit_title_font";
  DROP TYPE "public"."enum_ads_brand_kit_body_font";
  DROP TYPE "public"."enum_ads_brand_kit_title_case";
  DROP TYPE "public"."enum_ads_brand_kit_corners";
  DROP TYPE "public"."enum_ads_brand_kit_phone_frame";
  DROP TYPE "public"."enum_ads_brand_kit_pace";
  DROP TYPE "public"."enum_ads_brand_kit_subtitles";`)
}
