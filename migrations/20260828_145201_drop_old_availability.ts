import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Disponibilités : d'une plage commune à des plages par jour.
 *
 * L'ancien modèle disait « ces jours-là, de 9 h à 18 h ». Il ne savait pas dire
 * « lundi matin seulement », qui est pourtant la situation ordinaire de
 * quelqu'un qui prend des rendez-vous entre deux chantiers.
 *
 * On CONVERTIT avant de supprimer : chaque jour coché devient une plage reprenant
 * les horaires globaux du partenaire. Personne ne se réveille avec un agenda
 * vide, ni avec des disponibilités qu'il n'a pas choisies.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  UPDATE "partners" p SET "scheduling_hours" = (
    SELECT jsonb_object_agg(
      w."value"::text,
      jsonb_build_array(jsonb_build_object(
        'start', COALESCE(NULLIF(p."scheduling_start_time", ''), '09:00'),
        'end',   COALESCE(NULLIF(p."scheduling_end_time", ''), '18:00')
      ))
    )
    FROM "partners_scheduling_weekdays" w WHERE w."parent_id" = p."id" AND w."value" IS NOT NULL
  )
  WHERE "scheduling_hours" IS NULL;

  DROP TABLE "partners_scheduling_weekdays" CASCADE;
  ALTER TABLE "partners" DROP COLUMN "scheduling_start_time";
  ALTER TABLE "partners" DROP COLUMN "scheduling_end_time";
  DROP TYPE "public"."enum_partners_scheduling_weekdays";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_partners_scheduling_weekdays" AS ENUM('1', '2', '3', '4', '5', '6', '7');
  CREATE TABLE "partners_scheduling_weekdays" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_partners_scheduling_weekdays",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "partners" ADD COLUMN "scheduling_start_time" varchar;
  ALTER TABLE "partners" ADD COLUMN "scheduling_end_time" varchar;
  ALTER TABLE "partners_scheduling_weekdays" ADD CONSTRAINT "partners_scheduling_weekdays_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "partners_scheduling_weekdays_order_idx" ON "partners_scheduling_weekdays" USING btree ("order");
  CREATE INDEX "partners_scheduling_weekdays_parent_idx" ON "partners_scheduling_weekdays" USING btree ("parent_id");`)
}
