import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_sequences_messages_style" AS ENUM('marketing', 'standard');
  ALTER TABLE "sequences_messages" ADD COLUMN "style" "enum_sequences_messages_style" DEFAULT 'marketing' NOT NULL;
  ALTER TABLE "sequences" ADD COLUMN "from_email" varchar;
  ALTER TABLE "sequences" ADD COLUMN "signature" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sequences_messages" DROP COLUMN "style";
  ALTER TABLE "sequences" DROP COLUMN "from_email";
  ALTER TABLE "sequences" DROP COLUMN "signature";
  DROP TYPE "public"."enum_sequences_messages_style";`)
}
