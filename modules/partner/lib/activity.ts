/**
 * Vocabulaire de l'historique d'une opportunité — source de vérité partagée par
 * la collection, la chronologie et le composeur.
 */

/**
 * Trois gestes seulement — les mêmes que Brevo : noter, écrire, planifier.
 *
 * Un appel ou une réunion ne sont PAS des types à part : ce sont des natures de
 * TÂCHE (voir TASK_KINDS). Les avoir aux deux endroits obligeait à choisir entre
 * « consigner un appel passé » et « planifier un appel » — une distinction que
 * personne ne fait au moment de cliquer. Ce qui a eu lieu se note ; ce qui reste
 * à faire est une tâche, qu'on coche.
 */
export type ActivityKind = {
  value: string;
  label: string;
  /** Ce qu'on écrit dans le composeur (« Appeler », « Noter »…). */
  verb: string;
  color: string;
  bg: string;
  /** Saisissable à la main ; sinon, écrit par le système. */
  manual: boolean;
};

export const ACTIVITY_KINDS: ActivityKind[] = [
  { value: "note", label: "Note", verb: "Ajouter une note", color: "var(--tim-slate)", bg: "var(--tim-slate-bg)", manual: true },
  { value: "email", label: "E-mail", verb: "Envoyer un e-mail", color: "var(--tim-blue)", bg: "var(--tim-blue-bg)", manual: true },
  { value: "tache", label: "Tâche", verb: "Créer une tâche", color: "var(--tim-amber)", bg: "var(--tim-amber-bg)", manual: true },
  // Écrit par les hooks : changement de statut, contrat signé, lead importé…
  { value: "systeme", label: "Journal", verb: "", color: "var(--tim-gray)", bg: "var(--tim-gray-bg)", manual: false },
];

/**
 * Nature d'une TÂCHE — reprise des types de Brevo, pour que l'équipe retrouve
 * le même vocabulaire des deux côtés.
 *
 * À ne pas confondre avec `ACTIVITY_KINDS` : là on décrit ce qu'il RESTE à
 * faire (un appel à passer), pas ce qui a eu lieu (un appel passé).
 */
export const TASK_KINDS = [
  { value: "a-faire", label: "À faire" },
  { value: "appel", label: "Appel" },
  { value: "email", label: "E-mail" },
  { value: "reunion", label: "Réunion" },
  { value: "dejeuner", label: "Déjeuner" },
  { value: "echeance", label: "Échéance" },
  { value: "linkedin", label: "LinkedIn" },
] as const;

export const TASK_KIND_OPTIONS = TASK_KINDS.map(({ label, value }) => ({ label, value }));

export const taskKindLabel = (value?: string | null): string | undefined =>
  TASK_KINDS.find((k) => k.value === value)?.label;

export const ACTIVITY_OPTIONS = ACTIVITY_KINDS.map(({ label, value }) => ({ label, value }));

export const activityKind = (value?: string | null): ActivityKind | undefined =>
  ACTIVITY_KINDS.find((k) => k.value === value);

/** Types saisissables depuis la fiche (le journal, lui, s'écrit tout seul). */
export const MANUAL_KINDS = ACTIVITY_KINDS.filter((k) => k.manual);
