import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_training_settings_email_texts_key" AS ENUM('convocation', 'recap-referent', 'brief-formateur', 'rappel-veille', 'apres-formation');
  CREATE TABLE "training_days_emails_recipients" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"email" varchar NOT NULL,
  	"name" varchar,
  	"sent_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "training_days_emails" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"scheduled_at" timestamp(3) with time zone,
  	"overridden" boolean DEFAULT false,
  	"sent_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "training_settings_email_texts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" "enum_training_settings_email_texts_key" NOT NULL,
  	"subject" varchar,
  	"intro" varchar
  );
  
  ALTER TABLE "training_days_emails_recipients" ADD CONSTRAINT "training_days_emails_recipients_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."training_days_emails"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "training_days_emails" ADD CONSTRAINT "training_days_emails_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."training_days"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "training_settings_email_texts" ADD CONSTRAINT "training_settings_email_texts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."training_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "training_days_emails_recipients_order_idx" ON "training_days_emails_recipients" USING btree ("_order");
  CREATE INDEX "training_days_emails_recipients_parent_id_idx" ON "training_days_emails_recipients" USING btree ("_parent_id");
  CREATE INDEX "training_days_emails_order_idx" ON "training_days_emails" USING btree ("_order");
  CREATE INDEX "training_days_emails_parent_id_idx" ON "training_days_emails" USING btree ("_parent_id");
  CREATE INDEX "training_settings_email_texts_order_idx" ON "training_settings_email_texts" USING btree ("_order");
  CREATE INDEX "training_settings_email_texts_parent_id_idx" ON "training_settings_email_texts" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "training_days_emails_recipients" CASCADE;
  DROP TABLE "training_days_emails" CASCADE;
  DROP TABLE "training_settings_email_texts" CASCADE;
  DROP TYPE "public"."enum_training_settings_email_texts_key";`)
}
