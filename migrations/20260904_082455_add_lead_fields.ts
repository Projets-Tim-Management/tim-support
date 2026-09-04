import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_partner_clients_source" ADD VALUE 'site-vitrine-seo' BEFORE 'site-vitrine';
  ALTER TYPE "public"."enum_partner_clients_source" ADD VALUE 'google-ads-sea' BEFORE 'site-vitrine';
  ALTER TYPE "public"."enum__partner_clients_v_version_source" ADD VALUE 'site-vitrine-seo' BEFORE 'site-vitrine';
  ALTER TYPE "public"."enum__partner_clients_v_version_source" ADD VALUE 'google-ads-sea' BEFORE 'site-vitrine';
  ALTER TABLE "partner_clients" ADD COLUMN "collaborateurs" varchar;
  ALTER TABLE "partner_clients" ADD COLUMN "form_submission_id" integer;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_collaborateurs" varchar;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_form_submission_id" integer;
  ALTER TABLE "partner_clients" ADD CONSTRAINT "partner_clients_form_submission_id_form_submissions_id_fk" FOREIGN KEY ("form_submission_id") REFERENCES "public"."form_submissions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_partner_clients_v" ADD CONSTRAINT "_partner_clients_v_version_form_submission_id_form_submissions_id_fk" FOREIGN KEY ("version_form_submission_id") REFERENCES "public"."form_submissions"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "partner_clients_collaborateurs_idx" ON "partner_clients" USING btree ("collaborateurs");
  CREATE UNIQUE INDEX "partner_clients_form_submission_idx" ON "partner_clients" USING btree ("form_submission_id");
  CREATE INDEX "_partner_clients_v_version_version_collaborateurs_idx" ON "_partner_clients_v" USING btree ("version_collaborateurs");
  CREATE INDEX "_partner_clients_v_version_version_form_submission_idx" ON "_partner_clients_v" USING btree ("version_form_submission_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients" DROP CONSTRAINT "partner_clients_form_submission_id_form_submissions_id_fk";
  
  ALTER TABLE "_partner_clients_v" DROP CONSTRAINT "_partner_clients_v_version_form_submission_id_form_submissions_id_fk";
  
  ALTER TABLE "partner_clients" ALTER COLUMN "source" SET DATA TYPE text;
  ALTER TABLE "partner_clients" ALTER COLUMN "source" SET DEFAULT 'manuelle'::text;
  DROP TYPE "public"."enum_partner_clients_source";
  CREATE TYPE "public"."enum_partner_clients_source" AS ENUM('manuelle', 'site-vitrine');
  ALTER TABLE "partner_clients" ALTER COLUMN "source" SET DEFAULT 'manuelle'::"public"."enum_partner_clients_source";
  ALTER TABLE "partner_clients" ALTER COLUMN "source" SET DATA TYPE "public"."enum_partner_clients_source" USING "source"::"public"."enum_partner_clients_source";
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_source" SET DATA TYPE text;
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_source" SET DEFAULT 'manuelle'::text;
  DROP TYPE "public"."enum__partner_clients_v_version_source";
  CREATE TYPE "public"."enum__partner_clients_v_version_source" AS ENUM('manuelle', 'site-vitrine');
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_source" SET DEFAULT 'manuelle'::"public"."enum__partner_clients_v_version_source";
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_source" SET DATA TYPE "public"."enum__partner_clients_v_version_source" USING "version_source"::"public"."enum__partner_clients_v_version_source";
  DROP INDEX "partner_clients_collaborateurs_idx";
  DROP INDEX "partner_clients_form_submission_idx";
  DROP INDEX "_partner_clients_v_version_version_collaborateurs_idx";
  DROP INDEX "_partner_clients_v_version_version_form_submission_idx";
  ALTER TABLE "partner_clients" DROP COLUMN "collaborateurs";
  ALTER TABLE "partner_clients" DROP COLUMN "form_submission_id";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_collaborateurs";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_form_submission_id";`)
}
