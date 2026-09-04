import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_partner_clients_loss_reason" ADD VALUE 'a-qualifier' BEFORE 'peu-utilise';
  ALTER TYPE "public"."enum__partner_clients_v_version_loss_reason" ADD VALUE 'a-qualifier' BEFORE 'peu-utilise';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients" ALTER COLUMN "loss_reason" SET DATA TYPE text;
  DROP TYPE "public"."enum_partner_clients_loss_reason";
  CREATE TYPE "public"."enum_partner_clients_loss_reason" AS ENUM('prix', 'fonctionnalites', 'concurrent', 'budget', 'cessation', 'autre', 'sans-reponse', 'pas-le-moment', 'besoin-different', 'solution-interne', 'test-non-concluant', 'peu-utilise', 'complexite', 'support', 'reorganisation');
  ALTER TABLE "partner_clients" ALTER COLUMN "loss_reason" SET DATA TYPE "public"."enum_partner_clients_loss_reason" USING "loss_reason"::"public"."enum_partner_clients_loss_reason";
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_loss_reason" SET DATA TYPE text;
  DROP TYPE "public"."enum__partner_clients_v_version_loss_reason";
  CREATE TYPE "public"."enum__partner_clients_v_version_loss_reason" AS ENUM('prix', 'fonctionnalites', 'concurrent', 'budget', 'cessation', 'autre', 'sans-reponse', 'pas-le-moment', 'besoin-different', 'solution-interne', 'test-non-concluant', 'peu-utilise', 'complexite', 'support', 'reorganisation');
  ALTER TABLE "_partner_clients_v" ALTER COLUMN "version_loss_reason" SET DATA TYPE "public"."enum__partner_clients_v_version_loss_reason" USING "version_loss_reason"::"public"."enum__partner_clients_v_version_loss_reason";`)
}
