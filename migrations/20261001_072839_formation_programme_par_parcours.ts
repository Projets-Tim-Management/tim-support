import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "training_settings_programmes_modules" ALTER COLUMN "minutes" SET DEFAULT 10;
  ALTER TABLE "training_settings_programmes_modules" ADD COLUMN "parcours_id" integer;
  ALTER TABLE "training_settings_programmes_modules" ADD CONSTRAINT "training_settings_programmes_modules_parcours_id_parcours_id_fk" FOREIGN KEY ("parcours_id") REFERENCES "public"."parcours"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "training_settings_programmes_modules_parcours_idx" ON "training_settings_programmes_modules" USING btree ("parcours_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "training_settings_programmes_modules" DROP CONSTRAINT "training_settings_programmes_modules_parcours_id_parcours_id_fk";
  
  DROP INDEX "training_settings_programmes_modules_parcours_idx";
  ALTER TABLE "training_settings_programmes_modules" ALTER COLUMN "minutes" SET DEFAULT 15;
  ALTER TABLE "training_settings_programmes_modules" DROP COLUMN "parcours_id";`)
}
