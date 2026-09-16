import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "support_connections_entries" ADD COLUMN "spend_month" varchar;
  ALTER TABLE "support_connections_entries" ADD COLUMN "spend_month_eur" numeric;
  ALTER TABLE "support_connections_entries" ADD COLUMN "spend_month_questions" numeric;
  -- Le compteur du mois démarre avec ce que le jour a déjà compté : rien ne se perd.
  UPDATE "support_connections_entries"
     SET "spend_month" = left("spend_day", 7),
         "spend_month_eur" = "spend_eur",
         "spend_month_questions" = "spend_questions"
   WHERE "key" = 'anthropic' AND "spend_day" IS NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "support_connections_entries" DROP COLUMN "spend_month";
  ALTER TABLE "support_connections_entries" DROP COLUMN "spend_month_eur";
  ALTER TABLE "support_connections_entries" DROP COLUMN "spend_month_questions";`)
}
