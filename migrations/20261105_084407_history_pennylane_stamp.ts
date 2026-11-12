import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// ADDITIVE — générée par scripts/db-migrate-additive.ts (schéma d'avant fusionné : l'ancien moteur vidéo reste en base jusqu'au temps 2).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients_history" ADD COLUMN "pennylane" jsonb;
  ALTER TABLE "_partner_clients_v_version_history" ADD COLUMN "pennylane" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_clients_history" DROP COLUMN "pennylane";
  ALTER TABLE "_partner_clients_v_version_history" DROP COLUMN "pennylane";`)
}
