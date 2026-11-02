import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// ADDITIVE — générée par scripts/db-migrate-additive.ts (schéma d'avant fusionné : l'ancien moteur vidéo reste en base jusqu'au temps 2).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_expense_rules_rules_kind" AS ENUM('depense', 'impot', 'ignore');
  CREATE TABLE "expense_rules_rules" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"match" varchar NOT NULL,
	"poste" varchar NOT NULL,
	"kind" "enum_expense_rules_rules_kind" DEFAULT 'depense' NOT NULL
);

  CREATE TABLE "expense_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"updated_at" timestamp(3) with time zone,
	"created_at" timestamp(3) with time zone
);

  ALTER TABLE "expense_rules_rules" ADD CONSTRAINT "expense_rules_rules_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."expense_rules"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "expense_rules_rules_order_idx" ON "expense_rules_rules" USING btree ("_order");
  CREATE INDEX "expense_rules_rules_parent_id_idx" ON "expense_rules_rules" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "expense_rules_rules" CASCADE;
  DROP TABLE "expense_rules" CASCADE;
  DROP TYPE "public"."enum_expense_rules_rules_kind";`)
}
