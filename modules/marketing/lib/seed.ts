import type { Payload } from "payload";

import {
  DEFAULT_DURATION_WEEKS,
  mergeRunSteps,
  DEFAULT_SEND_HOUR,
  PHASE_DE_TEST_EMAILS,
  PHASE_DE_TEST_KEY,
  PHASE_DE_TEST_STEPS,
} from "@/modules/marketing/lib/journey";

/**
 * Sème (et met à niveau) le parcours « Phase de test » au démarrage.
 *
 * ⚠️ Base partagée dev/prod : ce fichier ne fait que CRÉER un document absent ou
 * COMPLÉTER des champs descriptifs. Il ne supprime rien et ne touche jamais aux
 * réglages structurants (ordre des étapes, ancrages, échéances), qui restent la
 * propriété de l'équipe une fois le parcours en place.
 *
 * `seedVersion` permet d'ajouter du contenu livré avec le code (ici : les envois
 * automatiques et le détail enrichi des étapes) sur un parcours déjà créé. La
 * mise à niveau ne réécrit QUE les textes `detail` des étapes connues et
 * n'ajoute les e-mails que si la liste est vide — jamais un libellé ni une date.
 */
// v12 : « Provisionnement des accès » et « Contrat signé » passent en validation
// automatique — le geste qui les réalise (créer les identifiants, enregistrer la
// signature) se fait sur la fiche client et les coche désormais lui-même.
// v13 : l'espace client n'est plus « créé » par personne — l'adresse est posée au
// démarrage, et le Go/No-Go de TIM ouvre l'accès et envoie l'invitation.
// v14 : deux relances client (créneau à −4 j, dossier à −3 j), envoyées seulement
// si la chose n'est toujours pas faite.
// v15 : confirmation au CLIENT du créneau qu'il vient de réserver — il n'était
// prévenu que par l'invitation d'agenda du partenaire, quand elle existait.
// v16 : alerte à TIM quand un créneau est réservé (« Prise en main calée »).
// v17 : nouvelle étape « Dossier vérifié par TIM » — la valider verrouille la
// saisie du client, geste qui vivait jusque-là dans un menu de la fiche client.
// v20 : rappel « c'est demain » la veille du créneau à 17 h, au client ET aux
// personnes attendues. Premier envoi ancré sur la SESSION et non sur le début
// du test — le client choisit son heure, souvent une semaine avant.
// v19 : les étapes du modèle sont enfin RÉCONCILIÉES avec le code (ajout,
// retrait, ordre). Sans ça, les v17 et v18 ci-dessous n'avaient aucun effet sur
// un modèle déjà en place : l'étape supprimée y restait, la nouvelle n'y entrait
// pas, et les parcours en cours recopiaient fidèlement ce modèle périmé.
// v18 : suppression de « Validation du client (démarrage du test) ». Elle
// demandait au client de confirmer ce qu'il venait de déclarer lui-même dans son
// espace, et ne déclenchait rien. Une case qui bloque sans rien produire finit
// cochée machinalement — et dévalue les validations qui, elles, comptent.
const SEED_VERSION = 23;

const stepSeed = () =>
  PHASE_DE_TEST_STEPS.map((s) => ({
    key: s.key,
    label: s.label,
    actor: s.actor,
    phase: s.phase,
    detail: s.detail,
    anchor: s.anchor ?? "aucun",
    offsetDays: s.offsetDays ?? 0,
    autoValidate: Boolean(s.autoValidate),
  }));

const emailSeed = () =>
  PHASE_DE_TEST_EMAILS.map((e) => ({
    key: e.key,
    subject: e.subject,
    audience: e.audience,
    anchor: e.anchor,
    offsetDays: e.offsetDays ?? 0,
    sendHour: e.sendHour ?? DEFAULT_SEND_HOUR,
    stepKey: e.stepKey,
    trigger: e.trigger,
    detail: e.detail,
  }));

type StoredStep = { key?: string; detail?: string; [k: string]: unknown };
type StoredEmail = { key?: string; [k: string]: unknown };

/**
 * Fusion des envois, avec la même règle que pour les étapes : ce qui relève du
 * PARAMÉTRAGE (objet, destinataire, échéance) appartient à l'équipe et n'est
 * jamais réécrit ; ce qui relève de la DOCUMENTATION (`detail`, affiché en
 * infobulle) est livré avec le code et se rafraîchit à chaque version.
 *
 * `stepKey` est complété s'il est vide : sans lui, un envoi non daté (code de
 * connexion, accusé de réception) n'a aucune étape à laquelle s'accrocher et
 * disparaît de l'affichage.
 *
 * Les nouvelles clés sont ajoutées ; rien n'est jamais supprimé.
 */
const mergeEmails = (stored: StoredEmail[]): unknown[] => {
  const defaults = new Map(PHASE_DE_TEST_EMAILS.map((e) => [e.key, e]));
  const patched = stored.map((e) => {
    const def = e.key ? defaults.get(e.key) : undefined;
    return def
      ? {
          ...e,
          stepKey: e.stepKey || def.stepKey,
          detail: def.detail,
          offsetDays: def.offsetDays ?? 0,
          sendHour: def.sendHour ?? DEFAULT_SEND_HOUR,
        }
      : e;
  });
  const known = new Set(stored.map((e) => e.key).filter(Boolean));
  return [...patched, ...emailSeed().filter((e) => !known.has(e.key))];
};

export async function seedJourneys(payload: Payload): Promise<void> {
  try {
    const existing = await payload.find({
      collection: "marketing-journeys",
      where: { key: { equals: PHASE_DE_TEST_KEY } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const journey = existing.docs[0] as
      | { id: number | string; seedVersion?: number; steps?: StoredStep[]; emails?: StoredEmail[] }
      | undefined;

    // ── Premier démarrage : création complète ────────────────────────────────
    if (!journey) {
      await payload.create({
        collection: "marketing-journeys",
        overrideAccess: true,
        data: {
          title: "Phase de test",
          key: PHASE_DE_TEST_KEY,
          description:
            "De la demande du partenaire à la signature du contrat : validation, dossier de démarrage, test de N semaines (lundi → lundi), bilan, devis et contrat.",
          defaultDurationWeeks: DEFAULT_DURATION_WEEKS,
          mondayOnly: true,
          active: true,
          seedVersion: SEED_VERSION,
          steps: stepSeed(),
          emails: emailSeed(),
        },
      });
      payload.logger.info(
        `[parcours] modèle « Phase de test » créé (${PHASE_DE_TEST_STEPS.length} étapes, ${PHASE_DE_TEST_EMAILS.length} envois).`,
      );
      return;
    }

    // ── Parcours déjà en place : mise à niveau minimale ──────────────────────
    if ((journey.seedVersion ?? 0) >= SEED_VERSION) return;

    // Les ÉTAPES du modèle sont réconciliées avec le code : ajoutées, retirées,
    // remises dans l'ordre. Jusqu'ici on ne rafraîchissait que le `detail` des
    // étapes déjà présentes — une étape supprimée du code restait donc dans le
    // modèle indéfiniment, et une étape ajoutée n'y arrivait jamais. Les
    // parcours en cours, qui se réconcilient avec ce modèle, héritaient de
    // l'erreur : ils continuaient d'afficher une étape que plus rien ne pilote.
    //
    // Même fonction que pour les parcours (`mergeRunSteps`), pour la raison
    // habituelle : deux réconciliations écrites séparément divergent.
    const merged = mergeRunSteps(PHASE_DE_TEST_STEPS, journey.steps ?? []) ?? journey.steps ?? [];

    const defaults = new Map(PHASE_DE_TEST_STEPS.map((s) => [s.key, s]));
    const steps = merged.map((s) => {
      const def = s.key ? defaults.get(s.key) : undefined;
      // `state` n'existe que sur un PARCOURS : le modèle n'a pas d'avancement.
      // `mergeRunSteps` en pose un sur les étapes qu'elle ajoute ; on l'écarte.
      const rest = { ...(s as Record<string, unknown>) };
      delete rest.state;
      // `detail` et `autoValidate` sont livrés avec le code : le premier est de
      // la documentation, le second une règle de fonctionnement. Ni l'un ni
      // l'autre n'est un réglage que l'équipe personnalise dans l'admin.
      return def
        ? { ...rest, detail: def.detail, autoValidate: Boolean(def.autoValidate) }
        : rest;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emails = mergeEmails(journey.emails ?? []) as any;

    await payload.update({
      collection: "marketing-journeys",
      id: journey.id,
      overrideAccess: true,
      data: { seedVersion: SEED_VERSION, steps, emails },
    });
    payload.logger.info(
      `[parcours] modèle « Phase de test » mis à niveau (v${SEED_VERSION} : envois automatiques + détail des étapes).`,
    );
  } catch (err) {
    // Cas normal au premier boot AVANT migration : la table n'existe pas encore.
    payload.logger.error(`[parcours] seed du modèle « Phase de test » échoué : ${err}`);
  }
}
