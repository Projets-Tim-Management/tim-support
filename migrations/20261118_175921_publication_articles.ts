import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_articles_write_mode" AS ENUM('article', 'maj');
  ALTER TYPE "public"."enum_articles_write_stage" ADD VALUE 'maj' BEFORE 'termine';
  ALTER TABLE "articles" ADD COLUMN "scheduled_at" timestamp(3) with time zone;
  ALTER TABLE "articles" ADD COLUMN "featured_image_url" varchar;
  ALTER TABLE "articles" ADD COLUMN "featured_media_id" numeric;
  ALTER TABLE "articles" ADD COLUMN "text_validated_at" timestamp(3) with time zone;
  ALTER TABLE "articles" ADD COLUMN "previous_acf" jsonb;
  ALTER TABLE "articles" ADD COLUMN "last_update_at" timestamp(3) with time zone;
  ALTER TABLE "articles" ADD COLUMN "write_mode" "enum_articles_write_mode";
  CREATE INDEX "articles_scheduled_at_idx" ON "articles" USING btree ("scheduled_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "articles" ALTER COLUMN "write_stage" SET DATA TYPE text;
  DROP TYPE "public"."enum_articles_write_stage";
  CREATE TYPE "public"."enum_articles_write_stage" AS ENUM('attente', 'recherche', 'preparation', 'redaction', 'relance', 'termine', 'echec');
  ALTER TABLE "articles" ALTER COLUMN "write_stage" SET DATA TYPE "public"."enum_articles_write_stage" USING "write_stage"::"public"."enum_articles_write_stage";
  DROP INDEX "articles_scheduled_at_idx";
  ALTER TABLE "articles" DROP COLUMN "scheduled_at";
  ALTER TABLE "articles" DROP COLUMN "featured_image_url";
  ALTER TABLE "articles" DROP COLUMN "featured_media_id";
  ALTER TABLE "articles" DROP COLUMN "text_validated_at";
  ALTER TABLE "articles" DROP COLUMN "previous_acf";
  ALTER TABLE "articles" DROP COLUMN "last_update_at";
  ALTER TABLE "articles" DROP COLUMN "write_mode";
  DROP TYPE "public"."enum_articles_write_mode";`)
}
