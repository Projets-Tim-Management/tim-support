import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_partner_clients_billing_period" AS ENUM('mensuelle', 'trimestrielle', 'semestrielle', 'annuelle');
  CREATE TYPE "public"."enum__partner_clients_v_version_billing_period" AS ENUM('mensuelle', 'trimestrielle', 'semestrielle', 'annuelle');
  ALTER TABLE "partner_clients" ADD COLUMN "billing_period" "enum_partner_clients_billing_period" DEFAULT 'mensuelle';
  ALTER TABLE "_partner_clients_v" ADD COLUMN "version_billing_period" "enum__partner_clients_v_version_billing_period" DEFAULT 'mensuelle';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients" DROP COLUMN "billing_period";
  ALTER TABLE "_partner_clients_v" DROP COLUMN "version_billing_period";
  DROP TYPE "public"."enum_partner_clients_billing_period";
  DROP TYPE "public"."enum__partner_clients_v_version_billing_period";`)
}
