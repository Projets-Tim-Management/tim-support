import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_client_contacts_licence_profile" AS ENUM('admin', 'conducteur', 'chefChantier', 'chefEquipe', 'compagnon');
  ALTER TABLE "client_contacts" ADD COLUMN "licence_profile" "enum_client_contacts_licence_profile";
  ALTER TABLE "client_credentials" ADD COLUMN "contact_id" integer;
  ALTER TABLE "client_credentials" ADD CONSTRAINT "client_credentials_contact_id_client_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."client_contacts"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "client_credentials_contact_idx" ON "client_credentials" USING btree ("contact_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_credentials" DROP CONSTRAINT "client_credentials_contact_id_client_contacts_id_fk";
  
  DROP INDEX "client_credentials_contact_idx";
  ALTER TABLE "client_contacts" DROP COLUMN "licence_profile";
  ALTER TABLE "client_credentials" DROP COLUMN "contact_id";
  DROP TYPE "public"."enum_client_contacts_licence_profile";`)
}
