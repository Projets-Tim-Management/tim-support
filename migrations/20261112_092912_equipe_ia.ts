import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Équipe IA (collection `ai-team-members`) — et RIEN d'autre.
 *
 * ⚠️ Écrite à la main à partir du fichier généré (12/11/2026) : le cliché de la
 * migration précédente ne correspondait plus au code, et `migrate:create`
 * proposait en plus de supprimer des tables bien vivantes (dont
 * `partner_clients_licence_moves`, avec ses données) et de retyper d'autres
 * colonnes. Seules les instructions qui concernent l'équipe ont été gardées.
 * Le cliché JSON joint, lui, est celui du code actuel : la prochaine migration
 * générée ne montrera que les vrais changements.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ai_team_members_engine_roles" AS ENUM('orchestrateur', 'stratege', 'redacteur', 'directeur-artistique', 'controleur', 'analyste');
  CREATE TYPE "public"."enum_ai_team_members_level" AS ENUM('chef', 'sous-agent');
  CREATE TYPE "public"."enum_ai_team_members_domain" AS ENUM('sea');
  CREATE TYPE "public"."enum_ai_team_members_portrait" AS ENUM('chef-sea', 'stratege', 'redacteur', 'directeur-artistique', 'controleur');
  CREATE TABLE "ai_team_members_engine_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_ai_team_members_engine_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE "ai_team_members" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"job_title" varchar NOT NULL,
  	"level" "enum_ai_team_members_level" NOT NULL,
  	"domain" "enum_ai_team_members_domain" NOT NULL,
  	"chief_id" integer,
  	"portrait" "enum_ai_team_members_portrait" NOT NULL,
  	"photo_id" integer,
  	"specialty" varchar NOT NULL,
  	"personality" varchar,
  	"key" varchar NOT NULL,
  	"order" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ai_team_members_id" integer;
  ALTER TABLE "ai_team_members_engine_roles" ADD CONSTRAINT "ai_team_members_engine_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ai_team_members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_team_members" ADD CONSTRAINT "ai_team_members_chief_id_ai_team_members_id_fk" FOREIGN KEY ("chief_id") REFERENCES "public"."ai_team_members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_team_members" ADD CONSTRAINT "ai_team_members_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ai_team_members_engine_roles_order_idx" ON "ai_team_members_engine_roles" USING btree ("order");
  CREATE INDEX "ai_team_members_engine_roles_parent_idx" ON "ai_team_members_engine_roles" USING btree ("parent_id");
  CREATE INDEX "ai_team_members_chief_idx" ON "ai_team_members" USING btree ("chief_id");
  CREATE INDEX "ai_team_members_photo_idx" ON "ai_team_members" USING btree ("photo_id");
  CREATE UNIQUE INDEX "ai_team_members_key_idx" ON "ai_team_members" USING btree ("key");
  CREATE INDEX "ai_team_members_updated_at_idx" ON "ai_team_members" USING btree ("updated_at");
  CREATE INDEX "ai_team_members_created_at_idx" ON "ai_team_members" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_team_members_fk" FOREIGN KEY ("ai_team_members_id") REFERENCES "public"."ai_team_members"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ai_team_members_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_team_members_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ai_team_members_fk";
  DROP INDEX "payload_locked_documents_rels_ai_team_members_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ai_team_members_id";
  DROP TABLE "ai_team_members_engine_roles" CASCADE;
  DROP TABLE "ai_team_members" CASCADE;
  DROP TYPE "public"."enum_ai_team_members_engine_roles";
  DROP TYPE "public"."enum_ai_team_members_level";
  DROP TYPE "public"."enum_ai_team_members_domain";
  DROP TYPE "public"."enum_ai_team_members_portrait";`)
}
