import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sequences" ADD COLUMN "stop_on_reply" boolean DEFAULT true;
  ALTER TABLE "sequences" ADD COLUMN "next_sequence_id" integer;
  ALTER TABLE "sequences" ADD CONSTRAINT "sequences_next_sequence_id_sequences_id_fk" FOREIGN KEY ("next_sequence_id") REFERENCES "public"."sequences"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "sequences_next_sequence_idx" ON "sequences" USING btree ("next_sequence_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sequences" DROP CONSTRAINT "sequences_next_sequence_id_sequences_id_fk";
  
  DROP INDEX "sequences_next_sequence_idx";
  ALTER TABLE "sequences" DROP COLUMN "stop_on_reply";
  ALTER TABLE "sequences" DROP COLUMN "next_sequence_id";`)
}
