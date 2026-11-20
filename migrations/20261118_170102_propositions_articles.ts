import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_articles_refresh_state" AS ENUM('proposee', 'validee', 'refusee');
  CREATE TYPE "public"."enum_articles_refresh_reason" AS ENUM('baisse', 'position', 'echeance', 'format', 'doublon', 'autre');
  ALTER TYPE "public"."enum_articles_status" ADD VALUE 'arretee';
  ALTER TABLE "articles" ADD COLUMN "idea_why" varchar;
  ALTER TABLE "articles" ADD COLUMN "idea_angle" varchar;
  ALTER TABLE "articles" ADD COLUMN "idea_outline" varchar;
  ALTER TABLE "articles" ADD COLUMN "proposed_by" varchar;
  ALTER TABLE "articles" ADD COLUMN "proposed_at" timestamp(3) with time zone;
  ALTER TABLE "articles" ADD COLUMN "decided_at" timestamp(3) with time zone;
  ALTER TABLE "articles" ADD COLUMN "decision_note" varchar;
  ALTER TABLE "articles" ADD COLUMN "refresh_state" "enum_articles_refresh_state";
  ALTER TABLE "articles" ADD COLUMN "refresh_reason" "enum_articles_refresh_reason";
  ALTER TABLE "articles" ADD COLUMN "refresh_why" varchar;
  ALTER TABLE "articles" ADD COLUMN "refresh_plan" varchar;
  ALTER TABLE "articles" ADD COLUMN "refresh_proposed_by" varchar;
  ALTER TABLE "articles" ADD COLUMN "refresh_proposed_at" timestamp(3) with time zone;
  ALTER TABLE "articles" ADD COLUMN "refresh_decided_at" timestamp(3) with time zone;
  ALTER TABLE "articles" ADD COLUMN "refresh_decision_note" varchar;
  CREATE INDEX "articles_refresh_state_idx" ON "articles" USING btree ("refresh_state");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "articles" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "articles" ALTER COLUMN "status" SET DEFAULT 'idee'::text;
  DROP TYPE "public"."enum_articles_status";
  CREATE TYPE "public"."enum_articles_status" AS ENUM('idee', 'validee', 'redaction', 'a-verifier', 'image', 'pret', 'programme', 'publie', 'a-rafraichir', 'depublie');
  ALTER TABLE "articles" ALTER COLUMN "status" SET DEFAULT 'idee'::"public"."enum_articles_status";
  ALTER TABLE "articles" ALTER COLUMN "status" SET DATA TYPE "public"."enum_articles_status" USING "status"::"public"."enum_articles_status";
  DROP INDEX "articles_refresh_state_idx";
  ALTER TABLE "articles" DROP COLUMN "idea_why";
  ALTER TABLE "articles" DROP COLUMN "idea_angle";
  ALTER TABLE "articles" DROP COLUMN "idea_outline";
  ALTER TABLE "articles" DROP COLUMN "proposed_by";
  ALTER TABLE "articles" DROP COLUMN "proposed_at";
  ALTER TABLE "articles" DROP COLUMN "decided_at";
  ALTER TABLE "articles" DROP COLUMN "decision_note";
  ALTER TABLE "articles" DROP COLUMN "refresh_state";
  ALTER TABLE "articles" DROP COLUMN "refresh_reason";
  ALTER TABLE "articles" DROP COLUMN "refresh_why";
  ALTER TABLE "articles" DROP COLUMN "refresh_plan";
  ALTER TABLE "articles" DROP COLUMN "refresh_proposed_by";
  ALTER TABLE "articles" DROP COLUMN "refresh_proposed_at";
  ALTER TABLE "articles" DROP COLUMN "refresh_decided_at";
  ALTER TABLE "articles" DROP COLUMN "refresh_decision_note";
  DROP TYPE "public"."enum_articles_refresh_state";
  DROP TYPE "public"."enum_articles_refresh_reason";`)
}
