import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ad_styles_graphics" AS ENUM('pastilles', 'soulignements', 'bandeaux');
  CREATE TYPE "public"."enum_ad_styles_transitions" AS ENUM('coupe', 'glisse', 'zoom');
  CREATE TYPE "public"."enum_ad_styles_opening" AS ENUM('titre-mot-a-mot', 'aplat-probleme', 'titre-pose');
  CREATE TYPE "public"."enum_ad_styles_background" AS ENUM('sombre', 'clair', 'aplats');
  CREATE TYPE "public"."enum_ad_styles_proof" AS ENUM('ligne', 'chiffre-geant', 'chiffre-source');
  CREATE TYPE "public"."enum_ad_styles_title_font" AS ENUM('montserrat', 'inter', 'poppins', 'archivo', 'archivo-black', 'bebas-neue', 'space-grotesk', 'dm-sans', 'manrope', 'lato');
  CREATE TYPE "public"."enum_ad_styles_body_font" AS ENUM('montserrat', 'inter', 'poppins', 'archivo', 'archivo-black', 'bebas-neue', 'space-grotesk', 'dm-sans', 'manrope', 'lato');
  CREATE TYPE "public"."enum_ad_styles_title_case" AS ENUM('normale', 'majuscules');
  CREATE TYPE "public"."enum_ad_styles_phone_frame" AS ENUM('maquette', 'ecran-seul', 'incline');
  CREATE TYPE "public"."enum_ad_styles_corners" AS ENUM('carres', 'arrondis', 'pilule');
  CREATE TYPE "public"."enum_ad_styles_pace" AS ENUM('pose', 'dynamique', 'rapide');
  CREATE TYPE "public"."enum_ad_styles_subtitles" AS ENUM('bandeau', 'mot-a-mot', 'aucun');
  ALTER TYPE "public"."enum_ad_creatives_tests_dimension" ADD VALUE 'style';
  CREATE TABLE "ad_styles_graphics" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_ad_styles_graphics",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "ad_styles_transitions" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_ad_styles_transitions",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "ad_styles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"active" boolean DEFAULT true,
  	"intent" varchar NOT NULL,
  	"opening" "enum_ad_styles_opening" NOT NULL,
  	"background" "enum_ad_styles_background" NOT NULL,
  	"proof" "enum_ad_styles_proof" DEFAULT 'ligne',
  	"title_font" "enum_ad_styles_title_font" NOT NULL,
  	"body_font" "enum_ad_styles_body_font" NOT NULL,
  	"title_case" "enum_ad_styles_title_case" DEFAULT 'normale',
  	"phone_frame" "enum_ad_styles_phone_frame" NOT NULL,
  	"zoom_on_gesture" boolean DEFAULT false,
  	"corners" "enum_ad_styles_corners" DEFAULT 'arrondis',
  	"pace" "enum_ad_styles_pace" NOT NULL,
  	"subtitles" "enum_ad_styles_subtitles" NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "ad_creatives" ADD COLUMN "style_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ad_styles_id" integer;
  ALTER TABLE "ad_styles_graphics" ADD CONSTRAINT "ad_styles_graphics_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ad_styles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ad_styles_transitions" ADD CONSTRAINT "ad_styles_transitions_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ad_styles"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "ad_styles_graphics_order_idx" ON "ad_styles_graphics" USING btree ("order");
  CREATE INDEX "ad_styles_graphics_parent_idx" ON "ad_styles_graphics" USING btree ("parent_id");
  CREATE INDEX "ad_styles_transitions_order_idx" ON "ad_styles_transitions" USING btree ("order");
  CREATE INDEX "ad_styles_transitions_parent_idx" ON "ad_styles_transitions" USING btree ("parent_id");
  CREATE UNIQUE INDEX "ad_styles_name_idx" ON "ad_styles" USING btree ("name");
  CREATE INDEX "ad_styles_active_idx" ON "ad_styles" USING btree ("active");
  CREATE INDEX "ad_styles_updated_at_idx" ON "ad_styles" USING btree ("updated_at");
  CREATE INDEX "ad_styles_created_at_idx" ON "ad_styles" USING btree ("created_at");
  ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_style_id_ad_styles_id_fk" FOREIGN KEY ("style_id") REFERENCES "public"."ad_styles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ad_styles_fk" FOREIGN KEY ("ad_styles_id") REFERENCES "public"."ad_styles"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "ad_creatives_style_idx" ON "ad_creatives" USING btree ("style_id");
  CREATE INDEX "payload_locked_documents_rels_ad_styles_id_idx" ON "payload_locked_documents_rels" USING btree ("ad_styles_id");`)

  // Les trois styles de la planche (A, B, C) ne sont PAS versés ici : scripts/db-migrate.mjs n'exécute
  // que le SQL de up(). Ils le sont par scripts/ads-styles-seed.ts (idempotent).
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ad_styles_graphics" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ad_styles_transitions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ad_styles" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ad_styles_graphics" CASCADE;
  DROP TABLE "ad_styles_transitions" CASCADE;
  DROP TABLE "ad_styles" CASCADE;
  ALTER TABLE "ad_creatives" DROP CONSTRAINT "ad_creatives_style_id_ad_styles_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ad_styles_fk";
  
  ALTER TABLE "ad_creatives_tests" ALTER COLUMN "dimension" SET DATA TYPE text;
  DROP TYPE "public"."enum_ad_creatives_tests_dimension";
  CREATE TYPE "public"."enum_ad_creatives_tests_dimension" AS ENUM('ton', 'angle', 'accroche', 'format', 'visuel', 'cta');
  ALTER TABLE "ad_creatives_tests" ALTER COLUMN "dimension" SET DATA TYPE "public"."enum_ad_creatives_tests_dimension" USING "dimension"::"public"."enum_ad_creatives_tests_dimension";
  DROP INDEX "ad_creatives_style_idx";
  DROP INDEX "payload_locked_documents_rels_ad_styles_id_idx";
  ALTER TABLE "ad_creatives" DROP COLUMN "style_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ad_styles_id";
  DROP TYPE "public"."enum_ad_styles_graphics";
  DROP TYPE "public"."enum_ad_styles_transitions";
  DROP TYPE "public"."enum_ad_styles_opening";
  DROP TYPE "public"."enum_ad_styles_background";
  DROP TYPE "public"."enum_ad_styles_proof";
  DROP TYPE "public"."enum_ad_styles_title_font";
  DROP TYPE "public"."enum_ad_styles_body_font";
  DROP TYPE "public"."enum_ad_styles_title_case";
  DROP TYPE "public"."enum_ad_styles_phone_frame";
  DROP TYPE "public"."enum_ad_styles_corners";
  DROP TYPE "public"."enum_ad_styles_pace";
  DROP TYPE "public"."enum_ad_styles_subtitles";`)
}
