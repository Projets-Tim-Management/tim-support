"use client";

import { useAuth, useConfig, useDocumentInfo, useForm, useFormFields } from "@payloadcms/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import { hasAdminRole } from "@/core/access";
import { EmailPreview } from "@/modules/marketing/admin/EmailPreview";
import { MailDateEditor } from "@/modules/marketing/admin/MailDateEditor";
import { Tooltip } from "@/modules/marketing/admin/Tooltip";
import { useSaveAfterDispatch } from "@/modules/marketing/admin/useSaveAfterDispatch";
import { raisonSansObjet } from "@/modules/marketing/lib/due-emails";
import {
  AUDIENCE_LABEL,
  allowComputedDate,
  STEP_VALIDATION_EFFECT,
  SYSTEM_STEPS,
  attachEmailsToSteps,
  computeEmailSchedule,
  mailDateWindow,
  JOURNEY_ACTORS,
  JOURNEY_PHASES,
  computeEndDate,
  isStepDone,
  isStepPending,
  isAdminStep,
  runStatusMeta,
  stepDueDate,
  stepTooltip,
} from "@/modules/marketing/lib/journey";

/**
 * Barre d'étapes d'une phase de test — l'écran principal de la fiche.
 *
 * Les étapes sont OBLIGATOIRES et SÉQUENTIELLES : une seule est « à valider »
 * à un instant donné (la première non faite), et seule la dernière validée peut
 * être annulée. C'est ce qui garantit qu'un parcours ne saute jamais une étape —
 * la règle est ici, dans le seul endroit où l'on coche.
 *
 * Les échéances sont recalculées EN DIRECT depuis la date de démarrage et la
 * durée saisies dans le formulaire (et non depuis `endDate`, qui n'est à jour
 * qu'après enregistrement) : changer la durée déplace immédiatement toutes les
 * dates affichées.
 */

/** Coche — « c'est fait ». */
const IconCheck = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8.5l3.5 3.5L13 4.5" />
  </svg>
);

/** Flèche de retour — « revenir en arrière », plutôt qu'une croix qui dirait « supprimer ». */
const IconUndo = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none"
       stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3.5L3 6.5l3 3" />
    <path d="M3 6.5h5.5a3.5 3.5 0 110 7H7" />
  </svg>
);

const ACTOR_LABEL: Record<string, string> = Object.fromEntries(
  JOURNEY_ACTORS.map((a) => [a.value, a.label]),
);

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : null;

/**
 * « 1h26 » / « 26 min » — compact à dessein : ce texte partage une colonne
 * étroite avec les dates, et « auto dans 1 h 26 » débordait sur les boutons.
 * Le sens complet est dans l'infobulle.
 */
const countdown = (iso: string, nowMs: number): string => {
  const mins = Math.max(0, Math.round((Date.parse(iso) - nowMs) / 60_000));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}`;
};

const fmtFullDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
    : null;

/**
 * Minuit d'aujourd'hui (UTC), lu APRÈS le montage : une date « maintenant »
 * calculée pendant le rendu est impure et diverge entre serveur et client.
 * Tant qu'elle n'est pas connue, aucune étape n'est marquée en retard.
 */
const useToday = (): number | null => {
  const [today, setToday] = useState<number | null>(null);
  useEffect(() => {
    const now = new Date();
    setToday(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  }, []);
  return today;
};

type MailView = {
  /** Position dans le tableau `emails` du formulaire — clé de l'écriture. */
  index: number;
  key: string;
  subject: string;
  audience: string;
  stepKey?: string;
  anchor?: string;
  offsetDays?: number;
  scheduledAt?: string | null;
  sendHour?: string | null;
  overridden?: boolean;
  sentAt?: string | null;
  trigger?: string;
};

type StepView = {
  index: number;
  key: string;
  label: string;
  actor?: string;
  phase?: string;
  detail?: string;
  anchor?: string;
  offsetDays?: number;
  state: string;
  doneAt?: string | null;
  autoAt?: string | null;
  autoValidate?: boolean;
};

export function JourneyStepper() {
  const { user } = useAuth();
  const { config } = useConfig();
  const adminRoute = config.routes.admin;
  const { id: docId } = useDocumentInfo();
  const { dispatchFields } = useForm();
  const saveNow = useSaveAfterDispatch();
  const today = useToday();
  // Les étapes dont TIM est l'acteur ne sont actionnables que par un admin.
  // Le serveur refuse de toute façon (guardAdminSteps) ; ici on évite de
  // proposer un bouton qui produirait une erreur.
  const isAdmin = hasAdminRole(user);

  // Horloge minute par minute : sans elle, « dans 1 h 47 » resterait figé et
  // une étape échue continuerait de s'afficher en attente.
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    setNowMs(Date.now());
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  /**
   * Lecture de l'état du formulaire. Payload aplatit les tableaux en chemins
   * (`steps.0.key`, `steps.0.state`…) : on remonte les lignes tant qu'une clé
   * existe, plutôt que de dépendre de la structure interne des `rows`.
   */
  const { steps, mails, startDate, sessionAt, durationWeeks, extraDays, status, clientId } =
    useFormFields(([fields]) => {
    const collected: StepView[] = [];
    for (let i = 0; fields[`steps.${i}.key`] !== undefined; i += 1) {
      collected.push({
        index: i,
        key: String(fields[`steps.${i}.key`]?.value ?? ""),
        label: String(fields[`steps.${i}.label`]?.value ?? ""),
        actor: fields[`steps.${i}.actor`]?.value as string | undefined,
        phase: fields[`steps.${i}.phase`]?.value as string | undefined,
        detail: fields[`steps.${i}.detail`]?.value as string | undefined,
        anchor: fields[`steps.${i}.anchor`]?.value as string | undefined,
        offsetDays: fields[`steps.${i}.offsetDays`]?.value as number | undefined,
        state: String(fields[`steps.${i}.state`]?.value ?? "a-faire"),
        doneAt: fields[`steps.${i}.doneAt`]?.value as string | undefined,
        autoAt: fields[`steps.${i}.autoAt`]?.value as string | undefined,
        autoValidate: Boolean(fields[`steps.${i}.autoValidate`]?.value),
      });
    }

    const mails: MailView[] = [];
    for (let i = 0; fields[`emails.${i}.key`] !== undefined; i += 1) {
      mails.push({
        index: i,
        key: String(fields[`emails.${i}.key`]?.value ?? ""),
        subject: String(fields[`emails.${i}.subject`]?.value ?? ""),
        audience: (fields[`emails.${i}.audience`]?.value as string) ?? "client",
        stepKey: fields[`emails.${i}.stepKey`]?.value as string | undefined,
        anchor: fields[`emails.${i}.anchor`]?.value as string | undefined,
        offsetDays: fields[`emails.${i}.offsetDays`]?.value as number | undefined,
        scheduledAt: fields[`emails.${i}.scheduledAt`]?.value as string | undefined,
        sendHour: fields[`emails.${i}.sendHour`]?.value as string | undefined,
        overridden: Boolean(fields[`emails.${i}.overridden`]?.value),
        sentAt: fields[`emails.${i}.sentAt`]?.value as string | undefined,
        trigger: fields[`emails.${i}.trigger`]?.value as string | undefined,
      });
    }

    let extra = 0;
    for (let i = 0; fields[`extensions.${i}.days`] !== undefined; i += 1) {
      extra += Number(fields[`extensions.${i}.days`]?.value ?? 0);
    }

    return {
      steps: collected,
      mails,
      startDate: (fields.startDate?.value as string | undefined) ?? null,
      // Le rappel de la veille s'ancre sur le créneau : sans cette date, son
      // échéance calculée serait vide et le « rétablir » l'effacerait.
      sessionAt: (fields.sessionAt?.value as string | undefined) ?? null,
      durationWeeks: Number(fields.durationWeeks?.value ?? 0) || null,
      extraDays: extra,
      status: (fields.status?.value as string | undefined) ?? "preparation",
      // Sert les renvois « le geste se fait sur la fiche client ».
      clientId: (fields.client?.value as number | string | undefined) ?? null,
    };
  });

  const clientHref = clientId != null ? `${adminRoute}/collections/partner-clients/${clientId}` : null;

  /**
   * L'état du dossier de démarrage, lu sur la FICHE CLIENT.
   *
   * On pourrait le déduire de l'étape « Dossier de démarrage complété », qui est
   * dans le formulaire — mais elle se valide aussi à la main, et une étape
   * cochée par avance ferait dire à l'écran qu'une relance est sans objet alors
   * que le cron l'enverra. La condition d'envoi se lit à sa source.
   */
  const [onboardingStatus, setOnboardingStatus] = useState<string | null>(null);
  useEffect(() => {
    if (clientId == null) return;
    let annule = false;
    fetch(`/payload-api/partner-clients/${clientId}?depth=0&select[onboardingStatus]=true`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => !annule && setOnboardingStatus((j?.onboardingStatus as string) ?? null))
      // Sans cette lecture, les relances gardent leur affichage habituel : une
      // information manquante ne doit pas se transformer en « sans objet ».
      .catch(() => undefined);
    return () => {
      annule = true;
    };
  }, [clientId]);

  /**
   * Les envois que le cron écartera, et pourquoi.
   *
   * Même table que lui (RAISON_SANS_OBJET) : « réservez votre session » face à
   * une session déjà calée ne part pas, et la barre d'étapes l'annonçait
   * pourtant comme un envoi automatique à venir.
   */
  const sansObjet = useMemo(() => {
    const facts = { sessionAt, onboardingStatus };
    const out: Record<string, string> = {};
    for (const m of mails) {
      if (m.sentAt) continue; // déjà dans la boîte du client : c'est un fait.
      const raison = raisonSansObjet(m.key, facts);
      if (raison) out[m.key] = raison;
    }
    return out;
  }, [mails, sessionAt, onboardingStatus]);

  // Envois rattachés à leur étape : par `stepKey` s'il est déclaré, sinon par
  // la date. Même règle que l'aperçu du modal de démarrage.
  const datedSteps = useMemo(
    () =>
      steps.map((s) => ({
        key: s.key,
        // `sessionAt` n'est pas optionnel ici : « Session de prise en main
        // réalisée » s'ancre dessus. Sans lui, elle n'aurait jamais d'échéance.
        due: stepDueDate(s, startDate, computeEndDate(startDate, durationWeeks, extraDays), sessionAt),
      })),
    [steps, startDate, durationWeeks, extraDays, sessionAt],
  );

  const mailsByStep = useMemo(
    () =>
      attachEmailsToSteps(
        datedSteps,
        mails.map((m) => ({ ...m, due: m.scheduledAt ?? null })),
      ),
    [datedSteps, mails],
  );

  const [preview, setPreview] = useState<string | null>(null);
  const endDate = computeEndDate(startDate, durationWeeks, extraDays);
  // Même règle que le serveur (isStepDone) : une étape en validation automatique
  // dont le délai est écoulé compte comme faite, sans réenregistrement.
  const doneCount = steps.filter((s) => isStepDone(s)).length;
  const currentIndex = steps.findIndex((s) => !isStepDone(s));
  const lastDoneIndex = currentIndex === -1 ? steps.length - 1 : currentIndex - 1;
  const closed = status === "gagne" || status === "perdu" || status === "annule";

  /** Coche (ou décoche) une étape, puis enregistre : un clic = un état persisté. */
  const setStep = useCallback(
    (index: number, done: boolean) => {
      const write = (path: string, value: unknown) =>
        dispatchFields({ type: "UPDATE", path, value });

      write(`steps.${index}.state`, done ? "fait" : "a-faire");
      write(`steps.${index}.doneAt`, done ? new Date().toISOString() : null);
      write(`steps.${index}.doneBy`, done ? ((user as { id?: unknown })?.id ?? null) : null);

      // Enregistrement immédiat : sans ça, cocher une étape puis quitter la
      // page la perdrait silencieusement. Décalé d'un rendu — sinon la
      // modification qu'on vient d'écrire n'est pas encore dans l'état du
      // formulaire et le document part inchangé (voir useSaveAfterDispatch).
      saveNow();
    },
    [dispatchFields, saveNow, user],
  );

  /**
   * Change la date d'un envoi. Fixer une date la détache du calendrier : sans
   * ça, la reprise en main ne survivrait pas au premier changement de durée.
   */
  const setMailDate = useCallback(
    (index: number, at: string | null, overridden: boolean) => {
      dispatchFields({ type: "UPDATE", path: `emails.${index}.scheduledAt`, value: at });
      dispatchFields({ type: "UPDATE", path: `emails.${index}.overridden`, value: overridden });
      saveNow();
    },
    [dispatchFields, saveNow],
  );

  if (steps.length === 0) {
    return (
      <div className="jr-stepper jr-stepper--empty">
        <p>
          Choisissez un client et un parcours, puis <strong>enregistrez</strong> : les étapes seront
          copiées ici depuis le modèle.
        </p>
      </div>
    );
  }

  const statusMeta = runStatusMeta(status);

  return (
    <div className="jr-stepper">
      <header className="jr-stepper__head">
        <div className="jr-stepper__title">
          {statusMeta && (
            <span
              className="tim-status-pill"
              style={{ background: statusMeta.bg, color: statusMeta.color }}
            >
              {statusMeta.label}
            </span>
          )}
          <span className="jr-stepper__dates">
            {startDate ? (
              <>
                {fmtFullDate(startDate)} → {fmtFullDate(endDate)}
              </>
            ) : (
              <em>Date de démarrage à définir (un lundi)</em>
            )}
          </span>
        </div>
        <div className="jr-stepper__progress">
          <div className="jr-stepper__bar">
            <span style={{ width: `${Math.round((doneCount / steps.length) * 100)}%` }} />
          </div>
          <span className="jr-stepper__count">
            {doneCount}/{steps.length} étapes
          </span>
        </div>
      </header>

      {JOURNEY_PHASES.map((phase) => {
        const rows = steps.filter((s) => s.phase === phase.value);
        if (rows.length === 0) return null;

        return (
          <section key={phase.value} className="jr-phase">
            <h4 className="jr-phase__title">{phase.label}</h4>
            <ol className="jr-phase__list">
              {rows.map((step) => {
                const isDone = isStepDone(step, nowMs ?? 0);
                const pending = nowMs != null && isStepPending(step, nowMs);
                const isCurrent = step.index === currentIndex;
                // Une étape constatée par le système ne se coche pas à la main :
                // le clic ne ferait pas le geste attendu (créer l'accès, générer
                // les identifiants…), il se contenterait de le déclarer fait.
                const system = step.key ? SYSTEM_STEPS[step.key] : undefined;
                const canUndo = isDone && step.index === lastDoneIndex && !system;
                const locked = isAdminStep(step) && !isAdmin;
                const due = stepDueDate(step, startDate, endDate, sessionAt);
                const late = !isDone && due != null && today != null && Date.parse(due) < today;

                const stepMails = step.key ? (mailsByStep.get(step.key) ?? []) : [];
                // Les envois déclenchés par un événement (connexion à l'espace
                // client, dossier transmis…) n'ont pas de date à régler : leur
                // proposer un champ laisserait croire à un oubli.
                const datedMails = stepMails.filter((m) => m.anchor && m.anchor !== "aucun");

                return (
                  <li
                    key={step.key || step.index}
                    className={[
                      "jr-step",
                      isDone && "jr-step--done",
                      pending && "jr-step--pending",
                      isCurrent && "jr-step--current",
                      !isDone && !isCurrent && "jr-step--todo",
                      late && "jr-step--late",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span className="jr-step__mark">{isDone ? "✔" : step.index + 1}</span>

                    <span className="jr-step__main">
                      {/* Le détail n'est visible qu'au survol pour les étapes
                          repliées : l'infobulle évite d'avoir à cliquer partout
                          pour savoir à quoi une ligne correspond. */}
                      <Tooltip
                        className="jr-step__label"
                        content={stepTooltip({ ...step, due })}
                      >
                        {step.label}
                      </Tooltip>
                      {step.detail && <span className="jr-step__detail">{step.detail}</span>}

                      {/* Étape constatée, fait pas encore constaté : au lieu
                          d'un bouton qui mentirait, le RENVOI vers le geste qui
                          la coche. Il vit DANS la ligne et non dans la colonne
                          des boutons, calibrée pour deux icônes : « Ouvrir
                          l'accès → » y débordait par-dessus l'échéance. */}
                      {/* Affiché sur TOUTE étape constatée non acquise, et plus
                          seulement sur l'étape en cours : quand le parcours
                          bloque plus haut, on doit quand même pouvoir voir ce
                          qu'attend une étape plus bas — et aller le faire. */}
                      {!closed && !pending && !isDone && system && (
                        <Tooltip
                          className="jr-step__todo"
                          interactive
                          content={[
                            `Se coche ${system.trigger}`,
                            system.action?.hint ??
                              system.wait ??
                              "Rien à valider ici : le système constate cette étape lui-même.",
                            ...(system.wait && system.action
                              ? [`En attente : ${system.wait.toLowerCase()}.`]
                              : []),
                          ]}
                        >
                          {system.action && !locked ? (
                            system.action.on === "client" && clientHref ? (
                              <a className="jr-step__todo-link" href={clientHref}>
                                {system.action.label} →
                              </a>
                            ) : (
                              <span className="jr-step__todo-tag">{system.action.label}</span>
                            )
                          ) : (
                            <span className="jr-step__todo-tag jr-step__todo-tag--wait">
                              {system.wait ? `En attente : ${system.wait}` : "Validation automatique"}
                            </span>
                          )}
                        </Tooltip>
                      )}
                    </span>

                    {/* Enveloppes : voir le message exact qui partira. La date,
                        elle, vit dans la colonne des échéances — voir plus bas. */}
                    <span className="jr-step__mails">
                      {stepMails.map((m) => (
                        <Tooltip
                          key={m.key}
                          interactive
                          content={[
                            sansObjet[m.key]
                              ? "Ne partira pas"
                              : m.sentAt
                                ? "E-mail envoyé"
                                : m.stepKey
                                  ? "E-mail automatique"
                                  : "Accompagnement",
                            `À ${AUDIENCE_LABEL[m.audience ?? "client"] ?? "—"} — « ${m.subject} »`,
                            // Un envoi sans étape déclarée n'est pas attaché à
                            // CETTE étape : il se range sous celle que sa date
                            // précède. Le dire évite de chercher un lien qui
                            // n'existe pas — « Le suivi de chantier, en 3 clics »
                            // n'a rien à voir avec « Accès distribués ».
                            !m.stepKey && !sansObjet[m.key]
                              ? "Message calé sur une date, pas sur cette étape."
                              : sansObjet[m.key]
                                ? `Sans objet : ${sansObjet[m.key]}.`
                                : "Cliquer pour voir le message exact qui part.",
                          ]}
                        >
                          <button
                            type="button"
                            aria-label={`Voir l'e-mail « ${m.subject} »`}
                            className={`jr-mailbtn jr-mailbtn--${m.audience ?? "client"}${m.sentAt ? " jr-mailbtn--sent" : ""}${sansObjet[m.key] ? " jr-mailbtn--moot" : ""}${!m.stepKey ? " jr-mailbtn--free" : ""}`}
                            onClick={() => setPreview(m.key)}
                          >
                            <span aria-hidden>✉</span>
                          </button>
                        </Tooltip>
                      ))}
                    </span>

                    <span className="jr-step__who">
                      {step.actor && (
                        <Tooltip
                          className={`jr-step__actor jr-step__actor--${step.actor}`}
                          content={stepTooltip({ ...step, due })}
                        >
                          {ACTOR_LABEL[step.actor] ?? step.actor}
                        </Tooltip>
                      )}
                      {locked && !isDone && (
                        <Tooltip
                          className="jr-step__locked"
                          content={[
                            "Réservé à l'équipe TIM",
                            "Cette étape engage TIM vis-à-vis du client : seul un admin peut la valider.",
                          ]}
                        >
                          réservé
                        </Tooltip>
                      )}
                    </span>

                    <span className="jr-step__when">
                      {pending && step.autoAt && nowMs != null ? (
                        <Tooltip
                          className="jr-step__auto"
                          content={[
                            "Validation automatique",
                            `Déclenchée ${SYSTEM_STEPS[step.key]?.trigger ?? "par le système"}.`,
                            "Annulable jusqu'à l'échéance ; ensuite l'étape est acquise.",
                          ]}
                        >
                          auto {countdown(step.autoAt, nowMs)}
                        </Tooltip>
                      ) : isDone ? (
                        fmtDate(step.doneAt)
                      ) : datedMails.length > 0 ? (
                        // L'étape porte un envoi daté : sa date d'envoi EST son
                        // échéance. Afficher les deux donnait deux dates pour la
                        // même chose — celle-ci a l'avantage d'être modifiable.
                        datedMails.map((m) => {
                          // Date que le calendrier produirait sans dérogation :
                          // c'est la cible du « rétablir », heure comprise.
                          const computedAt =
                            computeEmailSchedule(
                              [{ ...m, overridden: false }],
                              startDate,
                              endDate,
                              sessionAt,
                            )[0]?.scheduledAt ?? null;
                          return (
                            <MailDateEditor
                              key={m.key}
                              subject={m.subject}
                              scheduledAt={m.scheduledAt}
                              overridden={m.overridden}
                              sentAt={m.sentAt}
                              sansObjet={sansObjet[m.key]}
                              readOnly={closed}
                              computedAt={computedAt}
                              /**
                               * Bornée par les étapes voisines de SON étape —
                               * celle qu'il déclare, pas celle sous laquelle il
                               * s'affiche : c'est la seule que le serveur fera
                               * respecter. Un envoi sans étape déclarée n'est
                               * borné par rien, ici comme là-bas.
                               *
                               * Élargie à sa date calculée : la fenêtre borne un
                               * déplacement, elle ne rend pas illégal ce que le
                               * parcours a lui-même programmé.
                               */
                              window={allowComputedDate(
                                mailDateWindow(m.stepKey ?? null, datedSteps),
                                computedAt,
                              )}
                              onChange={(at, ov) => setMailDate(m.index, at, ov)}
                            />
                          );
                        })
                      ) : due ? (
                        // Le retard est signalé par la COULEUR (jr-step--late) :
                        // répéter « en retard » doublait la largeur de la colonne
                        // pour une information déjà lisible d'un coup d'œil.
                        fmtDate(due)
                      ) : null}
                    </span>

                    <span className="jr-step__action">
                      {/* Pendant la fenêtre : on peut acter tout de suite, ou
                          renoncer. Passé le délai, l'étape rejoint les autres.
                          Renoncer n'est proposé que si le geste est REFAISABLE —
                          sinon l'étape resterait à faire sans moyen de la faire. */}
                      {!closed && !locked && pending && (
                        <>
                          {(!system || system.action) && (
                            <Tooltip
                              interactive
                              content={[
                                "Annuler la validation automatique",
                                "L'étape repasse « à faire » et ne se cochera pas toute seule.",
                              ]}
                            >
                              <button
                                type="button"
                                aria-label="Annuler la validation automatique"
                                className="jr-icon-btn jr-icon-btn--undo"
                                onClick={() => setStep(step.index, false)}
                              >
                                <IconUndo />
                              </button>
                            </Tooltip>
                          )}
                          <Tooltip
                            interactive
                            content={["Valider maintenant", "Sans attendre la fin du délai."]}
                          >
                            <button
                              type="button"
                              aria-label="Valider maintenant"
                              className="jr-icon-btn jr-icon-btn--ok"
                              onClick={() => setStep(step.index, true)}
                            >
                              <IconCheck />
                            </button>
                          </Tooltip>
                        </>
                      )}

                      {/* Étape humaine : le clic EST la déclaration. Le libellé
                          dit laquelle — « je l'ai fait » n'a pas le même sens
                          que « le client me l'a confirmé ». */}
                      {!closed && !locked && !pending && !system && isCurrent && (
                        <Tooltip
                          interactive
                          content={[
                            step.actor === "client"
                              ? "Confirmer que le client l'a fait"
                              : "Déclarer cette étape faite",
                            step.actor === "client"
                              ? "Vous constatez ce que le client vous a dit ; rien ne lui est envoyé."
                              : "Enregistrée immédiatement.",
                            ...(step.key && STEP_VALIDATION_EFFECT[step.key]
                              ? [STEP_VALIDATION_EFFECT[step.key]]
                              : []),
                          ]}
                        >
                          <button
                            type="button"
                            aria-label={
                              step.actor === "client"
                                ? "Confirmer que le client l'a fait"
                                : "Déclarer cette étape faite"
                            }
                            className="jr-icon-btn jr-icon-btn--ok"
                            onClick={() => setStep(step.index, true)}
                          >
                            <IconCheck />
                          </button>
                        </Tooltip>
                      )}
                      {!closed && !locked && !pending && canUndo && (
                        <Tooltip
                          interactive
                          content={[
                            "Annuler cette validation",
                            "Seule la dernière étape validée peut être annulée.",
                          ]}
                        >
                          <button
                            type="button"
                            aria-label="Annuler cette validation"
                            className="jr-icon-btn jr-icon-btn--undo"
                            onClick={() => setStep(step.index, false)}
                          >
                            <IconUndo />
                          </button>
                        </Tooltip>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}

      {preview && docId && (
        <EmailPreview runId={docId} emailKey={preview} onClose={() => setPreview(null)} />
      )}

      <p className="jr-stepper__note">
        Les étapes se valident dans l'ordre : seule l'étape en cours est actionnable, et seule la
        dernière validée peut être annulée. On ne coche QUE ce qu'on a fait soi-même — les étapes
        que le logiciel constate (accès ouvert, identifiants créés, dossier transmis, signature
        enregistrée) n'ont pas de bouton : elles renvoient vers le geste qui les coche, puis se
        valident seules après 2 h, le temps de revenir en arrière si besoin.
      </p>
    </div>
  );
}
