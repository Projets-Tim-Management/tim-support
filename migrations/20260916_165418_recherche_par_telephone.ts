import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients" ADD COLUMN "phone_digits" varchar;
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_phone_digits" varchar;
  ALTER TABLE "client_contacts" ADD COLUMN "phone_digits" varchar;
  CREATE INDEX "partner_clients_phone_digits_idx" ON "partner_clients" USING btree ("phone_digits");
  CREATE INDEX "_partner_clients_v_version_version_phone_digits_idx" ON "_partner_clients_v" USING btree ("version_phone_digits");
  CREATE INDEX "client_contacts_phone_digits_idx" ON "client_contacts" USING btree ("phone_digits");
  -- Reprise de l'existant, même règle que core/lib/phone.ts : les chiffres,
  -- et « +33 » / « 0033 » devant redevient « 0 ».
  UPDATE "partner_clients" SET "phone_digits" = NULLIF(CASE
    WHEN "phone" ~ '^\s*(\+|00)' THEN regexp_replace(regexp_replace("phone", '\D', '', 'g'), '^(00)?33', '0')
    ELSE regexp_replace("phone", '\D', '', 'g') END, '') WHERE "phone" IS NOT NULL;
  UPDATE "_partner_clients_v" SET "version_phone_digits" = NULLIF(CASE
    WHEN "version_phone" ~ '^\s*(\+|00)' THEN regexp_replace(regexp_replace("version_phone", '\D', '', 'g'), '^(00)?33', '0')
    ELSE regexp_replace("version_phone", '\D', '', 'g') END, '') WHERE "version_phone" IS NOT NULL;
  UPDATE "client_contacts" SET "phone_digits" = NULLIF(CASE
    WHEN "phone" ~ '^\s*(\+|00)' THEN regexp_replace(regexp_replace("phone", '\D', '', 'g'), '^(00)?33', '0')
    ELSE regexp_replace("phone", '\D', '', 'g') END, '') WHERE "phone" IS NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "partner_clients_phone_digits_idx";
  DROP INDEX "_partner_clients_v_version_version_phone_digits_idx";
  DROP INDEX "client_contacts_phone_digits_idx";
  ALTER TABLE "partner_clients" DROP COLUMN "phone_digits";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_phone_digits";
  ALTER TABLE "client_contacts" DROP COLUMN "phone_digits";`)
}
