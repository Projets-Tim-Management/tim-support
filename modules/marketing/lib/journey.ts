/**
 * Parcours marketing — SOURCE DE VÉRITÉ UNIQUE.
 *
 * Un « parcours » est un enchaînement d'étapes OBLIGATOIRES et ORDONNÉES que
 * suit un client apporté. Le premier (et seul pour l'instant) est la
 * « Phase de test » : de la demande du partenaire jusqu'à la signature du
 * contrat.
 *
 * Deux collections en découlent :
 *  - `marketing-journeys` : le MODÈLE (les étapes, modifiables sans déploiement) ;
 *  - `journey-runs`       : l'INSTANCE pour un client (où en est-on, quand).
 *
 * ⚠️ Les `key` d'étape sont des identifiants STABLES : le code s'y réfère
 * (déclenchement du statut client, alertes, e-mails). On peut renommer un
 * `label` librement, jamais une `key`.
 */

import {
  utcToZonedParts,
  zonedTimeToUtc,
} from "@/modules/marketing/lib/scheduling";

// ─── Phases (les 3 blocs du schéma) ──────────────────────────────────────────
export const JOURNEY_PHASES = [
  { value: "avant-test", label: "Avant le test" },
  { value: "pendant-test", label: "Pendant le test" },
  { value: "sortie-test", label: "Sortie de test" },
] as const;

export type JourneyPhase = (typeof JOURNEY_PHASES)[number]["value"];

// ─── Acteurs ─────────────────────────────────────────────────────────────────
export const JOURNEY_ACTORS = [
  { value: "partenaire", label: "Partenaire" },
  { value: "admin", label: "TIM (admin)" },
  { value: "client", label: "Client" },
] as const;

export type JourneyActor = (typeof JOURNEY_ACTORS)[number]["value"];

/**
 * Ancrage d'une étape dans le calendrier du test. `debut`/`fin` = décalage en
 * jours par rapport au démarrage / à la fin ; `milieu` = à mi-parcours (le
 * décalage est alors ignoré) ; `aucun` = pas d'échéance.
 *
 * Sert à calculer une date d'échéance par étape — les alertes et la séquence
 * d'e-mails (phase 4) s'appuieront dessus.
 */
export const JOURNEY_ANCHORS = [
  { value: "aucun", label: "Aucune échéance" },
  { value: "debut", label: "Par rapport au démarrage" },
  { value: "milieu", label: "À mi-parcours" },
  { value: "fin", label: "Par rapport à la fin" },
] as const;

export type JourneyAnchor = (typeof JOURNEY_ANCHORS)[number]["value"];

// ─── Statut d'un parcours en cours ───────────────────────────────────────────
export type RunStatus = {
  value: string;
  label: string;
  /** Couleur du texte / de la pastille (tokens de styles/_tokens.scss). */
  color: string;
  bg: string;
};

export const RUN_STATUSES: RunStatus[] = [
  {
    value: "preparation",
    label: "En préparation",
    color: "var(--tim-blue)",
    bg: "var(--tim-blue-bg)",
  },
  {
    value: "en-cours",
    label: "Test en cours",
    color: "var(--tim-purple)",
    bg: "var(--tim-purple-bg)",
  },
  {
    value: "gagne",
    label: "Gagné",
    color: "var(--tim-green)",
    bg: "var(--tim-green-bg)",
  },
  {
    value: "perdu",
    label: "Perdu",
    color: "var(--tim-red)",
    bg: "var(--tim-red-bg)",
  },
  {
    value: "annule",
    label: "Annulé",
    color: "var(--tim-gray)",
    bg: "var(--tim-gray-bg)",
  },
];

export const RUN_STATUS_OPTIONS = RUN_STATUSES.map(({ label, value }) => ({
  label,
  value,
}));

export const runStatusMeta = (value?: string | null): RunStatus | undefined =>
  RUN_STATUSES.find((s) => s.value === value);

/** Un parcours clos ne réclame plus rien (pas d'alerte, pas d'e-mail). */
export const isRunClosed = (status?: string | null): boolean =>
  status === "gagne" || status === "perdu" || status === "annule";

// ─── État d'une étape dans un parcours en cours ──────────────────────────────
export const STEP_STATES = [
  { value: "a-faire", label: "À faire" },
  { value: "auto", label: "Validation automatique en attente" },
  { value: "fait", label: "Fait" },
  { value: "bloque", label: "Bloqué" },
] as const;

export type StepState = (typeof STEP_STATES)[number]["value"];

/**
 * Validation automatique — délai de grâce par défaut, en heures.
 *
 * Quand le système CONSTATE qu'une étape est faite (le parcours a été lancé, le
 * compte espace client existe, le créneau est réservé…), il ne la coche pas
 * immédiatement : il la met en attente pendant ce délai. Pendant la fenêtre, on
 * peut encore corriger ou annuler ; passé le délai, elle est acquise.
 *
 * Sans le délai, une fausse manœuvre serait actée dans la seconde. Sans
 * l'automatisme, il faudrait cocher à la main ce que le logiciel sait déjà.
 */
export const AUTO_VALIDATE_DELAY_HOURS = 2;

/**
 * Étapes qui ne se valident JAMAIS toutes seules, quoi que dise le modèle.
 *
 * Le Go/No-Go engage TIM vis-à-vis d'un client : il lui faut une décision, pas
 * une expiration de délai. Codé ici plutôt que laissé au paramétrage — une case
 * décochée par erreur dans l'admin ne doit pas pouvoir ouvrir cette porte.
 */
export const NEVER_AUTO_VALIDATE = new Set(["validation-admin"]);

/**
 * L'étape est-elle acquise à cet instant ?
 *
 * Une étape « auto » dont le délai est écoulé compte comme faite SANS avoir été
 * réenregistrée : l'échéance seule suffit. C'est ce qui évite d'avoir à faire
 * tourner un travail de fond juste pour basculer des états.
 */
export const isStepDone = (
  step: { key?: string | null; state?: string | null; autoAt?: string | null },
  nowMs: number = Date.now(),
): boolean => {
  if (step.state === "fait") return true;
  if (step.state !== "auto" || !step.autoAt) return false;
  // Filet posé À LA LECTURE, et pas seulement à l'écriture : un parcours armé
  // AVANT cette règle ne doit pas s'acquérir en attendant sa prochaine
  // sauvegarde. La règle s'applique donc sans qu'aucune donnée ne bouge.
  if (step.key && NEVER_AUTO_VALIDATE.has(step.key)) return false;
  const at = Date.parse(step.autoAt);
  return !Number.isNaN(at) && at <= nowMs;
};

/** Étape en attente de validation automatique (délai non encore écoulé). */
export const isStepPending = (
  step: { key?: string | null; state?: string | null; autoAt?: string | null },
  nowMs: number = Date.now(),
): boolean =>
  step.state === "auto" &&
  !(step.key && NEVER_AUTO_VALIDATE.has(step.key)) &&
  !isStepDone(step, nowMs);

// ─── Session de prise en main ────────────────────────────────────────────────
/**
 * La session de 45 min se tient en visio OU sur site, au choix du partenaire et
 * selon son client. Le mode n'est pas cosmétique : il décide de ce qui part dans
 * l'invitation (un lien ou une adresse) et, plus tard, de ce qu'on crée dans
 * l'agenda (une conférence ou un lieu).
 */
export const SESSION_MODES = [
  { label: "Visio", value: "visio" },
  { label: "Sur place", value: "sur-place" },
] as const;

export type SessionMode = (typeof SESSION_MODES)[number]["value"];

/**
 * La session de prise en main doit se tenir AVANT le démarrage du test.
 *
 * C'est une pré-formation : elle sert à ce que les équipes sachent se servir de
 * l'outil dès le premier jour. Calée pendant le test, elle arriverait après les
 * premiers pointages — donc après le moment où elle aurait servi.
 *
 * Le jour même du démarrage est refusé : la formation doit précéder l'usage,
 * pas l'accompagner.
 */
export const isSessionBeforeStart = (
  sessionAt?: string | null,
  startDate?: string | null,
): boolean => {
  if (!sessionAt || !startDate) return true; // rien à comparer
  const at = Date.parse(sessionAt);
  const start = Date.parse(startDate);
  if (Number.isNaN(at) || Number.isNaN(start)) return true;
  return at < start;
};

/**
 * Phrase de modalité, utilisée telle quelle dans l'invitation et à l'écran.
 * Une seule formulation partagée : l'e-mail ne peut pas annoncer une visio quand
 * la fiche dit « sur place ».
 */
export const sessionSummary = (run?: {
  sessionMode?: string | null;
  sessionLocation?: string | null;
  sessionLink?: string | null;
}): string => {
  if (run?.sessionMode === "sur-place") {
    return run.sessionLocation?.trim()
      ? `sur site — ${run.sessionLocation.trim()}`
      : "sur site";
  }
  return run?.sessionLink?.trim() ? "en visio (lien fourni)" : "en visio";
};

// ─── Décision de fin de test ─────────────────────────────────────────────────
export const RUN_DECISIONS = [
  { value: "contrat", label: "Go — passage au contrat" },
  { value: "prolongation", label: "Prolongation du test" },
  { value: "abandon", label: "Abandon" },
] as const;

// ─── Le modèle « Phase de test » ─────────────────────────────────────────────
export type JourneyStepDef = {
  key: string;
  label: string;
  actor: JourneyActor;
  phase: JourneyPhase;
  detail?: string;
  anchor?: JourneyAnchor;
  /** Décalage en jours (négatif = avant l'ancrage). Ignoré si anchor = milieu/aucun. */
  offsetDays?: number;
  /**
   * L'étape se valide seule quand le système constate le fait correspondant
   * (voir SYSTEM_STEPS, qui prime sur ce drapeau). Les étapes purement humaines
   * restent manuelles : les cocher d'office inventerait des faits dont
   * dépendent ensuite les relances.
   */
  autoValidate?: boolean;
};

/** Étapes que seul un admin TIM peut valider (celles dont il est l'acteur). */
export const isAdminStep = (step: { actor?: string | null }): boolean =>
  step.actor === "admin";

/**
 * Étapes que le SYSTÈME constate — donc que PERSONNE ne coche à la main.
 *
 * Une case à cocher n'a de sens que si le clic EST le geste attendu. Pour ces
 * étapes-là, le geste se fait ailleurs (ouvrir l'accès, générer les identifiants,
 * enregistrer la signature) et c'est lui qui coche l'étape. Proposer un bouton
 * en plus, c'est proposer de déclarer faite une chose qu'on n'a pas faite : le
 * parcours affiche alors une étape verte, et le client n'a rien reçu.
 *
 * Trois informations par étape :
 *  - `trigger` : le fait qui la coche, en une phrase ;
 *  - `action`  : où se fait ce geste quand il est de NOTRE ressort — sans ce
 *                renvoi, l'écran dirait « ça se coche tout seul » sans dire ce
 *                qu'il faut faire pour que ça arrive ;
 *  - `wait`    : ce qu'on attend, quand le geste appartient au client.
 *
 * Table tenue EN CODE, comme NEVER_AUTO_VALIDATE : elle décrit ce que le
 * logiciel sait observer, ce qu'aucune case cochée dans l'admin ne change. Elle
 * vaut donc aussi pour les parcours lancés AVANT elle, dont la copie d'étapes
 * porte encore l'ancien `autoValidate`.
 */
export type SystemStepDef = {
  trigger: string;
  /** Le geste réel, quand il nous revient. `on` = la fiche qui le porte. */
  action?: { label: string; on: "client" | "run"; hint: string };
  /** Ce qu'on attend, quand le geste revient au client. */
  wait?: string;
};

export const SYSTEM_STEPS: Record<string, SystemStepDef> = {
  demande: {
    trigger: "au lancement de la phase de test",
  },
  "compte-espace-client": {
    trigger: "à la validation du Go/No-Go, qui ouvre l'accès",
    action: {
      label: "Ouvrir l'accès",
      on: "client",
      hint: "Normalement rien à faire : le Go ouvre l'espace et envoie l'invitation. En secours, fiche client, onglet « Espace client » : cochez « Accès actif ».",
    },
  },
  "rdv-prise-en-main": {
    trigger: "quand le créneau est réservé",
    action: {
      label: "Saisir le créneau",
      on: "run",
      hint: "Onglet « Session de prise en main » de cette fiche, si le client vous a donné sa date de vive voix.",
    },
    wait: "Le client réserve depuis son espace",
  },
  "dossier-demarrage": {
    trigger: "quand le dossier de démarrage est transmis",
    action: {
      label: "Marquer transmis",
      on: "client",
      hint: "Fiche client, onglet « Dossier de démarrage » : passez l'état à « Transmis » si le client vous l'a fourni autrement que par son espace.",
    },
    wait: "Le client remplit son dossier depuis son espace",
  },
  provisionnement: {
    trigger: "quand les mots de passe des utilisateurs sont générés",
    action: {
      label: "Préparer les accès",
      on: "client",
      hint: "Fiche client, onglet « Préparation des accès » : recopiez le dossier dans TIM, puis générez les mots de passe des utilisateurs.",
    },
  },
  signature: {
    trigger: "quand la date de signature est enregistrée",
    action: {
      label: "Enregistrer la signature",
      on: "client",
      hint: "Fiche client, onglet « Contrat client » : date de signature et PDF signé.",
    },
    wait: "Le client signe le contrat",
  },
};

/** L'étape se coche-t-elle sur constat du système (donc jamais à la main) ? */
/**
 * Réconcilie les étapes d'un parcours EN COURS avec le modèle courant.
 *
 * Un parcours est une copie du modèle, figée à son lancement : c'est ce qui
 * permet d'ajuster une échéance pour un client sans toucher aux autres. Mais une
 * étape ajoutée au modèle aujourd'hui n'existerait alors que pour les tests
 * démarrés demain — les parcours en cours ne la verraient jamais, et l'écran
 * renverrait vers une étape introuvable.
 *
 * La liste est donc reconstruite dans l'ORDRE DU MODÈLE, chaque étape déjà
 * présente reprise telle quelle : son état, sa date et sa note sont la donnée la
 * plus précieuse du parcours et ne sont jamais réécrits. Seul le DÉTAIL est
 * rafraîchi — c'est de la documentation livrée avec le code, et figée elle
 * décrit un mécanisme disparu, envoyant chercher au mauvais endroit.
 *
 * Une étape RETIRÉE du modèle disparaît, mais seulement si personne n'y a
 * touché : une case encore « à faire » n'est qu'une case vide, tandis
 * qu'effacer la trace d'un travail accompli n'est pas du ménage.
 *
 * Renvoie `null` quand il n'y a rien à changer — l'appelant laisse alors les
 * étapes en place plutôt que de réécrire une liste identique.
 *
 * Vit ici, et non dans le hook qui l'utilise, pour être vérifiable : la même
 * fonction sert au parcours et aux tests, là où une logique recopiée dans un
 * test peut rester verte pendant que le vrai code se casse.
 */
export type MergeableStep = {
  key?: string | null;
  detail?: unknown;
  state?: string | null;
  doneAt?: unknown;
  note?: unknown;
  [k: string]: unknown;
};

export const mergeRunSteps = (
  modelSteps: MergeableStep[],
  runSteps: MergeableStep[],
): MergeableStep[] | null => {
  const byKey = new Map(runSteps.map((s) => [s.key, s]));
  const modelKeys = new Set(modelSteps.map((s) => s.key));
  const details = new Map(modelSteps.map((s) => [s.key, s.detail]));

  const missing = modelSteps.some((s) => !byKey.has(s.key));
  const staleDetails = runSteps.some(
    (s) => s.key && details.has(s.key) && details.get(s.key) !== s.detail,
  );

  const orphans = runSteps.filter((s) => !modelKeys.has(s.key));
  const toDrop = new Set(
    orphans.filter((s) => (s.state ?? "a-faire") === "a-faire" && !s.doneAt && !s.note),
  );

  if (!missing && !staleDetails && toDrop.size === 0) return null;

  return [
    ...modelSteps.map((modelStep) => {
      const existing = byKey.get(modelStep.key);
      if (!existing) return { ...modelStep, state: "a-faire" };
      return existing.key && details.has(existing.key)
        ? { ...existing, detail: details.get(existing.key) }
        : existing;
    }),
    ...orphans.filter((s) => !toDrop.has(s)),
  ];
};

export const isSystemStep = (key?: string | null): boolean =>
  Boolean(key && key in SYSTEM_STEPS);

/**
 * L'étape peut-elle se valider toute seule ?
 *
 * La table de code prime sur le `autoValidate` recopié dans le parcours : c'est
 * ce qui fait qu'un parcours lancé il y a trois semaines suit la même règle
 * qu'un parcours lancé aujourd'hui, sans reprise de données.
 */
export const canAutoValidate = (step: {
  key?: string | null;
  autoValidate?: boolean | null;
}): boolean => {
  if (step.key && NEVER_AUTO_VALIDATE.has(step.key)) return false;
  return isSystemStep(step.key) || Boolean(step.autoValidate);
};

/**
 * L'étape se coche-t-elle à la main ? C'est le complément exact du constat
 * système : tout ce que le logiciel ne sait pas observer se déclare.
 */
export const isManualStep = (step: {
  key?: string | null;
  autoValidate?: boolean | null;
}): boolean => !canAutoValidate(step);

/**
 * Ce que la validation DÉCLENCHE, pour les étapes où cocher fait plus que
 * cocher.
 *
 * « Est-ce qu'il faut valider pour que l'e-mail parte ? » est la question qu'on
 * se pose devant chaque ligne, et la réponse n'est pas la même partout. Elle est
 * donc écrite sur le bouton, plutôt que déduite à tort d'une enveloppe affichée
 * à côté (celles-ci montrent les envois RATTACHÉS à l'étape, pas ceux que la
 * validation provoque).
 */
export const STEP_VALIDATION_EFFECT: Record<string, string> = {
  "validation-admin":
    "Ouvre l'espace client et lui envoie son invitation. Rien n'est parti au client avant ce Go.",
  "validation-dossier":
    "Verrouille le dossier : le client ne pourra plus le modifier depuis son espace.",
  decision: "Déclenche l'alerte « devis à rédiger » aux admins TIM — sauf en cas d'abandon.",
  "demande-contrat": "Déclenche l'alerte « contrat à établir » aux admins TIM.",
  "mise-en-production": "Clôt le parcours : le client passe « Actif » et la facturation démarre.",
};

/**
 * Les 20 étapes de la phase de test, dans l'ordre.
 *
 * Ces définitions servent de VALEURS PAR DÉFAUT : elles sèment le document
 * `marketing-journeys` au premier démarrage (voir seedJourneys), après quoi
 * l'équipe peut ajuster libellés, détails et échéances depuis le back-office.
 */
export const PHASE_DE_TEST_KEY = "phase-de-test";

export const PHASE_DE_TEST_STEPS: JourneyStepDef[] = [
  // ── Bloc A — Avant le test ────────────────────────────────────────────────
  {
    key: "demande",
    autoValidate: true,
    label: "Demande de phase de test",
    actor: "partenaire",
    phase: "avant-test",
    detail:
      "Entreprise, contact, périmètre de licences souhaité et durée du test.",
    anchor: "debut",
    offsetDays: -14,
  },
  {
    key: "validation-admin",
    // PAS d'auto-validation : le Go/No-Go engage TIM. Le laisser se cocher tout
    // seul reviendrait à accepter toute demande par défaut, sans que personne
    // n'ait rien décidé.
    label: "Validation TIM (Go / No-Go)",
    actor: "admin",
    phase: "avant-test",
    detail:
      "Éligibilité du client : SIREN, effectif, chantier pilote, décideur identifié. Le Go ouvre l'espace client et déclenche son invitation — rien ne part au client avant.",
    anchor: "debut",
    offsetDays: -10,
  },
  {
    key: "compte-espace-client",
    autoValidate: true,
    label: "Création du compte espace client",
    actor: "admin",
    phase: "avant-test",
    detail:
      "Rien à créer ni à cocher : l'adresse est enregistrée au démarrage du test, et le Go de TIM ouvre l'accès. L'invitation part à ce moment-là — lien de l'espace et code à 6 chiffres, sans mot de passe.",
    anchor: "debut",
    offsetDays: -9,
  },
  {
    key: "rdv-prise-en-main",
    autoValidate: true,
    label: "Créneau de prise en main réservé",
    actor: "client",
    phase: "avant-test",
    detail:
      "45 minutes avec le partenaire, calées avant le démarrage. Le partenaire choisit le mode (visio ou sur site) sur la fiche de la phase de test ; l'invitation à réserver part automatiquement une semaine avant, avec le lien ou l'adresse.",
    anchor: "debut",
    offsetDays: -7,
  },
  {
    key: "dossier-demarrage",
    autoValidate: true,
    label: "Dossier de démarrage complété",
    actor: "client",
    phase: "avant-test",
    detail:
      "Le client saisit lui-même, dans son espace : ses licences (prénom, nom, e-mail, priorité), son effectif, ses chantiers, ses véhicules et ses engins. Les champs obligatoires bloquent la transmission tant qu'ils manquent — plus d'erreur d'import. La transmission déclenche un accusé de réception automatique.",
    anchor: "debut",
    offsetDays: -5,
  },
  {
    // Étape de TIM, entre la transmission du dossier et la création des comptes.
    // `autoValidate` sans figurer dans SYSTEM_STEPS : elle garde son bouton — la
    // valider EST le geste — mais se coche aussi toute seule si quelqu'un passe
    // l'état du dossier à « Validé » depuis la fiche. Deux chemins, un seul état.
    key: "validation-dossier",
    autoValidate: true,
    label: "Dossier vérifié par TIM",
    actor: "admin",
    phase: "avant-test",
    detail:
      "Contrôle du dossier transmis : cohérence des utilisateurs déclarés, identités des salariés, chantiers renseignés. Valider VERROUILLE la saisie du client — il ne pourra plus rien modifier sans passer par vous.",
    anchor: "debut",
    offsetDays: -4,
  },
  // ── Bloc B — Pendant le test ──────────────────────────────────────────────
  {
    key: "provisionnement",
    autoValidate: true,
    label: "Provisionnement des accès",
    actor: "admin",
    phase: "pendant-test",
    detail:
      "Les comptes sont créés dans TIM à partir du dossier du client (onglet « Préparation des accès »). À terminer le vendredi précédent. L'étape se coche dès que les mots de passe sont générés.",
    anchor: "debut",
    offsetDays: -1,
  },
  {
    key: "prise-en-main",
    label: "Session de prise en main réalisée",
    actor: "partenaire",
    phase: "pendant-test",
    anchor: "debut",
    offsetDays: 0,
  },
  {
    key: "remise-acces",
    label: "Accès distribués aux utilisateurs",
    actor: "client",
    phase: "pendant-test",
    detail: "C'est le client qui remet les identifiants à ses utilisateurs.",
    anchor: "debut",
    offsetDays: 1,
  },
  {
    key: "releve-j2",
    label: "Relevé d'usage J+2",
    actor: "partenaire",
    phase: "pendant-test",
    detail:
      "Le partenaire se connecte au compte du client et note ce qu'il constate.",
    anchor: "debut",
    offsetDays: 2,
  },
  {
    key: "releve-j7",
    label: "Relevé d'usage J+7",
    actor: "partenaire",
    phase: "pendant-test",
    anchor: "debut",
    offsetDays: 7,
  },
  {
    key: "releve-mi-parcours",
    label: "Relevé d'usage à mi-parcours",
    actor: "partenaire",
    phase: "pendant-test",
    anchor: "milieu",
  },
  {
    key: "releve-fin",
    label: "Relevé d'usage avant bilan",
    actor: "partenaire",
    phase: "pendant-test",
    anchor: "fin",
    offsetDays: -7,
  },
  {
    key: "bilan",
    label: "Bilan de fin de test",
    actor: "partenaire",
    phase: "pendant-test",
    detail: "Restitution au client : ce qui a marché, ce qui manque, la suite.",
    anchor: "fin",
    offsetDays: -3,
  },

  // ── Bloc C — Sortie de test ───────────────────────────────────────────────
  {
    key: "decision",
    label: "Décision du client",
    actor: "client",
    phase: "sortie-test",
    detail: "Go contrat, prolongation ou abandon.",
    anchor: "fin",
    offsetDays: 0,
  },
  {
    key: "devis",
    label: "Devis transmis",
    actor: "partenaire",
    phase: "sortie-test",
    detail:
      "C'est TIM qui RÉDIGE le devis (licences par profil × prix négocié, repris du dossier de démarrage) ; le partenaire le TRANSMET à son client et valide cette étape. La demande part automatiquement à TIM dès que le client a dit oui.",
    anchor: "fin",
    offsetDays: 2,
  },
  {
    key: "demande-contrat",
    label: "Demande de contrat à TIM",
    actor: "partenaire",
    phase: "sortie-test",
    detail:
      "Le partenaire ne rédige pas le contrat : il le demande à l'admin. Valider cette étape EST la demande — l'alerte part aux admins à ce moment-là.",
    anchor: "fin",
    offsetDays: 3,
  },
  {
    key: "contrat",
    label: "Contrat rédigé",
    actor: "admin",
    phase: "sortie-test",
    detail:
      "Mode de paiement, conditions, TVA — onglet « Contrat client » de la fiche.",
    anchor: "fin",
    offsetDays: 7,
  },
  {
    key: "signature",
    autoValidate: true,
    label: "Contrat signé",
    actor: "client",
    phase: "sortie-test",
    detail:
      "L'étape se coche quand la date de signature est enregistrée sur la fiche client (onglet « Contrat client »), avec le PDF signé.",
    anchor: "fin",
    offsetDays: 10,
  },
  {
    key: "mise-en-production",
    label: "Bascule en production",
    actor: "admin",
    phase: "sortie-test",
    detail:
      "Licences payantes activées — le client passe « Actif », la facturation démarre.",
    anchor: "fin",
    offsetDays: 12,
  },
];

// ─── Envois automatiques ─────────────────────────────────────────────────────
/**
 * Tout ce que le système envoie SEUL pendant un parcours.
 *
 * Deux natures, volontairement dans la même liste — pour qu'au démarrage on
 * puisse montrer d'un bloc « voilà ce qui partira sans que vous fassiez rien » :
 *  - `calendrier` : daté par un ancrage, comme les étapes (séquence de test) ;
 *  - `evenement`  : déclenché par un fait (création du compte, connexion,
 *                   transmission du dossier) et donc sans date prévisible.
 *
 * Les libellés sont éditables dans le back-office : ces définitions ne servent
 * que de valeurs initiales (voir seedJourneys).
 */
export type JourneyAudience = "client" | "tim" | "partenaire";

export const EMAIL_AUDIENCES = [
  { label: "Contact du client", value: "client" },
  { label: "TIM (validation)", value: "tim" },
  { label: "Partenaire suiveur", value: "partenaire" },
] as const;

export const AUDIENCE_LABEL: Record<string, string> = {
  client: "Client",
  tim: "TIM",
  partenaire: "Partenaire",
};

export type JourneyEmailDef = {
  key: string;
  subject: string;
  /** Heure d'envoi (HH:mm, heure de Paris). Défaut : DEFAULT_SEND_HOUR. */
  sendHour?: string;
  /** Qui reçoit : le contact du client, TIM (pour valider), ou le partenaire. */
  audience: JourneyAudience;
  /** `aucun` = déclenché par un événement, pas par le calendrier. */
  anchor: JourneyAnchor;
  offsetDays?: number;
  /** Ce que fait l'e-mail, en une phrase (affiché au démarrage). */
  detail: string;
  /** Fait déclencheur, pour les envois non datés. */
  trigger?: string;
  /**
   * Étape à laquelle rattacher l'envoi. Indispensable pour les envois non datés
   * (aucune date ne permettrait de les situer). Les envois DATÉS peuvent s'en
   * passer : ils se rattachent d'eux-mêmes à l'étape dont ils tombent dans la
   * fenêtre (voir attachEmailsToSteps).
   */
  stepKey?: string;
};

/**
 * Rattache chaque envoi à une étape, pour qu'un e-mail ne flotte jamais hors du
 * déroulé : d'abord par `stepKey` quand il est déclaré, sinon par la date —
 * l'envoi appartient à la dernière étape dont l'échéance le précède.
 */
export function attachEmailsToSteps<
  S extends { key?: string | null; due?: string | null },
  E extends { stepKey?: string | null; due?: string | null },
>(steps: S[], emails: E[]): Map<string, E[]> {
  const out = new Map<string, E[]>();
  const push = (stepKey: string, mail: E) => {
    const list = out.get(stepKey) ?? [];
    list.push(mail);
    out.set(stepKey, list);
  };

  const ordered = steps
    .filter((s) => s.key && s.due)
    .sort((a, b) => Date.parse(a.due!) - Date.parse(b.due!));

  for (const mail of emails) {
    if (mail.stepKey && steps.some((s) => s.key === mail.stepKey)) {
      push(mail.stepKey, mail);
      continue;
    }
    if (!mail.due || ordered.length === 0) continue;

    const t = Date.parse(mail.due);
    let host = ordered[0];
    for (const step of ordered) {
      if (Date.parse(step.due!) <= t) host = step;
      else break;
    }
    push(host.key!, mail);
  }
  return out;
}

export const PHASE_DE_TEST_EMAILS: JourneyEmailDef[] = [
  // ── Déclenchés par un événement ───────────────────────────────────────────
  {
    key: "demande-recue",
    subject: "Nouvelle demande de phase de test",
    audience: "tim",
    anchor: "aucun",
    stepKey: "demande",
    trigger: "Dès que le partenaire soumet la demande",
    detail: "Prévient TIM qu'une demande attend son Go / No-Go.",
  },
  {
    key: "invitation-espace-client",
    subject: "Votre espace client TIM est ouvert",
    audience: "client",
    anchor: "aucun",
    stepKey: "compte-espace-client",
    trigger: "À l'ouverture de l'accès, c'est-à-dire au Go de TIM",
    detail:
      "Invite le contact à se connecter et à remplir son dossier de démarrage : licences (prénom, nom, e-mail, priorité), salariés, chantiers, véhicules et engins.",
  },
  {
    key: "code-connexion",
    subject: "Votre code de connexion",
    audience: "client",
    anchor: "aucun",
    stepKey: "compte-espace-client",
    trigger: "À chaque connexion à l'espace client",
    detail:
      "Code à 6 chiffres, valable 15 minutes et utilisable une seule fois. Aucun mot de passe.",
  },
  {
    key: "creneau-confirme",
    subject: "Votre session de prise en main est réservée",
    audience: "client",
    anchor: "aucun",
    stepKey: "rdv-prise-en-main",
    trigger: "À la réservation du créneau, pour le client",
    detail:
      "Confirme au client l'horaire qu'il vient de choisir, avec la modalité et le lien de visio s'il y en a un. Sans lui, réserver ne produit aucun accusé de réception.",
  },
  {
    key: "creneau-reserve-tim",
    subject: "Prise en main calée",
    audience: "tim",
    anchor: "aucun",
    stepKey: "rdv-prise-en-main",
    trigger: "À la réservation du créneau, pour TIM",
    detail:
      "Prévient l'équipe qu'une session est calée, avec sa date et les participants annoncés. C'est l'étape qui décide de la première semaine du test.",
  },
  {
    key: "creneau-reserve",
    subject: "Votre client a réservé son créneau",
    audience: "partenaire",
    anchor: "aucun",
    stepKey: "rdv-prise-en-main",
    trigger: "À la réservation du créneau par le client",
    detail: "Confirme au partenaire la date de la session de prise en main.",
  },
  {
    key: "dossier-recu",
    subject: "Nous avons bien reçu votre dossier",
    audience: "client",
    anchor: "aucun",
    stepKey: "dossier-demarrage",
    trigger: "À la transmission du dossier de démarrage",
    detail:
      "Confirme la réception et annonce la suite : préparation des accès avant le lundi de démarrage.",
  },
  {
    key: "dossier-a-verifier",
    subject: "Dossier de démarrage à vérifier",
    audience: "tim",
    anchor: "aucun",
    stepKey: "dossier-demarrage",
    trigger: "À la transmission du dossier de démarrage",
    detail:
      "Prévient TIM que le dossier est complet et attend son contrôle avant provisionnement.",
  },
  {
    key: "devis-a-rediger",
    subject: "Devis à rédiger",
    audience: "tim",
    anchor: "aucun",
    stepKey: "devis",
    trigger: "Dès que le client a décidé de continuer",
    detail:
      "Le partenaire transmet le devis, mais c'est TIM qui le rédige : cet envoi porte le périmètre de licences constaté pendant le test et les coordonnées de facturation.",
  },
  {
    key: "demande-contrat-tim",
    subject: "Demande de contrat à établir",
    audience: "tim",
    anchor: "aucun",
    stepKey: "demande-contrat",
    trigger: "Quand le partenaire demande le contrat",
    detail:
      "Le partenaire fait le devis, TIM rédige le contrat : cet envoi est le passage de relais, avec le devis joint.",
  },

  // ── Relances (client) ─────────────────────────────────────────────────────
  // Elles ne partent QUE si la chose n'est toujours pas faite (voir
  // SEND_CONDITIONS) : une relance qui arrive après coup décrédibilise toutes
  // les suivantes, et apprend au client à ne plus les lire.
  {
    key: "relance-creneau",
    subject: "Il reste à réserver votre session de prise en main",
    audience: "client",
    anchor: "debut",
    offsetDays: -4,
    detail:
      "Relance sur le créneau de prise en main, envoyée seulement si aucun rendez-vous n'est réservé. Passé le démarrage, cette session ne rattrape plus la première semaine.",
  },
  {
    key: "relance-dossier",
    subject: "Votre dossier de démarrage nous manque",
    audience: "client",
    anchor: "debut",
    offsetDays: -3,
    detail:
      "Relance sur le dossier de démarrage, envoyée seulement s'il n'a pas été transmis. Sans lui, les accès ne peuvent pas être créés à temps pour le lundi de démarrage.",
  },

  // ── Séquence datée (client) ───────────────────────────────────────────────
  {
    key: "prise-en-main",
    subject: "45 minutes pour rendre votre équipe autonome",
    audience: "client",
    anchor: "debut",
    offsetDays: -7,
    detail:
      "Invite à réserver le créneau de prise en main avec le partenaire, avant le démarrage. C'est le facteur n°1 de réussite d'un test. La modalité (visio et son lien, ou adresse du site) est reprise de la fiche de la phase de test.",
  },
  {
    key: "acces-prets",
    subject: "Vos accès TIM sont prêts",
    audience: "client",
    anchor: "debut",
    offsetDays: 0,
    // 8 h le jour du démarrage : avant l'embauche, pour que les fiches d'accès
    // puissent être imprimées et distribuées dans la matinée.
    sendHour: "08:00",
    detail:
      "Annonce les identifiants disponibles dans l'espace client et invite le client à les distribuer à ses équipes (fiches imprimables). Envoyé le matin du démarrage, à 8 h.",
  },
  {
    key: "suivi-chantier",
    subject: "Le suivi de chantier, en 3 clics",
    audience: "client",
    anchor: "debut",
    offsetDays: 1,
    detail:
      "Première fonctionnalité : créer un chantier et y affecter une équipe.",
  },
  {
    key: "check-in",
    subject: "Comment ça se passe sur le chantier ?",
    audience: "client",
    anchor: "debut",
    offsetDays: 7,
    detail:
      "Prise de nouvelles et rappel qu'on reste disponible. Sans bouton : le client répond directement à l'e-mail.",
  },
  {
    key: "fin-proche",
    subject: "Votre test se termine dans 5 jours",
    audience: "client",
    anchor: "fin",
    offsetDays: -5,
    detail: "Propose de caler le rendez-vous de bilan avec le partenaire.",
  },
  {
    key: "dernier-jour",
    subject: "Lundi, vos accès s'arrêtent",
    audience: "client",
    anchor: "fin",
    offsetDays: -1,
    detail:
      "Rappelle l'échéance et ce qui advient des données saisies pendant le test.",
  },
  {
    key: "decision",
    subject: "Fin de votre test — votre décision",
    audience: "client",
    anchor: "fin",
    offsetDays: 0,
    detail:
      "Trois réponses possibles : continuer, prolonger, arrêter. Le clic renseigne la décision.",
  },

  // ── Partenaire ────────────────────────────────────────────────────────────
  {
    key: "recap-partenaire",
    subject: "Vos tests en cours",
    audience: "partenaire",
    anchor: "aucun",
    stepKey: "prise-en-main",
    trigger: "Tous les lundis à 8 h, tant que le test est en cours",
    detail:
      "Récapitulatif au partenaire : jour du test, dernier relevé d'usage et action attendue cette semaine.",
  },
];

/** Étape à partir de laquelle le test tourne (le client passe « En test »). */
export const STEP_TEST_STARTS = "provisionnement";
/** Étape qui clôt le parcours en succès (le client passe « Actif »). */
export const STEP_TEST_WON = "mise-en-production";

// ─── Calendrier : lundi → lundi ──────────────────────────────────────────────
/** Les phases de test démarrent UNIQUEMENT un lundi. */
export const isMonday = (value?: string | Date | null): boolean => {
  if (!value) return false;
  const d = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(d.getTime()) && d.getUTCDay() === 1;
};

/** Durée par défaut d'une phase de test, en semaines (lundi → lundi). */
export const DEFAULT_DURATION_WEEKS = 4;

const DAY_MS = 86_400_000;

/** Ajoute des jours à une date ISO et renvoie une date ISO (UTC, minuit). */
export const addDays = (iso: string, days: number): string => {
  const d = new Date(iso);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) +
      days * DAY_MS,
  ).toISOString();
};

/**
 * Date de fin = démarrage + (semaines × 7) + jours de prolongation.
 * Tombe donc un lundi tant que le démarrage en est un et que les prolongations
 * sont des multiples de 7 (la durée de prolongation reste libre).
 */
export const computeEndDate = (
  startDate?: string | null,
  durationWeeks?: number | null,
  extraDays = 0,
): string | null => {
  if (!startDate) return null;
  const weeks =
    durationWeeks && durationWeeks > 0 ? durationWeeks : DEFAULT_DURATION_WEEKS;
  return addDays(startDate, weeks * 7 + extraDays);
};

const startOfDay = (iso: string): string => {
  const d = new Date(iso);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  ).toISOString();
};

const endOfDay = (iso: string): string => {
  const d = new Date(iso);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 0, 0),
  ).toISOString();
};

/**
 * Fenêtre dans laquelle la date d'un envoi peut être déplacée.
 *
 * Les dates par défaut viennent du calendrier du parcours. On n'autorise qu'un
 * ajustement « un peu avant / un peu après », borné par les étapes VOISINES :
 *
 *     étape précédente        cette étape         étape suivante
 *     ──────┬──────────────────────┬──────────────────┬──────────
 *           │◄──── déplacement autorisé ────────────►│
 *
 * La borne haute est la fin de la journée de l'étape suivante : un e-mail qui
 * partirait après elle annoncerait une chose déjà faite. La borne basse est le
 * début de la journée de l'étape précédente, pour la raison symétrique —
 * annoncer une action dont le préalable n'a pas encore eu lieu.
 *
 * Seules les étapes DATÉES bornent : une étape déclenchée par un événement ne
 * dit rien sur l'ordre du calendrier, et la sauter est donc correct.
 */
export type MailDateWindow = { min: string | null; max: string | null };

export function mailDateWindow(
  stepKey: string | null | undefined,
  steps: Array<{ key?: string | null; due?: string | null }>,
): MailDateWindow {
  const index = steps.findIndex((s) => s.key && s.key === stepKey);
  if (index === -1) return { min: null, max: null };

  let min: string | null = null;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (steps[i]?.due) {
      min = steps[i]!.due!;
      break;
    }
  }
  let max: string | null = null;
  for (let i = index + 1; i < steps.length; i += 1) {
    if (steps[i]?.due) {
      max = steps[i]!.due!;
      break;
    }
  }

  return { min: min ? startOfDay(min) : null, max: max ? endOfDay(max) : null };
}

/**
 * Ramène une date dans la fenêtre autorisée.
 *
 * `null` la traverse sans être corrigé : c'est « ne pas envoyer », un choix
 * délibéré et non une date hors bornes.
 */
export const clampMailDate = (
  at: string | null | undefined,
  window: MailDateWindow,
): string | null => {
  if (!at) return null;
  const t = Date.parse(at);
  if (Number.isNaN(t)) return null;
  if (window.min && t < Date.parse(window.min)) return window.min;
  if (window.max && t > Date.parse(window.max)) return window.max;
  return at;
};

/** Échéance d'une étape, dérivée de son ancrage. Null si aucune. */
export const stepDueDate = (
  step: { anchor?: string | null; offsetDays?: number | null },
  startDate?: string | null,
  endDate?: string | null,
): string | null => {
  const offset = step.offsetDays ?? 0;
  switch (step.anchor) {
    case "debut":
      return startDate ? addDays(startDate, offset) : null;
    case "fin":
      return endDate ? addDays(endDate, offset) : null;
    case "milieu": {
      if (!startDate || !endDate) return null;
      const days = Math.round(
        (Date.parse(endDate) - Date.parse(startDate)) / DAY_MS,
      );
      return addDays(startDate, Math.round(days / 2));
    }
    default:
      return null;
  }
};

/**
 * Calendrier d'envoi d'un parcours : la date de chaque e-mail daté.
 *
 * Recalculé à chaque changement de démarrage, de durée ou de prolongation —
 * SAUF pour les envois dont la date a été reprise à la main (`overridden`).
 * C'est toute la subtilité : une date choisie exprès ne doit pas être écrasée
 * par un recalcul, sinon la reprise en main ne tient pas une sauvegarde.
 *
 * Une date VIDÉE à la main est un choix aussi : elle vaut « ne pas envoyer ».
 * On la distingue d'une date jamais calculée grâce au même drapeau.
 */
/**
 * Heure d'envoi par défaut, en heure de Paris.
 *
 * 8 h : le BTP lit tôt. Un envoi à minuit — ce que donnerait une date sans
 * heure — arriverait en pleine nuit et serait noyé au réveil.
 */
export const DEFAULT_SEND_HOUR = "08:00";

/** Pose l'heure d'envoi sur une date, en heure de Paris. */
const atSendHour = (iso: string, hhmm?: string | null): string => {
  const [h, m] = (hhmm ?? DEFAULT_SEND_HOUR).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return iso;
  const { year, month, day } = utcToZonedParts(Date.parse(iso));
  return new Date(zonedTimeToUtc(year, month, day, h, m)).toISOString();
};

export function computeEmailSchedule<
  E extends {
    anchor?: string | null;
    offsetDays?: number | null;
    scheduledAt?: string | null;
    overridden?: boolean | null;
    sendHour?: string | null;
  },
>(emails: E[], startDate?: string | null, endDate?: string | null): E[] {
  return emails.map((mail) => {
    if (mail.overridden) return mail;
    const due = stepDueDate(mail, startDate, endDate);
    // Une date d'ancrage tombe à minuit : on y pose l'heure d'envoi voulue.
    return {
      ...mail,
      scheduledAt: due ? atSendHour(due, mail.sendHour) : null,
    };
  });
}

// ─── Infobulles d'étape ──────────────────────────────────────────────────────
/** Ce que le libellé d'acteur signifie : le RESPONSABLE de l'étape. */
export const ACTOR_ROLE: Record<string, string> = {
  partenaire:
    "C'est le PARTENAIRE apporteur qui réalise cette étape et la valide.",
  admin:
    "C'est l'équipe TIM qui réalise cette étape. Un partenaire ne peut pas la cocher.",
  client: "C'est le CLIENT qui réalise cette étape, depuis son espace client.",
};

/**
 * Contenu de l'infobulle d'une étape — partagé par le modal de démarrage et la
 * barre d'étapes de la fiche.
 *
 * Écrit ici plutôt que dupliqué dans les deux écrans : c'est la même question
 * (« à quoi correspond cette ligne ? »), elle mérite la même réponse.
 */
export const stepTooltip = (step: {
  label?: string | null;
  actor?: string | null;
  detail?: string | null;
  due?: string | null;
  autoValidate?: boolean | null;
  key?: string | null;
}): string[] => {
  const date = step.due
    ? new Date(step.due).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : null;

  return [
    step.label ?? "Étape",
    ACTOR_ROLE[step.actor ?? ""] ?? "Responsable de cette étape.",
    ...(step.detail ? [step.detail] : []),
    ...(date ? [`Échéance : ${date}`] : []),
    ...(step.key && SYSTEM_STEPS[step.key]
      ? [
          `Se coche toute seule ${SYSTEM_STEPS[step.key].trigger} — pas de validation à la main.`,
          ...(SYSTEM_STEPS[step.key].action ? [SYSTEM_STEPS[step.key].action!.hint] : []),
        ]
      : []),
  ];
};

/** Total des jours ajoutés par les prolongations d'un parcours. */
export const totalExtensionDays = (
  extensions?: { days?: number | null }[] | null,
): number => (extensions ?? []).reduce((sum, e) => sum + (e?.days ?? 0), 0);
