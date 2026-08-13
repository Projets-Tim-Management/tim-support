import type {
  CollectionAfterChangeHook,
  Payload,
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from "payload";

import { adminOnlyField, hasAdminRole, isAdmin, metierOwnedAccess } from "@/core/access";
import { enforcePartnerField } from "@/core/hooks/enforcePartner";
import { notifyAdminsQuoteNeeded, notifyAdminsTestRequested } from "@/modules/marketing/lib/notify";
import { syncSessionEvent } from "@/modules/marketing/lib/session-calendar";
import {
  DEFAULT_DURATION_WEEKS,
  JOURNEY_ACTORS,
  JOURNEY_ANCHORS,
  JOURNEY_PHASES,
  PHASE_DE_TEST_KEY,
  RUN_DECISIONS,
  RUN_STATUS_OPTIONS,
  SESSION_MODES,
  STEP_STATES,
  STEP_TEST_STARTS,
  STEP_TEST_WON,
  AUTO_VALIDATE_DELAY_HOURS,
  NEVER_AUTO_VALIDATE,
  clampMailDate,
  computeEmailSchedule,
  computeEndDate,
  isAdminStep,
  isMonday,
  isSessionBeforeStart,
  isStepDone,
  mailDateWindow,
  stepDueDate,
  totalExtensionDays,
} from "@/modules/marketing/lib/journey";

/**
 * Phase de test — l'INSTANCE d'un parcours marketing pour UN client.
 *
 * Le modèle (`marketing-journeys`) décrit les étapes ; ce document en garde une
 * COPIE au démarrage (`steps`) et suit leur avancement. La copie est
 * délibérée : modifier le modèle plus tard ne doit pas réécrire l'historique
 * des phases déjà lancées.
 *
 * Le statut du parcours est DÉRIVÉ des étapes (voir computeState) : impossible
 * d'avoir un parcours « gagné » dont la mise en production n'est pas cochée.
 * Seuls « perdu » et « annulé » se posent à la main — ce sont des décisions,
 * pas des conséquences.
 */

type RunStep = {
  key?: string;
  label?: string;
  actor?: string;
  state?: string;
  doneAt?: string | null;
  [k: string]: unknown;
};

type RunEmail = {
  key?: string;
  subject?: string;
  anchor?: string;
  offsetDays?: number;
  scheduledAt?: string | null;
  overridden?: boolean;
  [k: string]: unknown;
};

type JourneyDoc = {
  id?: number | string;
  title?: string;
  defaultDurationWeeks?: number;
  mondayOnly?: boolean;
  steps?: RunStep[];
  emails?: RunEmail[];
};

/** Id brut d'un champ relation (id ou objet peuplé). */
const idOf = (ref: unknown): number | string | null => {
  if (ref == null) return null;
  if (typeof ref === "object") return ((ref as { id?: number | string }).id ?? null) as number | string | null;
  return ref as number | string;
};

/**
 * Lecture directe via `payload.db` (et non `payload.find`) : même raison que
 * dans PartnerClients — passer par l'API peuplerait des relations et pourrait
 * relancer des hooks en cascade. Ici on ne veut qu'une ligne brute.
 */
async function findOne<T>(req: unknown, collection: string, id: number | string): Promise<T | null> {
  const db = (req as { payload?: { db?: { findOne?: (a: unknown) => Promise<unknown> } } })?.payload?.db;
  if (!db?.findOne) return null;
  try {
    return (await db.findOne({ collection, where: { id: { equals: id } }, req })) as T | null;
  } catch {
    return null;
  }
}

/**
 * Un client ne peut avoir qu'UNE phase de test ouverte à la fois : deux
 * parcours vivants sur la même fiche donneraient deux calendriers, deux séries
 * d'e-mails et un statut client incohérent. Les parcours CLOS ne gênent pas
 * (un client peut retester plus tard).
 */
const oneOpenRunPerClient: CollectionBeforeValidateHook = async ({ data, req, operation, originalDoc }) => {
  if (operation !== "create") return data;
  const clientId = idOf(data?.client);
  if (clientId == null) return data;
  const existing = await req.payload.find({
    collection: "journey-runs",
    where: {
      client: { equals: clientId },
      status: { not_in: ["gagne", "perdu", "annule"] },
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  });
  const other = existing.docs.find((d) => String(d.id) !== String(originalDoc?.id ?? ""));
  if (other) {
    throw new Error(
      "Ce client a déjà une phase de test en cours. Clôturez-la (gagnée, perdue ou annulée) avant d'en lancer une nouvelle.",
    );
  }
  return data;
};

/**
 * Le partenaire d'un parcours est TOUJOURS celui du client : le saisir à part
 * ouvrirait la porte à une incohérence (parcours rattaché au partenaire A pour
 * un client du partenaire B). On le déduit, on ne le demande pas.
 */
const derivePartnerFromClient: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const clientId = idOf(data?.client ?? originalDoc?.client);
  if (clientId == null) return data;
  const client = await findOne<{ partner?: unknown }>(req, "partner-clients", clientId);
  const partnerId = idOf(client?.partner);
  if (partnerId != null) return { ...data, partner: partnerId };
  return data;
};

/**
 * À la création : copie des étapes du modèle dans le parcours, à l'état
 * « à faire ». La durée par défaut du modèle sert de valeur initiale.
 */
const snapshotSteps: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  const hasSteps = Boolean((data?.steps ?? originalDoc?.steps ?? []).length);
  const hasEmails = Boolean((data?.emails ?? originalDoc?.emails ?? []).length);
  // À la création, tout est à copier. Sur un parcours existant, on ne complète
  // que ce qui MANQUE : les envois ont été ajoutés après coup, et les parcours
  // déjà lancés doivent en hériter sans qu'on touche à leurs étapes.
  if (operation !== "create" && hasSteps && hasEmails) return data;

  const journeyId = idOf(data?.journey ?? originalDoc?.journey);
  if (journeyId == null) return data;
  const journey = await findOne<JourneyDoc>(req, "marketing-journeys", journeyId);
  if (!journey?.steps?.length) return data;

  const steps = journey.steps.map((s) => ({
    key: s.key,
    label: s.label,
    actor: s.actor,
    phase: s.phase,
    detail: s.detail,
    anchor: s.anchor,
    offsetDays: s.offsetDays,
    autoValidate: s.autoValidate,
    state: "a-faire",
  }));

  // Les envois sont copiés eux aussi : leur date devient propre à CE parcours,
  // donc ajustable sans toucher au modèle ni aux autres clients.
  const emails = (journey.emails ?? []).map((e) => ({
    key: e.key,
    subject: e.subject,
    audience: e.audience,
    anchor: e.anchor,
    offsetDays: e.offsetDays,
    trigger: e.trigger,
    stepKey: e.stepKey,
    detail: e.detail,
    sendHour: e.sendHour,
    overridden: false,
  }));

  return {
    ...data,
    // Les étapes en place NE SONT PAS réécrites : leur avancement est la donnée
    // la plus précieuse du parcours. Seul un parcours qui n'en a pas en reçoit.
    ...(hasSteps ? {} : { steps }),
    ...(hasEmails ? {} : { emails }),
    durationWeeks: data?.durationWeeks ?? originalDoc?.durationWeeks ?? journey.defaultDurationWeeks ?? DEFAULT_DURATION_WEEKS,
  };
};

/**
 * Validation automatique : arme le compte à rebours des étapes dont le système
 * vient de CONSTATER le fait.
 *
 * On ne coche pas dans la seconde — l'étape passe en « auto » avec une échéance
 * (2 h par défaut). Pendant cette fenêtre, elle reste annulable d'un clic ;
 * après, elle est acquise. C'est le compromis demandé : plus rien à cocher pour
 * ce que le logiciel sait déjà, mais le droit de se raviser.
 *
 * Ne touche QUE les étapes encore « à faire » : une étape validée ou déjà armée
 * n'est jamais réarmée, sinon le délai repartirait à chaque enregistrement.
 */
const armAutoSteps: CollectionBeforeChangeHook = ({ data, originalDoc, operation }) => {
  const steps = (data?.steps ?? originalDoc?.steps ?? []) as RunStep[];
  if (!steps.length) return data;

  const armed = new Set<string>();
  // Lancer la phase VAUT la demande. Pas le Go/No-Go : celui-ci reste une
  // décision de TIM, qu'aucun automatisme ne prend à sa place.
  if (operation === "create") armed.add("demande");
  // Le créneau vient d'être réservé (par le client ou saisi à la main).
  const sessionAt = data?.sessionAt ?? originalDoc?.sessionAt;
  if (sessionAt && !originalDoc?.sessionAt) armed.add("rdv-prise-en-main");

  // Ajoutées par les autres modules via le contexte (compte espace client,
  // transmission du dossier) : ils n'ont pas à connaître la forme des étapes.
  for (const key of ((data?.autoSteps ?? []) as string[]) ?? []) armed.add(key);

  // `autoSteps` est un canal de passage, pas une donnée : il ne doit pas être stocké.
  const { autoSteps: _drop, ...rest } = data ?? {};
  void _drop;

  const at = new Date(Date.now() + AUTO_VALIDATE_DELAY_HOURS * 3_600_000).toISOString();
  let changed = false;
  const next = steps.map((s) => {
    // Désarmement rétroactif : un parcours lancé avant cette règle a pu armer le
    // Go/No-Go. `isStepDone` l'empêche déjà de s'acquérir, mais tant que l'état
    // reste « auto » l'écran affiche un compte à rebours qui n'aboutira jamais —
    // il faut nettoyer la donnée, pas seulement neutraliser sa lecture.
    if (s.key && NEVER_AUTO_VALIDATE.has(s.key) && s.state === "auto") {
      changed = true;
      return { ...s, state: "a-faire", autoAt: null };
    }
    if (s.key && armed.has(s.key) && s.autoValidate && (s.state ?? "a-faire") === "a-faire") {
      changed = true;
      return { ...s, state: "auto", autoAt: at };
    }
    return s;
  });

  // Rien à armer ni à désarmer : on ne réécrit pas le tableau des étapes pour
  // rien — une mise à jour qui ne les touche pas ne doit pas les republier.
  if (!changed) return rest;
  return { ...rest, steps: next };
};

/**
 * Une étape dont TIM est l'acteur ne se valide que par un admin.
 *
 * L'écran masque déjà le bouton, mais un partenaire peut appeler l'API : la
 * règle doit vivre côté serveur, sinon elle n'existe pas. Le Go/No-Go engage
 * TIM vis-à-vis du client — le laisser cocher par le demandeur viderait la
 * validation de son sens.
 *
 * Les écritures SYSTÈME (routes de l'espace client, armement automatique) n'ont
 * pas d'utilisateur : elles passent, c'est le logiciel qui constate un fait.
 */
const guardAdminSteps: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  const next = (data?.steps ?? []) as RunStep[];
  const previous = (originalDoc?.steps ?? []) as RunStep[];
  if (!next.length || !previous.length) return data;
  if (!req.user || hasAdminRole(req.user)) return data;

  const before = new Map(previous.map((s) => [s.key, s]));
  for (const step of next) {
    if (!isAdminStep(step)) continue;
    const old = before.get(step.key);
    if (!old) continue;
    if ((step.state ?? "a-faire") !== (old.state ?? "a-faire")) {
      throw new Error(
        `L'étape « ${step.label ?? step.key} » est réservée à l'équipe TIM : vous ne pouvez pas la valider.`,
      );
    }
  }
  return data;
};

/**
 * La STRUCTURE du parcours appartient à TIM ; son AVANCEMENT appartient à ceux
 * qui le suivent.
 *
 * L'onglet « Correction manuelle » est masqué aux partenaires, mais un onglet
 * masqué n'est qu'un affichage : la même écriture reste possible par l'API. Ce
 * hook rétablit donc, pour tout non-admin, les champs qu'il n'a pas à toucher.
 *
 * On ne REFUSE pas l'enregistrement, on le nettoie : le partenaire valide ses
 * étapes et ajuste ses dates d'envoi dans le même formulaire, qui renvoie
 * forcément les champs structurels tels qu'il les a reçus. Lever une erreur
 * bloquerait un usage parfaitement légitime pour une donnée qu'il n'a pas
 * modifiée.
 *
 * Ce qu'un partenaire peut écrire :
 *   étapes  → state, doneAt, doneBy, note      (valider, annuler, commenter)
 *   envois  → scheduledAt, overridden          (décaler une date, dans sa fenêtre)
 *
 * Il ne peut ni AJOUTER ni SUPPRIMER de ligne : la liste reste celle du modèle.
 */
const STEP_OWN_FIELDS = ["state", "doneAt", "doneBy", "note"] as const;
const EMAIL_OWN_FIELDS = ["scheduledAt", "overridden"] as const;

/** Reprend la ligne d'origine, en n'y appliquant que les champs autorisés. */
function mergeAllowed<T extends Record<string, unknown>>(
  original: T,
  incoming: T | undefined,
  allowed: readonly string[],
): T {
  if (!incoming) return original;
  const out: Record<string, unknown> = { ...original };
  for (const field of allowed) {
    if (field in incoming) out[field] = incoming[field];
  }
  return out as T;
}

const guardStructuralEdits: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  // Écritures SYSTÈME (routes de l'espace client, hooks) : pas d'utilisateur,
  // et c'est le logiciel qui constate un fait. Les admins passent aussi.
  if (!req.user || hasAdminRole(req.user)) return data;
  if (!originalDoc) return data;

  const next = { ...data };

  const originalSteps = (originalDoc.steps ?? []) as RunStep[];
  const originalEmails = (originalDoc.emails ?? []) as RunEmail[];

  // Un tableau VIDE à l'origine n'a rien à protéger, et ce qui arrive n'est pas
  // une modification : c'est `snapshotSteps` qui recopie le modèle sur un
  // parcours lancé avant que ces lignes n'existent. Repartir de l'original le
  // réduirait à néant — et le parcours n'aurait jamais ses envois, jusqu'à ce
  // qu'un admin l'enregistre.
  if (Array.isArray(data?.steps) && originalSteps.length > 0) {
    const incoming = new Map(
      (data.steps as RunStep[]).filter((s) => s.key).map((s) => [s.key, s]),
    );
    // On repart de l'ORIGINAL : une ligne ajoutée disparaît, une ligne
    // supprimée revient, et l'ordre du modèle est préservé.
    next.steps = originalSteps.map((original) =>
      mergeAllowed(original, incoming.get(original.key), STEP_OWN_FIELDS),
    );
  }

  if (Array.isArray(data?.emails) && originalEmails.length > 0) {
    const incoming = new Map(
      (data.emails as RunEmail[]).filter((e) => e.key).map((e) => [e.key, e]),
    );
    next.emails = originalEmails.map((original) =>
      mergeAllowed(original, incoming.get(original.key), EMAIL_OWN_FIELDS),
    );
  }

  return next;
};

/**
 * Recalcule tout ce qui est dérivé : date de fin, avancement, étape courante et
 * statut. Un seul endroit — les colonnes de liste, la barre d'étapes et les
 * futures alertes lisent le même état, jamais un calcul refait ailleurs.
 */
const computeState: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const steps = (data?.steps ?? originalDoc?.steps ?? []) as RunStep[];
  const startDate = (data?.startDate ?? originalDoc?.startDate ?? null) as string | null;
  const durationWeeks = (data?.durationWeeks ?? originalDoc?.durationWeeks ?? DEFAULT_DURATION_WEEKS) as number;
  const extensions = (data?.extensions ?? originalDoc?.extensions ?? []) as { days?: number }[];

  const endDate = computeEndDate(startDate, durationWeeks, totalExtensionDays(extensions));

  // `isStepDone` traite les étapes en validation automatique dont le délai est
  // écoulé : l'échéance suffit, sans réenregistrement ni travail de fond.
  const done = new Set(steps.filter((s) => isStepDone(s)).map((s) => s.key));
  const current = steps.find((s) => !isStepDone(s));

  // Statut dérivé, SAUF si le parcours a été clos à la main (perdu / annulé) :
  // une décision humaine ne doit pas être écrasée par le calcul.
  const previous = (data?.status ?? originalDoc?.status ?? "preparation") as string;
  const status =
    previous === "perdu" || previous === "annule"
      ? previous
      : done.has(STEP_TEST_WON)
        ? "gagne"
        : done.has(STEP_TEST_STARTS)
          ? "en-cours"
          : "preparation";

  // Les dates d'envoi suivent le calendrier, sauf celles reprises à la main.
  const emails = computeEmailSchedule(
    (data?.emails ?? originalDoc?.emails ?? []) as RunEmail[],
    startDate,
    endDate,
  );

  // Une date reprise à la main reste dans la fenêtre de son étape. L'écran pose
  // déjà les bornes sur le champ, mais `min`/`max` d'un `datetime-local` ne font
  // qu'orienter le sélecteur : une saisie au clavier ou un appel direct à l'API
  // les traverse. La règle doit donc vivre ICI aussi, sinon elle n'existe pas.
  const dated = steps.map((s) => ({
    key: s.key,
    due: stepDueDate(s as never, startDate, endDate),
  }));
  const bounded = emails.map((mail) => {
    if (!mail.overridden || !mail.scheduledAt) return mail;
    const inside = clampMailDate(mail.scheduledAt, mailDateWindow(mail.stepKey as string, dated));
    return inside === mail.scheduledAt ? mail : { ...mail, scheduledAt: inside };
  });

  return {
    ...data,
    endDate,
    emails: bounded,
    status,
    stepsTotal: steps.length,
    stepsDone: done.size,
    progressPct: steps.length ? Math.round((done.size / steps.length) * 100) : 0,
    currentStepKey: current?.key ?? null,
    currentStepLabel: current?.label ?? null,
  };
};

/**
 * Session « sur place » : pré-remplit l'adresse avec celle du client plutôt que
 * de la faire retaper. Ne s'applique QUE si le champ est vide — une adresse
 * corrigée à la main (autre site, autre agence) ne doit jamais être réécrite.
 */
const defaultSessionLocation: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  if (data?.sessionMode !== "sur-place") return data;
  if ((data?.sessionLocation ?? originalDoc?.sessionLocation)?.trim?.()) return data;

  const clientId = idOf(data?.client ?? originalDoc?.client);
  if (clientId == null) return data;

  const client = await findOne<{ billingAddress?: string; billingAddressComplement?: string }>(
    req,
    "partner-clients",
    clientId,
  );
  const address = [client?.billingAddress, client?.billingAddressComplement]
    .filter(Boolean)
    .join(", ")
    .trim();

  return address ? { ...data, sessionLocation: address } : data;
};

/** Titre lisible de la fiche (useAsTitle) : « ENTREPRISE — Phase de test ». */
const computeDisplayName: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const clientId = idOf(data?.client ?? originalDoc?.client);
  const journeyId = idOf(data?.journey ?? originalDoc?.journey);
  const client = clientId != null ? await findOne<{ companyName?: string }>(req, "partner-clients", clientId) : null;
  const journey = journeyId != null ? await findOne<JourneyDoc>(req, "marketing-journeys", journeyId) : null;
  const parts = [client?.companyName, journey?.title].filter(Boolean);
  return { ...data, displayName: parts.length ? parts.join(" — ") : "Phase de test" };
};

/**
 * Tient l'agenda du partenaire aligné sur le créneau de prise en main.
 *
 * Ce hook est le SEUL déclencheur : que le créneau vienne de l'espace client ou
 * d'une saisie à la main dans cette fiche, il produit le même événement et le
 * même lien de visio. Auparavant seule la réservation client créait l'événement,
 * et un créneau saisi ici restait sans lien — en silence.
 *
 * L'écriture en retour passe par `req.context` pour ne pas se rappeler
 * elle-même : sans ce drapeau, chaque synchronisation en relancerait une.
 */
const SKIP = "skipSessionCalendar";

const syncSessionCalendar: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  const ctx = (req.context ?? {}) as Record<string, unknown>;
  if (ctx[SKIP]) return doc;

  const before = (previousDoc?.sessionAt ?? null) as string | null;
  const after = (doc?.sessionAt ?? null) as string | null;
  // Le mode et le lieu comptent autant que l'horaire : passer de visio à sur
  // place doit retirer la conférence, sinon le client se connecte au lieu de se
  // déplacer, et une adresse corrigée doit suivre dans l'invitation.
  const modeChanged = (previousDoc?.sessionMode ?? null) !== (doc?.sessionMode ?? null);
  const placeChanged = (previousDoc?.sessionLocation ?? null) !== (doc?.sessionLocation ?? null);
  // Rattrapage : créneau déjà posé mais sans événement — cas d'un agenda
  // connecté APRÈS coup. Sans ça, le lien n'arriverait jamais.
  const missingEvent = Boolean(after) && !doc?.sessionEventId;
  if (before === after && !modeChanged && !placeChanged && !missingEvent) return doc;

  const result = await syncSessionEvent(req.payload, doc as never, before);
  if (result.action === "none" && result.sessionEventId === undefined) return doc;

  ctx[SKIP] = true;
  try {
    await req.payload.update({
      collection: "journey-runs",
      id: doc.id,
      data: {
        ...(result.sessionEventId !== undefined ? { sessionEventId: result.sessionEventId } : {}),
        ...(result.sessionLink !== undefined ? { sessionLink: result.sessionLink } : {}),
      },
      overrideAccess: true,
      req,
    });
  } catch (err) {
    req.payload.logger.error(`[agenda] écriture du lien sur le parcours ${doc.id} échouée : ${err}`);
  } finally {
    delete ctx[SKIP];
  }
  return doc;
};

/**
 * Répercute l'avancement du parcours sur le STATUT du client apporté — c'est
 * le parcours qui pilote la fiche, pas l'inverse :
 *   test démarré  → « En test »
 *   parcours gagné → « Actif »  (⇒ facturation + commission partenaire démarrent)
 *   parcours perdu → « Archivé »
 * « Annulé » (No-Go avant démarrage) ne touche à rien : le client reste prospect.
 *
 * N'écrit QUE si le statut change réellement, pour ne pas réenregistrer la fiche
 * client (et son historique de CA) à chaque sauvegarde du parcours.
 */
const CLIENT_STATUS_BY_RUN = {
  "en-cours": "en-test",
  gagne: "actif",
  perdu: "archive",
} as const;

const syncClientStatus: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  const status = doc?.status as string | undefined;
  if (!status || status === previousDoc?.status) return doc;

  const target = CLIENT_STATUS_BY_RUN[status as keyof typeof CLIENT_STATUS_BY_RUN];
  const clientId = idOf(doc?.client);
  if (!target || clientId == null) return doc;

  const client = await findOne<{ clientStatus?: string }>(req, "partner-clients", clientId);
  if (client?.clientStatus === target) return doc;

  // C'est le parcours qui pilote le statut : il ne doit pas se heurter au
  // garde-fou « pas de test sans date » (requireTestSchedule), qui protège les
  // changements de statut faits À LA MAIN. Le drapeau est posé sur `req.context`
  // (et non passé en option) pour être certain qu'il atteigne le hook, puis
  // RETIRÉ : le laisser ouvrirait une brèche pour le reste de la requête.
  const ctx = (req.context ?? {}) as Record<string, unknown>;
  ctx.fromJourneySync = true;
  try {
    await req.payload.update({
      collection: "partner-clients",
      id: clientId,
      data: { clientStatus: target },
      overrideAccess: true,
      req,
    });
    req.payload.logger.info(`[parcours] client ${clientId} → statut « ${target} » (parcours ${status}).`);
  } catch (err) {
    req.payload.logger.error(`[parcours] synchronisation du statut client ${clientId} échouée : ${err}`);
  } finally {
    delete ctx.fromJourneySync;
  }
  return doc;
};

/**
 * Note qu'un envoi vient de partir, pour que la séquence programmée ne le
 * refasse pas. Silencieux : un marquage raté ne doit pas annuler l'e-mail déjà
 * envoyé — au pire il partira une seconde fois, ce qui vaut mieux que jamais.
 */
async function markEmailSent(
  payload: Payload,
  runId: number | string,
  emails: RunEmail[],
  key: string,
): Promise<void> {
  if (!emails.some((e) => e.key === key && !e.sentAt)) return;
  await payload
    .update({
      collection: "journey-runs",
      id: runId,
      data: {
        emails: emails.map((e) => (e.key === key ? { ...e, sentAt: new Date().toISOString() } : e)),
      } as never,
      overrideAccess: true,
    })
    .catch(() => undefined);
}

/**
 * Demande à TIM de rédiger le devis dès que le client a dit oui.
 *
 * Le partenaire TRANSMET le devis mais ne le rédige pas : sans cet envoi,
 * l'étape « Devis transmis » attendrait un document que personne n'a été
 * chargé de produire.
 *
 * Déclenché par la validation de l'étape « Décision du client », et jamais en
 * cas d'abandon — inutile de chiffrer une offre qu'on ne fera pas.
 */
const notifyQuoteNeeded: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  const wasDone = ((previousDoc?.steps ?? []) as RunStep[]).find((s) => s.key === "decision");
  const isDone = ((doc?.steps ?? []) as RunStep[]).find((s) => s.key === "decision");
  if (!isDone || isStepDone(wasDone ?? {}) || !isStepDone(isDone)) return doc;
  if (doc?.decision === "abandon") return doc;

  const clientId = idOf(doc?.client);
  const partnerId = idOf(doc?.partner);
  const client = clientId != null
    ? await findOne<{
        companyName?: string;
        siren?: string;
        email?: string;
        raisonSociale?: string;
        billingAddress?: string;
        caPaye?: number;
        licences?: Record<string, number | undefined>;
      }>(req, "partner-clients", clientId)
    : null;
  const partner = partnerId != null
    ? await findOne<{ displayName?: string; email?: string }>(req, "partners", partnerId)
    : null;

  await notifyAdminsQuoteNeeded(
    req.payload,
    { id: doc.id, endDate: doc.endDate },
    {
      client: client ? { id: clientId ?? undefined, ...client } : null,
      partner: partner ? { id: partnerId ?? undefined, ...partner } : null,
    },
  );

  await markEmailSent(req.payload, doc.id, (doc?.emails ?? []) as RunEmail[], "devis-a-rediger");
  return doc;
};

/**
 * Prévient TIM qu'une phase de test attend son Go / No-Go.
 *
 * À la création uniquement : c'est le moment où la décision est demandée. Le
 * marquage `sentAt` évite qu'un futur envoi programmé fasse doublon avec cette
 * notification immédiate.
 */
const notifyNewRequest: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== "create") return doc;

  const clientId = idOf(doc?.client);
  const partnerId = idOf(doc?.partner);
  const client = clientId != null
    ? await findOne<{
        companyName?: string;
        siren?: string;
        email?: string;
        totalLicences?: number;
        caPaye?: number;
      }>(req, "partner-clients", clientId)
    : null;
  const partner = partnerId != null
    ? await findOne<{ displayName?: string; societe?: string; email?: string }>(req, "partners", partnerId)
    : null;

  // La liste de contrôle vient de l'étape elle-même : si l'équipe la reformule
  // dans le modèle, l'e-mail suit — pas deux textes à tenir à jour.
  const checklist = ((doc?.steps ?? []) as RunStep[]).find((s) => s.key === "validation-admin")
    ?.detail as string | undefined;

  await notifyAdminsTestRequested(
    req.payload,
    { id: doc.id, startDate: doc.startDate, endDate: doc.endDate },
    {
      client: client ? { id: clientId ?? undefined, ...client } : null,
      partner: partner ? { id: partnerId ?? undefined, ...partner } : null,
      checklist,
    },
  );

  await markEmailSent(req.payload, doc.id, (doc?.emails ?? []) as RunEmail[], "demande-recue");
  return doc;
};

export const JourneyRuns: CollectionConfig = {
  slug: "journey-runs",
  labels: { singular: "Phase de test", plural: "Phases de test" },
  admin: {
    useAsTitle: "displayName",
    defaultColumns: ["displayName", "partner", "status", "startDate", "endDate", "currentStepLabel"],
    group: "Marketing",
    description: "Une ligne par client engagé dans un parcours. La barre d'étapes se pilote depuis la fiche.",
    components: {
      edit: {
        // Modal d'ajout de prolongation (montée en permanence, ouverte depuis la barre d'étapes).
        beforeDocumentControls: [],
      },
    },
  },
  disableDuplicate: true,
  // Clients et parcours suivent la même règle : le partenaire-métier gère les
  // siens, la suppression reste admin (un parcours est une trace commerciale).
  access: { ...metierOwnedAccess, delete: isAdmin },
  hooks: {
    beforeValidate: [oneOpenRunPerClient],
    beforeChange: [
      enforcePartnerField(),
      derivePartnerFromClient,
      snapshotSteps,
      defaultSessionLocation,
      guardStructuralEdits,
      guardAdminSteps,
      armAutoSteps,
      computeState,
      computeDisplayName,
    ],
    afterChange: [syncSessionCalendar, syncClientStatus, notifyNewRequest, notifyQuoteNeeded],
  },
  fields: [
    // Barre d'étapes : l'écran principal de la fiche (valider une étape, voir
    // l'échéance de chacune). Le tableau `steps` brut reste dessous, replié.
    {
      type: "tabs",
      tabs: [
        // Premier onglet : c'est pour lui qu'on ouvre la fiche. Le reste est du
        // paramétrage qu'on consulte de temps en temps.
        {
          label: "Étapes",
          fields: [
            {
              name: "stepper",
              type: "ui",
              admin: {
                components: { Field: "/modules/marketing/admin/JourneyStepper#JourneyStepper" },
              },
            },
          ],
        },
        {
          label: "Session de prise en main",
          description:
            "45 minutes avec le partenaire, OBLIGATOIREMENT avant le lundi de démarrage : c'est une pré-formation, pour que les équipes soient opérationnelles dès le premier jour. Ce réglage alimente l'invitation envoyée au client (début −7 jours) : un lien s'il s'agit d'une visio, une adresse si la session se tient sur site.",
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "sessionMode",
                  type: "select",
                  label: "Mode",
                  defaultValue: "visio",
                  options: [...SESSION_MODES],
                  admin: { width: "30%", description: "Au choix du partenaire, selon son client." },
                },
                {
                  name: "sessionLink",
                  type: "text",
                  label: "Lien de visio",
                  validate: (value: unknown) =>
                    !value || /^https?:\/\/\S+$/i.test(String(value))
                      ? true
                      : "Lien invalide (attendu : https://…).",
                  admin: {
                    width: "70%",
                    condition: (_, sibling) => sibling?.sessionMode !== "sur-place",
                    placeholder: "https://meet.google.com/…",
                    // La description précédente annonçait un lien « généré dès
                    // que l'agenda est connecté » : c'est faux, et ça se paie en
                    // confusion. Le lien naît AVEC l'événement d'agenda, donc à
                    // la réservation du créneau — connecter un agenda ne crée
                    // rien par soi-même.
                    description:
                      "Créé automatiquement (Google Meet ou Teams) au moment où le client réserve son créneau depuis son espace, si l'agenda du partenaire est connecté. Tant qu'aucun créneau n'est réservé, ce champ reste vide — vous pouvez y coller un lien à la main.",
                  },
                },
                {
                  name: "sessionLocation",
                  type: "text",
                  label: "Adresse de la session",
                  admin: {
                    width: "70%",
                    condition: (_, sibling) => sibling?.sessionMode === "sur-place",
                    description: "Pré-remplie avec l'adresse du client ; modifiable (autre site, agence…).",
                  },
                },
              ],
            },
            {
              name: "sessionAt",
              type: "date",
              label: "Créneau retenu",
              // La règle vit ici et pas seulement dans la génération de créneaux :
              // ce champ se saisit aussi à la main, et rien n'empêcherait alors
              // de caler la formation après le démarrage.
              validate: (value: unknown, { data }: { data?: { startDate?: string } }) =>
                isSessionBeforeStart(value as string, data?.startDate)
                  ? true
                  : "La prise en main doit avoir lieu AVANT le démarrage du test : c'est une pré-formation, pour que les équipes soient opérationnelles dès le premier jour.",
              admin: {
                date: { pickerAppearance: "dayAndTime", displayFormat: "dd/MM/yyyy HH:mm" },
                description:
                  "Réservé par le client depuis son espace, ou saisi ici à la main. Obligatoirement avant le lundi de démarrage. Attention : une saisie à la main ne crée PAS l'événement dans l'agenda et ne génère donc aucun lien de visio — à coller vous-même dans ce cas.",
              },
            },
            {
              // Identifiant de l'événement créé chez le fournisseur : sans lui,
              // impossible de le retrouver plus tard pour le déplacer ou l'annuler.
              name: "sessionEventId",
              type: "text",
              admin: { hidden: true },
            },
          ],
        },
        {
          label: "Prolongations",
          description:
            "Durée libre. Chaque prolongation décale la date de fin et reste tracée (qui, quand, pourquoi).",
          fields: [
            {
              name: "extensions",
              type: "array",
              label: false,
              labels: { singular: "Prolongation", plural: "Prolongations" },
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "days",
                      type: "number",
                      label: "Jours ajoutés",
                      required: true,
                      min: 1,
                      admin: { width: "30%", description: "14 = 2 semaines (la fin reste un lundi)." },
                    },
                    {
                      name: "at",
                      type: "date",
                      label: "Décidée le",
                      admin: {
                        width: "30%",
                        date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" },
                      },
                    },
                    { name: "reason", type: "text", label: "Motif", admin: { width: "40%" } },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: "Décision",
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "decision",
                  type: "select",
                  label: "Décision du client",
                  options: [...RUN_DECISIONS],
                  admin: { width: "50%" },
                },
                {
                  name: "decisionAt",
                  type: "date",
                  label: "Décidée le",
                  admin: {
                    width: "50%",
                    date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" },
                  },
                },
              ],
            },
            {
              name: "lostReason",
              type: "textarea",
              label: "Motif de perte",
              admin: {
                condition: (data) => data?.decision === "abandon" || data?.status === "perdu",
                description: "Ce qui a manqué. Alimente l'analyse des tests perdus.",
              },
            },
          ],
        },
        {
          label: "Réponses du client",
          description:
            "Quand le client répond à un e-mail du parcours, sa réponse ouvre un ticket rattaché ici — au lieu de se perdre dans la boîte support. Ouvrez le ticket pour lui répondre.",
          fields: [
            {
              name: "tickets",
              type: "join",
              collection: "tickets",
              on: "journeyRun",
              label: "Échanges",
              admin: { defaultColumns: ["number", "subject", "status", "createdAt"] },
            },
          ],
        },
        {
          label: "Correction manuelle",
          description:
            "Copie des étapes du modèle, figée au démarrage. Réservée aux corrections : l'usage normal passe par l'onglet « Étapes ».",
          // Réservé à TIM : on y modifie la STRUCTURE du parcours (intitulés,
          // ancrages, ordre), pas son avancement.
          //
          // ⚠ PAS de `admin.condition` ici. Une condition d'onglet se propage
          // aux champs enfants (iterateFields : `passesCondition && parent`), et
          // un TABLEAU dont la condition échoue est court-circuité : son état
          // conserve la valeur mais PLUS AUCUNE ligne `steps.N.*`. Or la barre
          // d'étapes lit et écrit exactement ces chemins — la masquer ainsi la
          // vidait pour les partenaires.
          // Le masquage se fait donc côté écran (AdminOnlyTabs), et la règle qui
          // compte vit dans `guardStructuralEdits`, côté serveur.
          fields: [
            {
              name: "steps",
              type: "array",
              label: false,
              labels: { singular: "Étape", plural: "Étapes" },
              admin: {
                initCollapsed: true,
                components: {
                  RowLabel: "/modules/marketing/admin/JourneyStepRowLabel#JourneyStepRowLabel",
                },
              },
              fields: [
                {
                  type: "row",
                  fields: [
                    { name: "key", type: "text", label: "Clé", required: true, admin: { width: "35%" } },
                    { name: "label", type: "text", label: "Intitulé", required: true, admin: { width: "65%" } },
                  ],
                },
                {
                  type: "row",
                  fields: [
                    {
                      name: "state",
                      type: "select",
                      label: "État",
                      defaultValue: "a-faire",
                      options: [...STEP_STATES],
                      admin: { width: "34%" },
                    },
                    {
                      // Échéance de la validation automatique. Passée cette
                      // date, l'étape compte comme faite sans autre écriture.
                      name: "autoAt",
                      type: "date",
                      label: "Validation automatique le",
                      admin: {
                        width: "33%",
                        date: { pickerAppearance: "dayAndTime", displayFormat: "dd/MM/yyyy HH:mm" },
                        condition: (_, s) => s?.state === "auto",
                      },
                    },
                    {
                      name: "autoValidate",
                      type: "checkbox",
                      label: "Se valide automatiquement",
                      admin: { hidden: true },
                    },
                    {
                      name: "actor",
                      type: "select",
                      label: "Qui agit",
                      options: [...JOURNEY_ACTORS],
                      admin: { width: "33%" },
                    },
                    {
                      name: "phase",
                      type: "select",
                      label: "Bloc",
                      options: [...JOURNEY_PHASES],
                      admin: { width: "33%" },
                    },
                  ],
                },
                { name: "detail", type: "textarea", label: "Détail" },
                {
                  type: "row",
                  fields: [
                    {
                      name: "anchor",
                      type: "select",
                      label: "Échéance",
                      defaultValue: "aucun",
                      options: [...JOURNEY_ANCHORS],
                      admin: { width: "50%" },
                    },
                    {
                      name: "offsetDays",
                      type: "number",
                      label: "Décalage (jours)",
                      defaultValue: 0,
                      admin: { width: "50%" },
                    },
                  ],
                },
                {
                  type: "row",
                  fields: [
                    {
                      name: "doneAt",
                      type: "date",
                      label: "Validée le",
                      admin: {
                        width: "50%",
                        date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" },
                      },
                    },
                    {
                      name: "doneBy",
                      type: "relationship",
                      relationTo: "users",
                      label: "Par",
                      admin: { width: "50%", allowCreate: false, allowEdit: false },
                    },
                  ],
                },
                { name: "note", type: "textarea", label: "Note" },
              ],
            },
            {
              name: "emails",
              type: "array",
              label: false,
              labels: { singular: "Envoi", plural: "Envois" },
              admin: {
                // La liste éditable vit au-dessus ; ce tableau reste pour les
                // corrections fines et la traçabilité.
                initCollapsed: true,
                components: {
                  RowLabel: "/modules/marketing/admin/JourneyEmailRowLabel#JourneyEmailRowLabel",
                },
              },
              fields: [
                {
                  type: "row",
                  fields: [
                    { name: "key", type: "text", label: "Clé", admin: { width: "35%" } },
                    { name: "subject", type: "text", label: "Objet", admin: { width: "65%" } },
                  ],
                },
                {
                  type: "row",
                  fields: [
                    {
                      name: "scheduledAt",
                      type: "date",
                      label: "Envoi prévu le",
                      admin: {
                        width: "50%",
                        date: { pickerAppearance: "dayAndTime", displayFormat: "dd/MM/yyyy HH:mm" },
                      },
                    },
                    {
                      name: "sendHour",
                      type: "text",
                      admin: { width: "25%", readOnly: true, description: "Heure d'envoi (Paris)." },
                    },
                    {
                      name: "overridden",
                      type: "checkbox",
                      label: "Date fixée à la main",
                      admin: {
                        width: "25%",
                        description: "Cochée, la date ne suit plus le calendrier.",
                      },
                    },
                  ],
                },
                {
                  name: "sentAt",
                  type: "date",
                  label: "Envoyé le",
                  admin: {
                    readOnly: true,
                    date: { pickerAppearance: "dayAndTime", displayFormat: "dd/MM/yyyy HH:mm" },
                    description: "Renseigné à l'envoi. Un e-mail déjà parti ne repart pas.",
                  },
                },
                {
                  type: "row",
                  fields: [
                    { name: "audience", type: "text", admin: { width: "25%", readOnly: true } },
                    { name: "anchor", type: "text", admin: { width: "25%", readOnly: true } },
                    { name: "offsetDays", type: "number", admin: { width: "25%", readOnly: true } },
                    { name: "stepKey", type: "text", admin: { width: "25%", readOnly: true } },
                  ],
                },
                { name: "trigger", type: "text", admin: { readOnly: true } },
                { name: "detail", type: "textarea", admin: { readOnly: true } },
              ],
            },
          ],
        },
      ],
    },

    // Masque « Correction manuelle » aux non-admins. Monté HORS des onglets :
    // Payload ne rend que le panneau actif, un composant placé dans un onglet ne
    // serait donc pas toujours là pour faire son travail.
    {
      name: "tabGuard",
      type: "ui",
      admin: {
        components: { Field: "/modules/marketing/admin/AdminOnlyTabs#AdminOnlyTabs" },
      },
    },

    // ─── Barre latérale ───────────────────────────────────────────────────────
    {
      name: "status",
      type: "select",
      label: "Statut",
      defaultValue: "preparation",
      index: true,
      options: RUN_STATUS_OPTIONS,
      admin: {
        position: "sidebar",
        description:
          "Dérivé des étapes. « Perdu » et « Annulé » se posent à la main et ne sont plus recalculés.",
        components: { Cell: "/modules/marketing/admin/RunStatusCell#RunStatusCell" },
      },
    },
    { name: "notes", type: "textarea", label: "Notes internes", admin: { position: "sidebar" } },

    // ─── Identité et calendrier, en barre latérale ───────────────────────────
    // Ces champs se consultent (« quel client ? quelles dates ? ») bien plus
    // qu'ils ne se modifient : les laisser en pleine largeur repoussait la
    // barre d'étapes — le seul écran qu'on ouvre vraiment cette fiche pour voir.
    {
      name: "client",
      type: "relationship",
      relationTo: "partner-clients",
      label: "Client",
      required: true,
      index: true,
      admin: { position: "sidebar", allowCreate: false },
      // Pré-rempli quand on arrive depuis la fiche client
      // (« Démarrer une phase de test » → ?client=<id>).
      defaultValue: ({ req }) => req?.searchParams?.get?.("client") || undefined,
    },
    {
      name: "journey",
      type: "relationship",
      relationTo: "marketing-journeys",
      label: "Parcours",
      required: true,
      admin: {
        position: "sidebar",
        allowCreate: false,
        allowEdit: false,
        description: "Le modèle suivi. Les étapes sont copiées à la création.",
      },
      // Un seul parcours actif aujourd'hui : on le pré-sélectionne pour que
      // « démarrer une phase de test » ne demande qu'une date.
      defaultValue: async ({ req }) => {
        try {
          const res = await req.payload.find({
            collection: "marketing-journeys",
            where: { key: { equals: PHASE_DE_TEST_KEY }, active: { equals: true } },
            limit: 1,
            depth: 0,
            overrideAccess: true,
            req,
          });
          return res.docs[0]?.id;
        } catch {
          return undefined;
        }
      },
    },
    {
      name: "partner",
      type: "relationship",
      relationTo: "partners",
      label: "Partenaire",
      index: true,
      // Déduit du client (derivePartnerFromClient) et verrouillé côté UI pour
      // les non-admins — même posture anti-usurpation que PartnerClients.
      access: { create: adminOnlyField, update: adminOnlyField },
      admin: {
        position: "sidebar",
        readOnly: true,
        allowCreate: false,
        allowEdit: false,
        description: "Repris automatiquement du client.",
      },
    },
    {
      name: "startDate",
      type: "date",
      label: "Démarrage du test",
      index: true,
      // Contrainte métier : les phases de test démarrent un LUNDI (la séquence
      // d'e-mails et les relevés sont calés sur un rythme hebdomadaire).
      validate: (value: unknown) =>
        !value || isMonday(value as string) ? true : "Le démarrage doit être un lundi.",
      admin: {
        position: "sidebar",
        date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" },
        description: "Un lundi uniquement.",
      },
    },
    {
      name: "durationWeeks",
      type: "number",
      label: "Durée (semaines)",
      defaultValue: DEFAULT_DURATION_WEEKS,
      min: 1,
      admin: { position: "sidebar", description: "4 = lundi → lundi." },
    },
    {
      name: "endDate",
      type: "date",
      label: "Fin du test",
      admin: {
        position: "sidebar",
        readOnly: true,
        date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" },
        description: "Calculée.",
      },
    },

    // ─── Champs dérivés (stockés pour les colonnes, le tri et les alertes) ────
    { name: "displayName", type: "text", admin: { hidden: true } },
    {
      // Canal de passage : les autres modules y déposent les clés d'étapes à
      // armer (« compte-espace-client », « dossier-demarrage »…). Vidé par
      // armAutoSteps avant écriture — jamais persisté.
      name: "autoSteps",
      type: "json",
      virtual: true,
      admin: { hidden: true },
    },
    { name: "stepsTotal", type: "number", admin: { hidden: true } },
    { name: "stepsDone", type: "number", admin: { hidden: true } },
    { name: "progressPct", type: "number", admin: { hidden: true } },
    { name: "currentStepKey", type: "text", admin: { hidden: true } },
    {
      name: "currentStepLabel",
      type: "text",
      label: "Étape en cours",
      admin: {
        // Colonne de liste utile, mais sans champ dans le formulaire (la barre
        // d'étapes le dit mieux) : un composant vide remplace le champ.
        components: { Field: "/modules/partner/admin/HiddenControl#HiddenControl" },
      },
    },
  ],
};
