import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_sequence_runs_messages_skipped" AS ENUM('desinscrit', 'echec');
  CREATE TYPE "public"."enum_sequence_runs_status" AS ENUM('en-cours', 'terminee', 'arretee');
  CREATE TYPE "public"."enum_sequence_runs_stop_reason" AS ENUM('reponse', 'manuelle', 'desinscription', 'statut-change');
  CREATE TYPE "public"."enum_sequences_loss_reasons" AS ENUM('prix', 'fonctionnalites', 'concurrent', 'budget', 'cessation', 'autre', 'sans-reponse', 'pas-le-moment', 'besoin-different', 'solution-interne', 'test-non-concluant', 'a-qualifier', 'peu-utilise', 'complexite', 'support', 'reorganisation');
  CREATE TYPE "public"."enum_sequences_messages_delay_unit" AS ENUM('jours', 'semaines', 'mois');
  CREATE TYPE "public"."enum_sequences_messages_besoin" AS ENUM('planning', 'pointage', 'vehicules', 'chantiers', 'documents-rh');
  CREATE TABLE "sequence_runs_messages" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"scheduled_at" timestamp(3) with time zone NOT NULL,
  	"sent_at" timestamp(3) with time zone,
  	"skipped" "enum_sequence_runs_messages_skipped"
  );
  
  CREATE TABLE "sequence_runs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"summary" varchar,
  	"sequence_label" varchar,
  	"client_id" integer NOT NULL,
  	"email" varchar NOT NULL,
  	"sequence" varchar NOT NULL,
  	"status" "enum_sequence_runs_status" DEFAULT 'en-cours' NOT NULL,
  	"stop_reason" "enum_sequence_runs_stop_reason",
  	"stop_note" varchar,
  	"started_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "sequences_loss_reasons" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_sequences_loss_reasons",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "sequences_messages_paragraphs" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "sequences_messages" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"delay_value" numeric DEFAULT 2 NOT NULL,
  	"delay_unit" "enum_sequences_messages_delay_unit" DEFAULT 'mois' NOT NULL,
  	"besoin" "enum_sequences_messages_besoin",
  	"title" varchar NOT NULL,
  	"subject" varchar NOT NULL,
  	"image_id" integer,
  	"payoff" varchar NOT NULL,
  	"cta" varchar NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "sequences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"key" varchar NOT NULL,
  	"description" varchar,
  	"active" boolean DEFAULT true,
  	"seed_version" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "sequence_runs_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "sequences_id" integer;
  ALTER TABLE "sequence_runs_messages" ADD CONSTRAINT "sequence_runs_messages_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sequence_runs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sequence_runs" ADD CONSTRAINT "sequence_runs_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sequences_loss_reasons" ADD CONSTRAINT "sequences_loss_reasons_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sequences_messages_paragraphs" ADD CONSTRAINT "sequences_messages_paragraphs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sequences_messages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sequences_messages" ADD CONSTRAINT "sequences_messages_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sequences_messages" ADD CONSTRAINT "sequences_messages_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "sequence_runs_messages_order_idx" ON "sequence_runs_messages" USING btree ("_order");
  CREATE INDEX "sequence_runs_messages_parent_id_idx" ON "sequence_runs_messages" USING btree ("_parent_id");
  CREATE INDEX "sequence_runs_client_idx" ON "sequence_runs" USING btree ("client_id");
  CREATE INDEX "sequence_runs_email_idx" ON "sequence_runs" USING btree ("email");
  CREATE INDEX "sequence_runs_sequence_idx" ON "sequence_runs" USING btree ("sequence");
  CREATE INDEX "sequence_runs_status_idx" ON "sequence_runs" USING btree ("status");
  CREATE INDEX "sequence_runs_updated_at_idx" ON "sequence_runs" USING btree ("updated_at");
  CREATE INDEX "sequence_runs_created_at_idx" ON "sequence_runs" USING btree ("created_at");
  CREATE INDEX "sequences_loss_reasons_order_idx" ON "sequences_loss_reasons" USING btree ("order");
  CREATE INDEX "sequences_loss_reasons_parent_idx" ON "sequences_loss_reasons" USING btree ("parent_id");
  CREATE INDEX "sequences_messages_paragraphs_order_idx" ON "sequences_messages_paragraphs" USING btree ("_order");
  CREATE INDEX "sequences_messages_paragraphs_parent_id_idx" ON "sequences_messages_paragraphs" USING btree ("_parent_id");
  CREATE INDEX "sequences_messages_order_idx" ON "sequences_messages" USING btree ("_order");
  CREATE INDEX "sequences_messages_parent_id_idx" ON "sequences_messages" USING btree ("_parent_id");
  CREATE INDEX "sequences_messages_image_idx" ON "sequences_messages" USING btree ("image_id");
  CREATE UNIQUE INDEX "sequences_key_idx" ON "sequences" USING btree ("key");
  CREATE INDEX "sequences_updated_at_idx" ON "sequences" USING btree ("updated_at");
  CREATE INDEX "sequences_created_at_idx" ON "sequences" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sequence_runs_fk" FOREIGN KEY ("sequence_runs_id") REFERENCES "public"."sequence_runs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sequences_fk" FOREIGN KEY ("sequences_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_sequence_runs_id_idx" ON "payload_locked_documents_rels" USING btree ("sequence_runs_id");
  CREATE INDEX "payload_locked_documents_rels_sequences_id_idx" ON "payload_locked_documents_rels" USING btree ("sequences_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sequence_runs_messages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "sequence_runs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "sequences_loss_reasons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "sequences_messages_paragraphs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "sequences_messages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "sequences" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "sequence_runs_messages" CASCADE;
  DROP TABLE "sequence_runs" CASCADE;
  DROP TABLE "sequences_loss_reasons" CASCADE;
  DROP TABLE "sequences_messages_paragraphs" CASCADE;
  DROP TABLE "sequences_messages" CASCADE;
  DROP TABLE "sequences" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_sequence_runs_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_sequences_fk";
  
  DROP INDEX "payload_locked_documents_rels_sequence_runs_id_idx";
  DROP INDEX "payload_locked_documents_rels_sequences_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "sequence_runs_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "sequences_id";
  DROP TYPE "public"."enum_sequence_runs_messages_skipped";
  DROP TYPE "public"."enum_sequence_runs_status";
  DROP TYPE "public"."enum_sequence_runs_stop_reason";
  DROP TYPE "public"."enum_sequences_loss_reasons";
  DROP TYPE "public"."enum_sequences_messages_delay_unit";
  DROP TYPE "public"."enum_sequences_messages_besoin";`)
}
