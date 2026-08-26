import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Portée d'un modèle d'e-mail, et arrivée des modèles TIM en base.
 *
 * `scope` distingue les modèles de la maison (visibles par tous, modifiables
 * par les seuls admins) de ceux d'un partenaire. `partner_id` devient donc
 * facultatif : un modèle TIM n'appartient à personne en particulier.
 *
 * Les trois modèles fournis étaient jusqu'ici ÉCRITS EN DUR dans le code. Ils
 * passent en base pour qu'un admin puisse les corriger depuis l'interface —
 * corriger un tarif ou une formulation profite alors à tout le monde d'un coup,
 * sans redéploiement.
 *
 * Les insertions sont conditionnelles (`WHERE NOT EXISTS`) : rejouer cette
 * migration sur une base qui les a déjà ne crée pas de doublon.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_email_templates_scope" AS ENUM('partenaire', 'tim');
  ALTER TABLE "email_templates" ALTER COLUMN "partner_id" DROP NOT NULL;
  ALTER TABLE "email_templates" ADD COLUMN "scope" "enum_email_templates_scope" DEFAULT 'partenaire';
  CREATE INDEX "email_templates_scope_idx" ON "email_templates" USING btree ("scope");
  INSERT INTO "email_templates" ("name", "subject", "body", "scope", "updated_at", "created_at")
    SELECT 'Récapitulatif après visio', 'Récapitulatif – Présentation du logiciel TIM Management', 'Bonjour {{prenom}},

Suite à notre visio de présentation, voici un récapitulatif des principales fonctionnalités du logiciel Tim Management.

## Fonctionnalités principales

- Gestion des heures supplémentaires
- Pointage
- Feuilles d''heures automatisées
- Planning des équipes et des chantiers
- Suivi des chantiers en temps réel
- Tableau d''avancement (prévu vs réalisé)
- Gestion des tâches
- Application mobile
- Export des données
- Validation des heures

## Tarification (HT mensuel – sans engagement)

{{tarifs}}

Mise en place & formation : **XXX € HT** (paramétrage + accompagnement à la prise en main).

## Phase de test

Nous pouvons mettre en place une **phase de test de 30 jours** afin de valider que le logiciel correspond parfaitement à vos besoins.

Le premier démarrage possible est le **{{premier_lundi}}** — les phases de test commencent toujours un lundi. Il vous suffit de me répondre par e-mail en m''indiquant la date qui vous convient.

Je reste bien entendu disponible si vous avez la moindre question.

Bien à vous,', 'tim', now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM "email_templates" WHERE "name" = 'Récapitulatif après visio' AND "scope" = 'tim');
  INSERT INTO "email_templates" ("name", "subject", "body", "scope", "updated_at", "created_at")
    SELECT 'Relance sans retour', 'Votre projet avec TIM Management', 'Bonjour {{prenom}},

Je me permets de revenir vers vous : j''ai essayé de vous joindre à plusieurs reprises au sujet de TIM Management, sans succès.

Peut-être que le moment n''est pas le bon — dites-le-moi simplement, je m''adapte.

Si le sujet reste d''actualité pour {{entreprise}}, deux options :

- vous me répondez par e-mail avec un créneau qui vous arrange ;
- ou vous me dites de vous relancer plus tard, et je note la date.

Je reste disponible pour toute question.

Bien à vous,', 'tim', now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM "email_templates" WHERE "name" = 'Relance sans retour' AND "scope" = 'tim');
  INSERT INTO "email_templates" ("name", "subject", "body", "scope", "updated_at", "created_at")
    SELECT 'Proposition de démonstration', 'Une démonstration de TIM Management pour {{entreprise}} ?', 'Bonjour {{prenom}},

Merci de l''intérêt que vous portez à TIM Management.

Le plus simple pour voir si l''outil correspond à votre organisation est une **démonstration de 30 minutes**, en visio, sur vos propres cas : pointage, planning, suivi de chantier.

Nous y voyons :

- comment vos équipes saisissent leurs heures depuis le mobile ;
- comment vous validez et exportez ces heures ;
- le suivi d''avancement de vos chantiers, prévu contre réalisé.

Dites-moi deux ou trois créneaux qui vous conviennent et je m''aligne sur le vôtre.

Bien à vous,', 'tim', now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM "email_templates" WHERE "name" = 'Proposition de démonstration' AND "scope" = 'tim');`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "email_templates_scope_idx";
  ALTER TABLE "email_templates" ALTER COLUMN "partner_id" SET NOT NULL;
  ALTER TABLE "email_templates" DROP COLUMN "scope";
  DROP TYPE "public"."enum_email_templates_scope";`)
}
