import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_ai_team_members_portrait" ADD VALUE 'seo-contenu';
  ALTER TYPE "public"."enum_ai_team_audits_kind" ADD VALUE 'contenu';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ai_team_members" ALTER COLUMN "portrait" SET DATA TYPE text;
  DROP TYPE "public"."enum_ai_team_members_portrait";
  CREATE TYPE "public"."enum_ai_team_members_portrait" AS ENUM('chef-sea', 'stratege', 'redacteur', 'directeur-artistique', 'controleur', 'meta-ads', 'google-ads', 'chatgpt-ads', 'mesure', 'chef-seo', 'seo-analyste', 'seo-concurrence');
  ALTER TABLE "ai_team_members" ALTER COLUMN "portrait" SET DATA TYPE "public"."enum_ai_team_members_portrait" USING "portrait"::"public"."enum_ai_team_members_portrait";
  ALTER TABLE "ai_team_audits" ALTER COLUMN "kind" SET DATA TYPE text;
  ALTER TABLE "ai_team_audits" ALTER COLUMN "kind" SET DEFAULT 'site'::text;
  DROP TYPE "public"."enum_ai_team_audits_kind";
  CREATE TYPE "public"."enum_ai_team_audits_kind" AS ENUM('site', 'concurrence');
  ALTER TABLE "ai_team_audits" ALTER COLUMN "kind" SET DEFAULT 'site'::"public"."enum_ai_team_audits_kind";
  ALTER TABLE "ai_team_audits" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_ai_team_audits_kind" USING "kind"::"public"."enum_ai_team_audits_kind";`)
}
