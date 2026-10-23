import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// ADDITIVE — générée par scripts/db-migrate-additive.ts (schéma d'avant fusionné : l'ancien moteur vidéo reste en base jusqu'au temps 2).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "mass_email_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject" varchar NOT NULL,
	"sent_at" timestamp(3) with time zone NOT NULL,
	"tag" varchar NOT NULL,
	"from_email" varchar,
	"with_signature" boolean DEFAULT true,
	"template_label" varchar,
	"sent_by_id" integer,
	"body" varchar,
	"closing" varchar,
	"sent_count" numeric DEFAULT 0,
	"suppressed_count" numeric DEFAULT 0,
	"failed_count" numeric DEFAULT 0,
	"recipients" jsonb,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "mass_email_campaigns_id" integer;
  ALTER TABLE "mass_email_campaigns" ADD CONSTRAINT "mass_email_campaigns_sent_by_id_users_id_fk" FOREIGN KEY ("sent_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "mass_email_campaigns_sent_at_idx" ON "mass_email_campaigns" USING btree ("sent_at");
  CREATE UNIQUE INDEX "mass_email_campaigns_tag_idx" ON "mass_email_campaigns" USING btree ("tag");
  CREATE INDEX "mass_email_campaigns_sent_by_idx" ON "mass_email_campaigns" USING btree ("sent_by_id");
  CREATE INDEX "mass_email_campaigns_updated_at_idx" ON "mass_email_campaigns" USING btree ("updated_at");
  CREATE INDEX "mass_email_campaigns_created_at_idx" ON "mass_email_campaigns" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_mass_email_campaigns_fk" FOREIGN KEY ("mass_email_campaigns_id") REFERENCES "public"."mass_email_campaigns"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_mass_email_campaigns_id_idx" ON "payload_locked_documents_rels" USING btree ("mass_email_campaigns_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "mass_email_campaigns" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "mass_email_campaigns" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_mass_email_campaigns_fk";

  DROP INDEX "payload_locked_documents_rels_mass_email_campaigns_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "mass_email_campaigns_id";`)
}
