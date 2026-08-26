import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Historique des opportunités : notes, appels, réunions, e-mails envoyés,
 * tâches (échéance + rappel) et journal automatique.
 *
 * Purement ADDITIF : une table et un enum, aucune donnée existante touchée.
 *
 * ⚠️ `client_id` est NOT NULL avec une clé étrangère `ON DELETE SET NULL` — la
 * combinaison habituelle des collections rattachées à un client. Supprimer une
 * opportunité sans avoir vidé son historique ferait donc échouer Postgres :
 * `client-activities` est pour cette raison en tête de CLIENT_CHILDREN
 * (cascade de suppression, voir PartnerClients.ts).
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_client_activities_type" AS ENUM('note', 'appel', 'reunion', 'email', 'tache', 'systeme');
  CREATE TABLE "client_activities" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client_id" integer NOT NULL,
  	"type" "enum_client_activities_type" DEFAULT 'note' NOT NULL,
  	"occurred_at" timestamp(3) with time zone,
  	"title" varchar,
  	"content" varchar,
  	"due_date" timestamp(3) with time zone,
  	"reminder_at" timestamp(3) with time zone,
  	"high_priority" boolean,
  	"done" boolean,
  	"done_at" timestamp(3) with time zone,
  	"reminder_sent_at" timestamp(3) with time zone,
  	"recipients" varchar,
  	"author_id" integer,
  	"partner_id" integer,
  	"display_name" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "client_activities_id" integer;
  ALTER TABLE "client_activities" ADD CONSTRAINT "client_activities_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "client_activities" ADD CONSTRAINT "client_activities_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "client_activities" ADD CONSTRAINT "client_activities_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "client_activities_client_idx" ON "client_activities" USING btree ("client_id");
  CREATE INDEX "client_activities_occurred_at_idx" ON "client_activities" USING btree ("occurred_at");
  CREATE INDEX "client_activities_due_date_idx" ON "client_activities" USING btree ("due_date");
  CREATE INDEX "client_activities_reminder_at_idx" ON "client_activities" USING btree ("reminder_at");
  CREATE INDEX "client_activities_author_idx" ON "client_activities" USING btree ("author_id");
  CREATE INDEX "client_activities_partner_idx" ON "client_activities" USING btree ("partner_id");
  CREATE INDEX "client_activities_updated_at_idx" ON "client_activities" USING btree ("updated_at");
  CREATE INDEX "client_activities_created_at_idx" ON "client_activities" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_client_activities_fk" FOREIGN KEY ("client_activities_id") REFERENCES "public"."client_activities"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_client_activities_id_idx" ON "payload_locked_documents_rels" USING btree ("client_activities_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_activities" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "client_activities" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_client_activities_fk";
  
  DROP INDEX "payload_locked_documents_rels_client_activities_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "client_activities_id";
  DROP TYPE "public"."enum_client_activities_type";`)
}
