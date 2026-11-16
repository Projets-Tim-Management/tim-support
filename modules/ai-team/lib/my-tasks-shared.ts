import { DAY_MS } from "@/modules/ai-team/lib/format";
import type { TaskStep } from "@/modules/ai-team/lib/roadmap";
import type { RoadmapTeam } from "@/modules/ai-team/lib/roadmap-constants";

/**
 * « Mes tâches » : ce que lisent la page (composant client) comme le serveur — les catégories et leur couleur, la
 * forme d'une tâche, son rangement (en retard, cette semaine, plus tard, faite) et l'avancement de la semaine.
 * Sans dépendance serveur. Le chargement est dans lib/my-tasks.
 */

/** Une couleur par catégorie : le bureau dont vient la tâche. */
export type TaskCategory = RoadmapTeam;
export const TASK_CATEGORIES: { value: TaskCategory; label: string; icon: string }[] = [
  { value: "com", label: "Commercial", icon: "💼" },
  { value: "seo", label: "SEO & GEO", icon: "🔎" },
  { value: "sea", label: "Publicité", icon: "📣" },
  { value: "tous", label: "Entreprise", icon: "🏢" },
];

export type TaskSource = "demande" | "objectif" | "action" | "a-valider";

export type MyTask = {
  /** r12 (demande), o5 (objectif), a3 (action), v-creas-7 / v-action-9 (À valider). */
  id: string;
  source: TaskSource;
  category: TaskCategory;
  /** « question » : une réponse attendue, pas une case à cocher. */
  form: "a-faire" | "question";
  title: string;
  status: "a-faire" | "en-cours" | "fait";
  /** L'échéance (AAAA-MM-JJ), s'il y en a une. Une demande d'un chef n'en a pas : elle est pour maintenant. */
  due: string | null;
  at: string;
  doneAt: string | null;
  /** Le chef à qui en parler (sa conversation), null pour une action d'équipe hors bureau. */
  chief: string | null;
  /** D'où elle vient, en clair : « Élise · idée de Nathan », « Développement ». */
  from: string | null;
  urgent: boolean;
  why: string | null;
  diagnosis: string | null;
  benchmark: string | null;
  measure: string | null;
  page: string | null;
  question: string | null;
  url: string | null;
  notes: string | null;
  minutes: number | null;
  steps: TaskStep[];
  /** Les étapes se cochent une à une (objectif, demande à faire). */
  stepsCheckable: boolean;
  slots: { start: string; end: string; link: string | null }[];
  answer: string | null;
  goal: string | null;
  campaign: string | null;
};

export type TaskGroup = "retard" | "semaine" | "plus-tard" | "fait";

/** Le dimanche (AAAA-MM-JJ) de la semaine d'un jour. */
const sundayOf = (today: string) => {
  const d = new Date(`${today}T12:00:00Z`);
  const wd = d.getUTCDay();
  return new Date(d.getTime() + ((7 - wd) % 7) * DAY_MS).toISOString().slice(0, 10);
};
/** Le lundi (AAAA-MM-JJ) de la semaine d'un jour. */
export const mondayOf = (today: string) => {
  const d = new Date(`${today}T12:00:00Z`);
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
};

/** Où ranger une tâche : en retard, cette semaine (ou sans date : maintenant), plus tard, faite. Pure (testée). */
export function groupOf(t: MyTask, today: string): TaskGroup {
  if (t.status === "fait") return "fait";
  if (t.due && t.due < today) return "retard";
  if (!t.due || t.due <= sundayOf(today)) return "semaine";
  return "plus-tard";
}

/** L'ordre dans un groupe : l'urgent d'abord, puis l'échéance la plus proche, puis la plus récente. Pure. */
export function sortTasks(list: MyTask[], today: string): MyTask[] {
  return [...list].sort((a, b) => Number(b.urgent) - Number(a.urgent) || (a.due ?? today).localeCompare(b.due ?? today) || b.at.localeCompare(a.at));
}

/**
 * OÙ J'EN SUIS CETTE SEMAINE : les tâches faites depuis lundi, face à celles qui restent pour cette semaine (en retard
 * comprises). 100 % : rien ne reste. Pure (testée).
 */
export function weekProgress(tasks: MyTask[], today: string): { done: number; left: number; late: number; pct: number } {
  const monday = mondayOf(today);
  const done = tasks.filter((t) => t.status === "fait" && (t.doneAt ?? "").slice(0, 10) >= monday).length;
  const open = tasks.filter((t) => ["retard", "semaine"].includes(groupOf(t, today)));
  const late = open.filter((t) => groupOf(t, today) === "retard").length;
  const total = done + open.length;
  return { done, left: open.length, late, pct: total ? Math.round((done / total) * 100) : 100 };
}

/** Le nombre de tâches qui attendent la direction cette semaine (le lien de l'organigramme). */
export const openCount = (tasks: MyTask[], today: string) => tasks.filter((t) => ["retard", "semaine"].includes(groupOf(t, today))).length;

/** Le lien d'une tâche dans « Mes tâches » (la feuille de route, la fiche de Serge, les e-mails y renvoient). */
export const taskHref = (id: string) => `/admin/mes-taches?tache=${encodeURIComponent(id)}`;
