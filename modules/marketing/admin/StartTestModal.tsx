"use client";

import { toast } from "@payloadcms/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { MondayPicker } from "@/modules/marketing/admin/MondayPicker";
import { Tooltip } from "@/modules/marketing/admin/Tooltip";
import {
  AUDIENCE_LABEL,
  JOURNEY_ACTORS,
  JOURNEY_PHASES,
  attachEmailsToSteps,
  computeEndDate,
  firstStartableMonday,
  isMonday,
  leadDaysOf,
  prepDaysAvailable,
  stepDueDate,
  stepTooltip,
} from "@/modules/marketing/lib/journey";

/**
 * Démarrage d'une phase de test — le seul endroit d'où l'on enclenche le process.
 *
 * Il demande les deux seules informations que le système ne peut pas deviner :
 * le lundi de démarrage et l'adresse qui recevra tout le parcours. Et il montre
 * immédiatement ce que la date déclenche : les 20 étapes avec leurs échéances
 * calculées. On ne lance pas un process de 4 semaines à l'aveugle.
 *
 * Rendu par PORTAIL sur <body> : à l'intérieur d'une vue Payload, un `z-index`
 * reste prisonnier du contexte d'empilement local et le modal passe SOUS la
 * barre de navigation (même correctif que l'aperçu d'e-mail des tickets).
 */

type JourneyStep = {
  key?: string;
  label?: string;
  actor?: string;
  phase?: string;
  detail?: string;
  anchor?: string;
  offsetDays?: number;
};

type JourneyEmail = {
  key?: string;
  subject?: string;
  audience?: string;
  anchor?: string;
  offsetDays?: number;
  trigger?: string;
  detail?: string;
};

const ACTOR_LABEL: Record<string, string> = Object.fromEntries(
  JOURNEY_ACTORS.map((a) => [a.value, a.label]),
);

const DURATIONS = [2, 4, 6, 8];

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : "—";

const fmtLong = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
    : "—";

const AUDIENCE_TO: Record<string, string> = {
  client: "au contact du client",
  tim: "à TIM, pour validation",
  partenaire: "au partenaire suiveur",
};

/**
 * Infobulle d'un envoi automatique — toujours les mêmes rubriques
 * (destinataire, objet, moment, contenu). Un survol doit répondre seul à
 * « qu'est-ce qui part, à qui, quand, et pour dire quoi ? ».
 */
const mailTooltip = (mail: {
  audience?: string;
  subject?: string;
  trigger?: string;
  detail?: string;
  due?: string | null;
}): string[] => {
  const audience = mail.audience ?? "client";
  const when = mail.trigger?.trim()
    ? mail.trigger
    : mail.due
      ? `Envoyé le ${fmtLong(mail.due)}`
      : "Sans date fixe";

  return [
    `E-mail automatique — ${AUDIENCE_TO[audience] ?? audience}`,
    `Objet : « ${mail.subject ?? "—"} »`,
    `Quand : ${when}`,
    ...(mail.detail ? [mail.detail] : []),
  ];
};

export function StartTestModal({
  client,
  defaultEmail,
  onCancel,
  onDone,
}: {
  client: { id: number | string; companyName?: string };
  defaultEmail?: string;
  onCancel: () => void;
  onDone: (info: { startDate: string }) => void;
}) {
  const [startDate, setStartDate] = useState(firstStartableMonday());
  const [weeks, setWeeks] = useState(4);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [steps, setSteps] = useState<JourneyStep[]>([]);
  const [emails, setEmails] = useState<JourneyEmail[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Les étapes viennent du MODÈLE : si l'équipe en modifie une dans le
  // back-office, l'aperçu suit sans redéploiement.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          "/payload-api/marketing-journeys?where[key][equals]=phase-de-test&limit=1&depth=0",
          { credentials: "include" },
        );
        const doc = res.ok ? (await res.json())?.docs?.[0] : null;
        if (!cancelled) {
          setSteps(doc?.steps ?? []);
          setEmails(doc?.emails ?? []);
          if (doc?.defaultDurationWeeks) setWeeks(doc.defaultDurationWeeks);
        }
      } catch {
        /* aperçu indisponible → le démarrage reste possible */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  /**
   * Délai de préparation exigé par le parcours : le plus grand décalage NÉGATIF
   * des étapes ancrées au démarrage. Lu dans le modèle plutôt qu'écrit en dur —
   * décaler une étape d'avant-test décale automatiquement le premier lundi
   * démarrable.
   */
  const leadDays = useMemo(() => leadDaysOf(steps), [steps]);

  const minStart = useMemo(() => firstStartableMonday(leadDays), [leadDays]);

  // Les étapes arrivent après le premier rendu : la date proposée par défaut
  // suit le délai de préparation. On ne repousse QUE la valeur par défaut —
  // un lundi choisi à la main est un choix, on ne le corrige pas dans son dos.
  const [startTouched, setStartTouched] = useState(false);
  useEffect(() => {
    if (startTouched) return;
    setStartDate((current) => (current && current < minStart ? minStart : current));
  }, [minStart, startTouched]);

  /**
   * Démarrage plus proche que le délai de préparation.
   *
   * Autorisé : c'est une décision commerciale. Mais les étapes d'avant-test
   * seront RESSERRÉES pour tenir dans le temps restant (voir
   * `compressLeadOffsets`, appliqué à l'enregistrement du parcours), et on le
   * dit avant de valider — pas après.
   */
  const prepDays = useMemo(() => prepDaysAvailable(`${startDate}T00:00:00Z`), [startDate]);
  const tight = leadDays > 0 && startDate < minStart;

  const startISO = startDate ? new Date(`${startDate}T00:00:00Z`).toISOString() : null;
  const endISO = computeEndDate(startISO, weeks, 0);
  const mondayOk = isMonday(`${startDate}T00:00:00Z`);
  // Seul un démarrage PASSÉ reste refusé : « démarrer hier » n'a pas de sens.
  const startOk = mondayOk && startDate >= new Date().toISOString().slice(0, 10);
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  const dated = useMemo(
    () =>
      steps.map((s) => ({
        ...s,
        due: stepDueDate({ anchor: s.anchor, offsetDays: s.offsetDays }, startISO, endISO),
      })),
    [steps, startISO, endISO],
  );

  /**
   * Envois rattachés à leur étape : un e-mail listé à part n'aide pas à
   * comprendre le déroulé. Chacun revient donc sur l'étape où il part, signalé
   * par une icône et détaillé au survol.
   */
  const mailsByStep = useMemo(() => {
    const withDate = emails.map((e) => ({
      ...e,
      due: stepDueDate({ anchor: e.anchor, offsetDays: e.offsetDays }, startISO, endISO),
    }));
    return attachEmailsToSteps(dated, withDate);
  }, [emails, dated, startISO, endISO]);

  const mailCount = useMemo(
    () => [...mailsByStep.values()].reduce((n, list) => n + list.length, 0),
    [mailsByStep],
  );

  const confirm = useCallback(async () => {
    if (!startISO || !startOk || !emailOk) return;
    setBusy(true);
    setError(null);
    try {
      // 1. Le modèle actif.
      const jRes = await fetch(
        "/payload-api/marketing-journeys?where[key][equals]=phase-de-test&limit=1&depth=0",
        { credentials: "include" },
      );
      const journeyId = jRes.ok ? (await jRes.json())?.docs?.[0]?.id : null;
      if (!journeyId) throw new Error("Modèle « Phase de test » introuvable.");

      // 2. Le parcours — daté, sauf s'il en existe déjà un ouvert.
      const runRes = await fetch(
        `/payload-api/journey-runs?where[client][equals]=${client.id}&limit=1&depth=0&sort=-createdAt`,
        { credentials: "include" },
      );
      const existing = runRes.ok ? (await runRes.json())?.docs?.[0] : null;
      const open = existing && !["gagne", "perdu", "annule"].includes(existing.status);

      // ⚠ Le parcours est créé AVANT le compte espace client, et attendu.
      // Les deux partaient en parallèle : quand le compte arrivait le premier,
      // le hook qui envoie l'invitation ne trouvait aucun parcours ouvert et
      // renonçait en silence — compte créé, client jamais prévenu.
      const runOut = await (open
        ? fetch(`/payload-api/journey-runs/${existing.id}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ startDate: startISO, durationWeeks: weeks }),
          })
        : fetch("/payload-api/journey-runs", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client: client.id,
              journey: journeyId,
              startDate: startISO,
              durationWeeks: weeks,
            }),
          }));

      if (!runOut.ok) {
        const body = await runOut.json().catch(() => null);
        throw new Error(body?.errors?.[0]?.message || "Création de la phase de test impossible.");
      }

      // 3. L'ADRESSE du parcours — celle qui recevra toute la séquence et les
      //    codes de connexion. On l'enregistre, on n'ouvre RIEN : l'espace
      //    s'ouvre au Go/No-Go de TIM (`active` passe à vrai à ce moment-là, et
      //    c'est ce qui envoie l'invitation). Rien ne part donc à un client que
      //    TIM n'a pas encore accepté.
      const accRes = await fetch(
        `/payload-api/client-portal-accounts?where[client][equals]=${client.id}&limit=1&depth=0`,
        { credentials: "include" },
      );
      const account = accRes.ok ? (await accRes.json())?.docs?.[0] : null;

      const accOut = await (account
        ? fetch(`/payload-api/client-portal-accounts/${account.id}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            // `active` n'est PAS touché : un espace déjà ouvert le reste, un
            // espace en attente du Go continue d'attendre.
            body: JSON.stringify({ email }),
          })
        : fetch("/payload-api/client-portal-accounts", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ client: client.id, email, active: false }),
          }));

      // L'échec n'annule pas la phase de test, mais il ne doit pas passer
      // inaperçu : sans cette adresse, aucun e-mail du parcours n'a de
      // destinataire. Le message part en TOAST et non dans le modal — `onDone`
      // démonte le modal, l'erreur qu'on y affichait n'était jamais lue.
      if (!accOut.ok) {
        const body = await accOut.json().catch(() => null);
        const cause =
          body?.errors?.[0]?.message ||
          (accOut.status === 403
            ? "réservé aux admins"
            : `erreur ${accOut.status}`);
        toast.error(
          `Phase de test créée, mais l'adresse du parcours n'a PAS été enregistrée (${cause}). ` +
            `Aucun e-mail ne partira à ${email} : renseignez-la dans l'onglet « Espace client » de la fiche.`,
          { duration: 15000 },
        );
      }

      onDone({ startDate: startISO });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Démarrage impossible.");
    } finally {
      setBusy(false);
    }
  }, [client.id, email, emailOk, startOk, onDone, startISO, weeks]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="jr-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Démarrer une phase de test"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="jr-modal__panel">
        <header className="jr-modal__head">
          <h3 className="jr-modal__title">
            Démarrer la phase de test — {client.companyName || "ce client"}
          </h3>
          <p className="jr-modal__sub">
            La date pose tout le calendrier du parcours&nbsp;; l&apos;adresse reçoit la séquence
            d&apos;e-mails et les accès à l&apos;espace client.
          </p>
        </header>

        <div className="jr-modal__form">
          <div className="jr-modal__field">
            Démarrage du test
            <MondayPicker
              value={startDate}
              onChange={(next) => {
                setStartTouched(true);
                setStartDate(next);
              }}
              minDate={minStart}
              minReason={
                leadDays > 0
                  ? `Le parcours prévoit ${leadDays} jours de préparation (demande, validation, dossier de démarrage). Un lundi plus proche reste possible : les étapes d'avant-test seront resserrées.`
                  : undefined
              }
            />
            {tight && (
              <p className="jr-modal__warn" role="alert">
                <strong>Préparation réduite à {prepDays} jour{prepDays > 1 ? "s" : ""}</strong> au
                lieu de {leadDays}. Les étapes d&apos;avant-test — demande, validation, dossier de
                démarrage, accès — seront resserrées pour tenir dans ce délai, et aucune ne sera
                datée dans le passé. À vous de vérifier que le client suivra.
              </p>
            )}
          </div>

          <div className="jr-modal__side">
            <label className="jr-modal__field">
              Durée
              <select
                value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value))}
                className="jr-modal__input"
              >
                {DURATIONS.map((w) => (
                  <option key={w} value={w}>
                    {w} semaines
                  </option>
                ))}
              </select>
            </label>

            <label className="jr-modal__field">
              Adresse e-mail du contact
              <input
                type="email"
                value={email}
                placeholder="prenom.nom@entreprise.fr"
                onChange={(e) => setEmail(e.target.value)}
                className="jr-modal__input"
              />
              {!emailOk && email ? (
                <span className="jr-modal__ko">Adresse invalide.</span>
              ) : (
                <span className="jr-modal__hint">
                  Reçoit toute la séquence du test et les codes de connexion. Reprise de la fiche
                  client — corrigez-la si ce n&apos;est pas la bonne personne. L&apos;espace ne
                  s&apos;ouvre qu&apos;à votre Go&nbsp;: rien ne part avant.
                </span>
              )}
            </label>
          </div>
        </div>

        {startISO && (
          <p className="jr-modal__range">
            <strong>{fmtLong(startISO)}</strong> → <strong>{fmtLong(endISO)}</strong>
          </p>
        )}

        {dated.length > 0 && (
          <div className="jr-modal__steps">
            {JOURNEY_PHASES.map((phase) => {
              const rows = dated.filter((s) => s.phase === phase.value);
              if (!rows.length) return null;
              return (
                <section key={phase.value}>
                  <h4 className="jr-modal__phase">{phase.label}</h4>
                  <ol className="jr-modal__list">
                    {rows.map((s, i) => {
                      const mails = (s.key && mailsByStep.get(s.key)) || [];
                      return (
                        <li key={s.key ?? i} className="jr-modal__step">
                          <span className="jr-modal__step-main">
                            <span className="jr-modal__step-label">{s.label}</span>
                            {/* Le détail n'est affiché qu'avant le test : c'est là
                                que le client doit comprendre ce qu'on attend de lui
                                et ce qui partira automatiquement. */}
                            {phase.value === "avant-test" && s.detail && (
                              <span className="jr-modal__step-detail">{s.detail}</span>
                            )}
                          </span>

                          {/* Envois et responsable réunis dans une même colonne :
                              la date reste ainsi seule à droite, alignée d'une
                              ligne à l'autre quel que soit leur nombre. */}
                          <span className="jr-modal__step-meta">
                            {mails.map((m, j) => (
                              <Tooltip
                                key={m.key ?? j}
                                content={mailTooltip(m)}
                                className={`jr-mail jr-mail--${m.audience ?? "client"}`}
                              >
                                <span aria-hidden>✉</span>
                                <span className="jr-mail__who">
                                  {AUDIENCE_LABEL[m.audience ?? "client"]}
                                </span>
                              </Tooltip>
                            ))}

                            {s.actor && (
                              <Tooltip
                                content={stepTooltip(s)}
                                className={`jr-step__actor jr-step__actor--${s.actor}`}
                              >
                                {ACTOR_LABEL[s.actor] ?? s.actor}
                              </Tooltip>
                            )}
                          </span>

                          <span className="jr-modal__step-date">{fmt(s.due)}</span>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            })}
            <p className="jr-modal__count">
              {dated.length} étapes, toutes obligatoires · {mailCount} e-mails envoyés
              automatiquement (✉ — survolez pour le détail). Aucune relance commerciale
              automatique&nbsp;: c&apos;est le partenaire qui les fait en direct.
            </p>
          </div>
        )}

        {error && (
          <p className="jr-modal__error" role="alert">
            {error}
          </p>
        )}

        <footer className="jr-modal__actions">
          <button type="button" className="jr-btn jr-btn--ghost" onClick={onCancel}>
            Annuler
          </button>
          <button
            type="button"
            className="jr-btn"
            disabled={busy || !startOk || !emailOk}
            onClick={() => void confirm()}
          >
            {busy ? "Démarrage…" : "Démarrer la phase de test"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
