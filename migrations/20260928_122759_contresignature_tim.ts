import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_contracts" ADD COLUMN "client_signed_hash" varchar;
  ALTER TABLE "client_contracts" ADD COLUMN "countersigner_first_name" varchar;
  ALTER TABLE "client_contracts" ADD COLUMN "countersigner_last_name" varchar;
  ALTER TABLE "client_contracts" ADD COLUMN "countersigner_role" varchar;
  ALTER TABLE "client_contracts" ADD COLUMN "countersigner_email" varchar;
  ALTER TABLE "client_contracts" ADD COLUMN "countersigned_by_id" integer;
  ALTER TABLE "client_contracts" ADD COLUMN "countersign_consent" varchar;
  ALTER TABLE "client_contracts" ADD COLUMN "countersign_code_sent_at" timestamp(3) with time zone;
  ALTER TABLE "client_contracts" ADD COLUMN "countersigned_at" timestamp(3) with time zone;
  ALTER TABLE "client_contracts" ADD COLUMN "countersign_ip" varchar;
  ALTER TABLE "client_contracts" ADD COLUMN "countersign_user_agent" varchar;
  ALTER TABLE "client_contracts" ADD COLUMN "countersigned_document_id" integer;
  ALTER TABLE "client_contracts" ADD COLUMN "countersigned_hash" varchar;
  ALTER TABLE "client_contracts" ADD COLUMN "countersign_code_hash" varchar;
  ALTER TABLE "client_contracts" ADD COLUMN "countersign_code_expires_at" timestamp(3) with time zone;
  ALTER TABLE "client_contracts" ADD COLUMN "countersign_attempts" numeric;
  ALTER TABLE "client_contracts" ADD CONSTRAINT "client_contracts_countersigned_by_id_users_id_fk" FOREIGN KEY ("countersigned_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "client_contracts" ADD CONSTRAINT "client_contracts_countersigned_document_id_media_id_fk" FOREIGN KEY ("countersigned_document_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "client_contracts_countersigned_by_idx" ON "client_contracts" USING btree ("countersigned_by_id");
  CREATE INDEX "client_contracts_countersigned_document_idx" ON "client_contracts" USING btree ("countersigned_document_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "client_contracts" DROP CONSTRAINT "client_contracts_countersigned_by_id_users_id_fk";
  
  ALTER TABLE "client_contracts" DROP CONSTRAINT "client_contracts_countersigned_document_id_media_id_fk";
  
  DROP INDEX "client_contracts_countersigned_by_idx";
  DROP INDEX "client_contracts_countersigned_document_idx";
  ALTER TABLE "client_contracts" DROP COLUMN "client_signed_hash";
  ALTER TABLE "client_contracts" DROP COLUMN "countersigner_first_name";
  ALTER TABLE "client_contracts" DROP COLUMN "countersigner_last_name";
  ALTER TABLE "client_contracts" DROP COLUMN "countersigner_role";
  ALTER TABLE "client_contracts" DROP COLUMN "countersigner_email";
  ALTER TABLE "client_contracts" DROP COLUMN "countersigned_by_id";
  ALTER TABLE "client_contracts" DROP COLUMN "countersign_consent";
  ALTER TABLE "client_contracts" DROP COLUMN "countersign_code_sent_at";
  ALTER TABLE "client_contracts" DROP COLUMN "countersigned_at";
  ALTER TABLE "client_contracts" DROP COLUMN "countersign_ip";
  ALTER TABLE "client_contracts" DROP COLUMN "countersign_user_agent";
  ALTER TABLE "client_contracts" DROP COLUMN "countersigned_document_id";
  ALTER TABLE "client_contracts" DROP COLUMN "countersigned_hash";
  ALTER TABLE "client_contracts" DROP COLUMN "countersign_code_hash";
  ALTER TABLE "client_contracts" DROP COLUMN "countersign_code_expires_at";
  ALTER TABLE "client_contracts" DROP COLUMN "countersign_attempts";`)
}
