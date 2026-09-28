import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients" ADD COLUMN "signing_started_at" timestamp(3) with time zone;
  ALTER TABLE "partner_clients" ADD COLUMN "quote_document_id" integer;
  ALTER TABLE "partner_clients" ADD COLUMN "quote_sent_at" timestamp(3) with time zone;
  ALTER TABLE "partner_clients" ADD COLUMN "quote_signed_document_id" integer;
  ALTER TABLE "partner_clients" ADD COLUMN "quote_signed_at" timestamp(3) with time zone;
  ALTER TABLE "partner_clients" ADD COLUMN "contract_to_sign_document_id" integer;
  ALTER TABLE "partner_clients" ADD COLUMN "contract_sent_at" timestamp(3) with time zone;
  ALTER TABLE "partner_clients" ADD COLUMN "siret" varchar;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_signing_started_at" timestamp(3) with time zone;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_quote_document_id" integer;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_quote_sent_at" timestamp(3) with time zone;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_quote_signed_document_id" integer;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_quote_signed_at" timestamp(3) with time zone;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_contract_to_sign_document_id" integer;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_contract_sent_at" timestamp(3) with time zone;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_siret" varchar;
  ALTER TABLE "partner_clients" ADD CONSTRAINT "partner_clients_quote_document_id_media_id_fk" FOREIGN KEY ("quote_document_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "partner_clients" ADD CONSTRAINT "partner_clients_quote_signed_document_id_media_id_fk" FOREIGN KEY ("quote_signed_document_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "partner_clients" ADD CONSTRAINT "partner_clients_contract_to_sign_document_id_media_id_fk" FOREIGN KEY ("contract_to_sign_document_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_partner_clients_v" ADD CONSTRAINT "_partner_clients_v_version_quote_document_id_media_id_fk" FOREIGN KEY ("version_quote_document_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_partner_clients_v" ADD CONSTRAINT "_partner_clients_v_version_quote_signed_document_id_media_id_fk" FOREIGN KEY ("version_quote_signed_document_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_partner_clients_v" ADD CONSTRAINT "_partner_clients_v_version_contract_to_sign_document_id_media_id_fk" FOREIGN KEY ("version_contract_to_sign_document_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "partner_clients_quote_document_idx" ON "partner_clients" USING btree ("quote_document_id");
  CREATE INDEX "partner_clients_quote_signed_document_idx" ON "partner_clients" USING btree ("quote_signed_document_id");
  CREATE INDEX "partner_clients_contract_to_sign_document_idx" ON "partner_clients" USING btree ("contract_to_sign_document_id");
  CREATE INDEX "_partner_clients_v_version_version_quote_document_idx" ON "_partner_clients_v" USING btree ("version_quote_document_id");
  CREATE INDEX "_partner_clients_v_version_version_quote_signed_document_idx" ON "_partner_clients_v" USING btree ("version_quote_signed_document_id");
  CREATE INDEX "_partner_clients_v_version_version_contract_to_sign_docu_idx" ON "_partner_clients_v" USING btree ("version_contract_to_sign_document_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients" DROP CONSTRAINT "partner_clients_quote_document_id_media_id_fk";
  
  ALTER TABLE "partner_clients" DROP CONSTRAINT "partner_clients_quote_signed_document_id_media_id_fk";
  
  ALTER TABLE "partner_clients" DROP CONSTRAINT "partner_clients_contract_to_sign_document_id_media_id_fk";
  
  ALTER TABLE "_partner_clients_v" DROP CONSTRAINT "_partner_clients_v_version_quote_document_id_media_id_fk";
  
  ALTER TABLE "_partner_clients_v" DROP CONSTRAINT "_partner_clients_v_version_quote_signed_document_id_media_id_fk";
  
  ALTER TABLE "_partner_clients_v" DROP CONSTRAINT "_partner_clients_v_version_contract_to_sign_document_id_media_id_fk";
  
  DROP INDEX "partner_clients_quote_document_idx";
  DROP INDEX "partner_clients_quote_signed_document_idx";
  DROP INDEX "partner_clients_contract_to_sign_document_idx";
  DROP INDEX "_partner_clients_v_version_version_quote_document_idx";
  DROP INDEX "_partner_clients_v_version_version_quote_signed_document_idx";
  DROP INDEX "_partner_clients_v_version_version_contract_to_sign_docu_idx";
  ALTER TABLE "partner_clients" DROP COLUMN "signing_started_at";
  ALTER TABLE "partner_clients" DROP COLUMN "quote_document_id";
  ALTER TABLE "partner_clients" DROP COLUMN "quote_sent_at";
  ALTER TABLE "partner_clients" DROP COLUMN "quote_signed_document_id";
  ALTER TABLE "partner_clients" DROP COLUMN "quote_signed_at";
  ALTER TABLE "partner_clients" DROP COLUMN "contract_to_sign_document_id";
  ALTER TABLE "partner_clients" DROP COLUMN "contract_sent_at";
  ALTER TABLE "partner_clients" DROP COLUMN "siret";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_signing_started_at";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_quote_document_id";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_quote_sent_at";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_quote_signed_document_id";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_quote_signed_at";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_contract_to_sign_document_id";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_contract_sent_at";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_siret";`)
}
