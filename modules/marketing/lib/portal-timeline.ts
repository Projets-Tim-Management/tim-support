/**
 * Où en est une phase de test dans le temps, du point de vue du client.
 *
 * Sorti de la page pour deux raisons. La première est une règle du projet :
 * `react-hooks/purity` interdit `Date.now()` dans un composant, et nous la
 * respectons. La seconde vaut mieux que la première — un calcul de dates avec
 * des bornes, des divisions et des arrondis se teste, alors qu'un calcul noyé
 * dans du JSX ne se teste jamais.
 *
 * L'heure est un PARAMÈTRE : c'est ce qui permet de rejouer « la veille du
 * démarrage » ou « le dernier jour » sans attendre la date réelle.
 */

import { stepDueDate } from "@/modules/marketing/lib/journey";

const DAY_MS = 86_400_000;

export type TestTimeline = {
  /** Sans les deux dates, l'écran n'affiche pas de frise du tout. */
  hasDates: boolean;
  started: boolean;
  finished: boolean;
  /** Position du curseur sur la frise, bornée à [0, 100]. */
  elapsedPct: number;
  /** Jours restants avant le démarrage (0 = c'est aujourd'hui). */
  daysToStart: number;
  /** « Jour 4 sur 28 » — 1 le jour du démarrage, jamais 0. */
  dayOfTest: number;
  totalDays: number;
};

export const testTimeline = (
  run: { startDate?: string | null; endDate?: string | null } | undefined | null,
  nowMs: number = Date.now(),
): TestTimeline => {
  const start = run?.startDate ? Date.parse(run.startDate) : NaN;
  const end = run?.endDate ? Date.parse(run.endDate) : NaN;
  const hasDates = Number.isFinite(start) && Number.isFinite(end) && end > start;

  if (!hasDates) {
    return {
      hasDates: false,
      started: false,
      finished: false,
      elapsedPct: 0,
      daysToStart: 0,
      dayOfTest: 0,
      totalDays: 0,
    };
  }

  // Borné des deux côtés : un test terminé depuis trois semaines afficherait
  // sinon un curseur au-delà de la fin, et un test à venir un curseur négatif.
  const elapsedPct = Math.min(100, Math.max(0, ((nowMs - start) / (end - start)) * 100));

  return {
    hasDates: true,
    started: nowMs >= start,
    finished: nowMs >= end,
    elapsedPct,
    // `ceil` : tant qu'il reste ne serait-ce qu'une heure, il reste « 1 jour ».
    daysToStart: Math.max(0, Math.ceil((start - nowMs) / DAY_MS)),
    dayOfTest: Math.max(1, Math.floor((nowMs - start) / DAY_MS) + 1),
    totalDays: Math.round((end - start) / DAY_MS),
  };
};

/**
 * Les jalons que le CLIENT doit voir venir, placés sur la frise.
 *
 * Le parcours date déjà chacune de ses vingt étapes ; l'espace client n'en
 * montrait aucune. Or ce qu'un client veut savoir tient en une ligne : qu'est-ce
 * qui m'attend, et quand. On ne reprend donc pas les vingt étapes — la plupart
 * sont internes à TIM — mais les six qui le concernent, avec une explication
 * écrite POUR LUI (le `detail` des étapes s'adresse à l'équipe).
 *
 * La frise ne va pas du démarrage à la fin mais de la PRÉPARATION à la fin :
 * réserver son créneau et transmettre son dossier tombent avant le démarrage,
 * les placer sur une échelle qui commence au démarrage les rejetterait hors du
 * cadre — c'est-à-dire hors de vue, exactement ce qu'on veut éviter.
 */

/** Ce que chaque jalon signifie pour le client, dans ses mots. */
const MILESTONE_HINTS: Record<string, { label: string; hint: string }> = {
  "rdv-prise-en-main": {
    label: "Session de prise en main",
    hint: "45 minutes avec votre interlocuteur, avant le démarrage. On y forme l'administrateur de votre compte, celui qui pilotera TIM au quotidien.",
  },
  "dossier-demarrage": {
    label: "Dossier à transmettre",
    hint: "Dernier moment pour nous transmettre salariés, chantiers et matériel : c'est ce qui nous permet de préparer vos accès à temps.",
  },
  debut: {
    label: "Démarrage du test",
    hint: "Vos équipes commencent à pointer avec TIM. Les accès sont distribués, la session de prise en main est passée.",
  },
  "remise-acces": {
    label: "Accès distribués",
    hint: "Vous remettez leurs identifiants à vos utilisateurs — un par personne, à imprimer ou à envoyer depuis votre espace.",
  },
  bilan: {
    label: "Bilan du test",
    hint: "Point avec votre interlocuteur : ce qui a marché, ce qui manque, et la suite que vous souhaitez donner.",
  },
  fin: {
    label: "Fin du test",
    hint: "Terme de la période d'essai. C'est à vous de décider : continuer, prolonger, ou en rester là.",
  },
};

export type Milestone = {
  key: string;
  label: string;
  hint: string;
  date: string;
  /** Position sur la frise, en pourcentage de la période affichée. */
  pct: number;
  /** Sa date est passée. */
  past: boolean;
  /**
   * Le FAIT est acquis : créneau réservé, dossier transmis, accès créés.
   *
   * Distinct de `past`, et c'est tout l'intérêt : un jalon daté du 26 reste gris
   * jusqu'au 26 même si le client l'a fait le 20. La frise semblait alors figée
   * alors qu'il venait de tout remplir — elle mesurait le temps, pas l'avancement.
   */
  done: boolean;
  /** Sa date est passée SANS que le fait soit acquis : c'est un retard. */
  late: boolean;
  /** Le prochain jalon à faire — le seul qu'on met en avant. */
  next: boolean;
};

/**
 * Ce que le client a déjà accompli, pour les jalons dont la date ne suffit pas
 * à décider. Le parcours porte le créneau ; le reste vit sur la fiche client.
 */
export type PortalFacts = {
  dossierDone?: boolean;
  credentialsReady?: boolean;
};

export type PortalTimeline = TestTimeline & {
  /** Position du curseur « aujourd'hui » sur la période AFFICHÉE. */
  cursorPct: number;
  milestones: Milestone[];
  /**
   * La session de prise en main est-elle DERRIÈRE nous ?
   *
   * Réserver n'est pas avoir suivi : entre l'heure du rendez-vous et la
   * validation du formateur, le client a fait sa part et attend. L'écran doit
   * pouvoir le dire, plutôt que de laisser croire à un blocage de son côté.
   */
  sessionPast: boolean;
};

type RunLike = {
  startDate?: string | null;
  endDate?: string | null;
  sessionAt?: string | null;
  steps?: { key?: string | null; anchor?: string | null; offsetDays?: number | null }[] | null;
};

export const portalTimeline = (
  run: RunLike | undefined | null,
  nowMs: number = Date.now(),
  facts: PortalFacts = {},
): PortalTimeline => {
  const base = testTimeline(run, nowMs);
  const sessionAt = run?.sessionAt ? Date.parse(run.sessionAt) : NaN;
  const sessionPast = Number.isFinite(sessionAt) && sessionAt < nowMs;

  if (!base.hasDates || !run?.startDate || !run?.endDate) {
    return { ...base, cursorPct: 0, milestones: [], sessionPast };
  }

  const start = Date.parse(run.startDate);
  const end = Date.parse(run.endDate);

  // Date de chaque jalon : celle de l'étape du parcours, sauf le créneau de
  // prise en main, dont l'heure RÉELLE prime dès qu'il est réservé.
  const steps = run.steps ?? [];
  const dated: { key: string; at: number }[] = [];

  for (const key of ["rdv-prise-en-main", "dossier-demarrage", "remise-acces", "bilan"]) {
    const step = steps.find((s) => s.key === key);
    if (!step) continue;
    const iso =
      key === "rdv-prise-en-main" && run.sessionAt
        ? run.sessionAt
        : stepDueDate(step, run.startDate, run.endDate);
    const at = iso ? Date.parse(iso) : NaN;
    if (Number.isFinite(at)) dated.push({ key, at });
  }
  dated.push({ key: "debut", at: start }, { key: "fin", at: end });

  // La frise couvre la préparation ET le test : elle commence au premier jalon
  // s'il précède le démarrage, jamais après.
  const rangeStart = Math.min(start, ...dated.map((d) => d.at));
  const rangeEnd = end;
  const span = rangeEnd - rangeStart;
  const pctOf = (at: number) =>
    span > 0 ? Math.min(100, Math.max(0, ((at - rangeStart) / span) * 100)) : 0;

  const sorted = dated.sort((a, b) => a.at - b.at);

  // Ce qui rend un jalon acquis. Sans fait connu, sa date fait foi : le
  // démarrage, le bilan et la fin arrivent, ils ne se font pas.
  const isDone = (key: string, at: number): boolean => {
    if (key === "rdv-prise-en-main") return Boolean(run.sessionAt);
    if (key === "dossier-demarrage") return Boolean(facts.dossierDone);
    if (key === "remise-acces") return Boolean(facts.credentialsReady);
    return at <= nowMs;
  };

  const nextKey = sorted.find((d) => !isDone(d.key, d.at))?.key;

  const milestones: Milestone[] = sorted.map((d) => {
    const done = isDone(d.key, d.at);
    return {
      key: d.key,
      label: MILESTONE_HINTS[d.key]?.label ?? d.key,
      hint: MILESTONE_HINTS[d.key]?.hint ?? "",
      date: new Date(d.at).toISOString(),
      pct: pctOf(d.at),
      past: d.at <= nowMs,
      done,
      late: !done && d.at <= nowMs,
      next: d.key === nextKey,
    };
  });

  return { ...base, cursorPct: pctOf(nowMs), milestones, sessionPast };
};
