import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_video_views_etape" AS ENUM('lecture', '25', '50', '75', 'fin');
  CREATE TABLE "video_views" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"video_id" varchar NOT NULL,
  	"page" varchar NOT NULL,
  	"etape" "enum_video_views_etape" NOT NULL,
  	"jour" varchar NOT NULL,
  	"nombre" numeric DEFAULT 0 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "video_views_id" integer;
  CREATE INDEX "video_views_video_id_idx" ON "video_views" USING btree ("video_id");
  CREATE INDEX "video_views_jour_idx" ON "video_views" USING btree ("jour");
  CREATE INDEX "video_views_updated_at_idx" ON "video_views" USING btree ("updated_at");
  CREATE INDEX "video_views_created_at_idx" ON "video_views" USING btree ("created_at");
  CREATE UNIQUE INDEX "videoId_page_etape_jour_idx" ON "video_views" USING btree ("video_id","page","etape","jour");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_video_views_fk" FOREIGN KEY ("video_views_id") REFERENCES "public"."video_views"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_video_views_id_idx" ON "payload_locked_documents_rels" USING btree ("video_views_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "video_views" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "video_views" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_video_views_fk";
  
  DROP INDEX "payload_locked_documents_rels_video_views_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "video_views_id";
  DROP TYPE "public"."enum_video_views_etape";`)
}
