import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "dev_announce_email" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"subject" varchar DEFAULT 'Bonne nouvelle : « {{titre}} » est prête !',
  	"preheader" varchar DEFAULT '« {{titre}} » est prête — on vous la montre ?',
  	"heading" varchar DEFAULT 'Bonne nouvelle !',
  	"image_id" integer,
  	"intro" varchar DEFAULT 'Vous souhaitiez la fonctionnalité **« {{titre}} »** : bonne nouvelle, **elle est prête !** Notre équipe technique l''a réalisée et elle est disponible dès aujourd''hui dans TIM Management.',
  	"feature_lead" varchar DEFAULT 'Le détail est sur notre site support :',
  	"proposal_with_booking" varchar DEFAULT 'Pour la découvrir, on vous propose une démonstration de 20 minutes ou un simple échange téléphonique, quand ça vous arrange : réservez un créneau ci-dessous, ou répondez à cet e-mail.',
  	"proposal_without_booking" varchar DEFAULT 'Pour la découvrir, on vous propose une démonstration de 20 minutes ou un simple échange téléphonique, quand ça vous arrange : répondez simplement à cet e-mail.',
  	"cta_label" varchar DEFAULT 'Réserver une démo',
  	"signoff" varchar DEFAULT 'À très vite,
  L''équipe TIM Management',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "dev_announce_email" ADD CONSTRAINT "dev_announce_email_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "dev_announce_email_image_idx" ON "dev_announce_email" USING btree ("image_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "dev_announce_email" CASCADE;`)
}
