import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_ai_team_members_portrait" ADD VALUE 'meta-ads';
  ALTER TYPE "public"."enum_ai_team_members_portrait" ADD VALUE 'google-ads';
  ALTER TYPE "public"."enum_ai_team_members_portrait" ADD VALUE 'chatgpt-ads';
  ALTER TYPE "public"."enum_ai_team_members_portrait" ADD VALUE 'mesure';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ai_team_members" ALTER COLUMN "portrait" SET DATA TYPE text;
  DROP TYPE "public"."enum_ai_team_members_portrait";
  CREATE TYPE "public"."enum_ai_team_members_portrait" AS ENUM('chef-sea', 'stratege', 'redacteur', 'directeur-artistique', 'controleur');
  ALTER TABLE "ai_team_members" ALTER COLUMN "portrait" SET DATA TYPE "public"."enum_ai_team_members_portrait" USING "portrait"::"public"."enum_ai_team_members_portrait";`)
}
