import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Publicité, 19/10/2026 — le brief Claude Design et les fichiers finis
 * importés sur chaque créa. ADDITIVE : les tables et colonnes du moteur vidéo
 * retiré restent en base tant que la prod tourne sur l'ancien code (elles
 * partent dans une migration destructive à part, avec l'accord de Charlie).
 * Générée par scripts/tmp-additive-migration.ts (schéma d'avant fusionné).
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ad_creatives_brief_formats" AS ENUM('1x1', '4x5', '9x16');
  CREATE TYPE "public"."enum_ad_creatives_files_format" AS ENUM('1x1', '4x5', '9x16');
  CREATE TYPE "public"."enum_ad_creatives_files_kind" AS ENUM('image', 'video');
  CREATE TYPE "public"."enum_ad_creatives_brief_kind" AS ENUM('video', 'image', 'les-deux');
  CREATE TABLE "ad_creatives_brief_formats" (
	"order" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"value" "enum_ad_creatives_brief_formats",
	"id" serial PRIMARY KEY NOT NULL
);

  CREATE TABLE "ad_creatives_files" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"format" "enum_ad_creatives_files_format" NOT NULL,
	"kind" "enum_ad_creatives_files_kind" NOT NULL,
	"filename" varchar,
	"url" varchar NOT NULL,
	"pathname" varchar,
	"mime" varchar,
	"bytes" numeric,
	"width" numeric,
	"height" numeric,
	"duration_sec" numeric,
	"warnings" jsonb,
	"imported_at" timestamp(3) with time zone
);

  ALTER TABLE "ad_creatives" ADD COLUMN "brief_kind" "enum_ad_creatives_brief_kind";
  ALTER TABLE "ad_creatives" ADD COLUMN "brief_duration_sec" numeric;
  ALTER TABLE "ad_creatives" ADD COLUMN "brief_rationale" varchar;
  ALTER TABLE "ad_creatives" ADD COLUMN "brief_prompt" varchar;
  ALTER TABLE "ad_creatives" ADD COLUMN "brief_written_at" timestamp(3) with time zone;
  ALTER TABLE "ad_creatives_rels" ADD COLUMN "ad_rushes_id" integer;
  ALTER TABLE "ad_creatives_brief_formats" ADD CONSTRAINT "ad_creatives_brief_formats_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ad_creatives"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ad_creatives_files" ADD CONSTRAINT "ad_creatives_files_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ad_creatives"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "ad_creatives_brief_formats_order_idx" ON "ad_creatives_brief_formats" USING btree ("order");
  CREATE INDEX "ad_creatives_brief_formats_parent_idx" ON "ad_creatives_brief_formats" USING btree ("parent_id");
  CREATE INDEX "ad_creatives_files_order_idx" ON "ad_creatives_files" USING btree ("_order");
  CREATE INDEX "ad_creatives_files_parent_id_idx" ON "ad_creatives_files" USING btree ("_parent_id");
  ALTER TABLE "ad_creatives_rels" ADD CONSTRAINT "ad_creatives_rels_ad_rushes_fk" FOREIGN KEY ("ad_rushes_id") REFERENCES "public"."ad_rushes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "ad_creatives_rels_ad_rushes_id_idx" ON "ad_creatives_rels" USING btree ("ad_rushes_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ad_creatives_brief_formats" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ad_creatives_files" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ad_creatives_brief_formats" CASCADE;
  DROP TABLE "ad_creatives_files" CASCADE;
  ALTER TABLE "ad_creatives_rels" DROP CONSTRAINT "ad_creatives_rels_ad_rushes_fk";

  DROP INDEX "ad_creatives_rels_ad_rushes_id_idx";
  ALTER TABLE "ad_creatives" DROP COLUMN "brief_kind";
  ALTER TABLE "ad_creatives" DROP COLUMN "brief_duration_sec";
  ALTER TABLE "ad_creatives" DROP COLUMN "brief_rationale";
  ALTER TABLE "ad_creatives" DROP COLUMN "brief_prompt";
  ALTER TABLE "ad_creatives" DROP COLUMN "brief_written_at";
  ALTER TABLE "ad_creatives_rels" DROP COLUMN "ad_rushes_id";
  DROP TYPE "public"."enum_ad_creatives_brief_formats";
  DROP TYPE "public"."enum_ad_creatives_files_format";
  DROP TYPE "public"."enum_ad_creatives_files_kind";
  DROP TYPE "public"."enum_ad_creatives_brief_kind";`)
}
