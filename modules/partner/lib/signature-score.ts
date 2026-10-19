/**
 * Le pourcentage de signature d'une opportunité (Charlie, 19/10/2026) : ce
 * qu'on sait de son avancement, en un chiffre — pour que l'équipe tech
 * priorise les développements attendus par les prospects les plus chauds.
 *
 * Une BASE selon le statut (c'est elle qui pèse), plus les ÉCHANGES des 60
 * derniers jours (réunion ou visio faite +4, appel fait +3, e-mail reçu du
 * prospect +2, au plus +15), moins le SILENCE (−10 sans aucun échange depuis
 * 30 jours — pour une opportunité ouverte depuis plus longtemps que ça). Le statut reste dominant : les échanges ne font jamais dépasser
 * la base du statut suivant. Pure.
 */

import { clientStatusMeta } from "./clientStatus";

/**
 * La base de chaque statut. Gagnée et Perdue sont fixes : rien ne les fait bouger.
 * Un client déjà gagné vaut 50 % (Charlie, 19/10/2026) : ses demandes comptent,
 * mais passent après celles d'un prospect en test ou en signature — le but est
 * d'aider à signer.
 */
export const STATUS_BASE: Record<string, number> = {
  nouvelle: 5,
  "en-qualification": 10,
  "attente-longue": 15,
  "demo-programmee": 25,
  "attente-engagement": 40,
  "en-test": 60,
  "en-signature": 85,
  actif: 50,
  perdue: 0,
  resilie: 0,
  archive: 0,
};
const FIXED = new Set(["actif", "perdue", "resilie", "archive"]);

export const WINDOW_DAYS = 60;
export const SILENCE_DAYS = 30;
export const BONUS_CAP = 15;
export const SILENCE_MALUS = 10;
const POINTS = { reunion: 4, appel: 3, reponse: 2 } as const;
const DAY = 86_400_000;

/** Ce qu'on lit d'une ligne d'historique. */
export type ScoreActivity = {
  type?: string | null;
  taskKind?: string | null;
  done?: boolean | null;
  doneAt?: string | null;
  occurredAt?: string | null;
  emailDirection?: string | null;
};

export type SignatureScore = {
  score: number;
  base: number;
  meetings: number;
  calls: number;
  replies: number;
  bonus: number;
  silent: boolean;
  /** « Démo programmée 25 % + 2 visios + 1 réponse = 35 % » : le détail, à afficher tel quel. */
  explanation: string;
};

/** Le plafond d'un statut du pipeline : juste sous la base du statut suivant (100 pour le plus haut). */
function capOf(base: number): number {
  const above = Object.entries(STATUS_BASE)
    .filter(([s, b]) => !FIXED.has(s) && b > base)
    .map(([, b]) => b)
    .sort((a, b) => a - b)[0];
  return above == null ? 100 : above - 1;
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** Le % de signature et son détail. Pure. */
/** `createdAt` : la naissance de l'opportunité — un lead d'hier n'est pas « silencieux ». */
export function signatureScore(
  status: string | null | undefined,
  activities: ScoreActivity[],
  now: Date,
  createdAt?: string | null,
): SignatureScore {
  const s = status ?? "nouvelle";
  const base = STATUS_BASE[s] ?? STATUS_BASE.nouvelle;
  const label = clientStatusMeta(s)?.label ?? s;
  if (FIXED.has(s)) return { score: base, base, meetings: 0, calls: 0, replies: 0, bonus: 0, silent: false, explanation: `${label} : ${base} %` };

  const at = (a: ScoreActivity) => Date.parse((a.type === "tache" ? a.doneAt : null) ?? a.occurredAt ?? "") || NaN;
  const recent = (a: ScoreActivity, days: number) => {
    const t = at(a);
    return !Number.isNaN(t) && t <= now.getTime() && now.getTime() - t <= days * DAY;
  };
  // Un échange : une tâche faite (appel, réunion, déjeuner…), ou un e-mail, dans un sens ou dans l'autre.
  const exchange = (a: ScoreActivity) => (a.type === "tache" && a.done === true) || a.type === "email";
  const inWindow = activities.filter((a) => exchange(a) && recent(a, WINDOW_DAYS));
  const meetings = inWindow.filter((a) => a.type === "tache" && (a.taskKind === "reunion" || a.taskKind === "dejeuner")).length;
  const calls = inWindow.filter((a) => a.type === "tache" && a.taskKind === "appel").length;
  const replies = inWindow.filter((a) => a.type === "email" && a.emailDirection === "recu").length;
  const bonus = Math.min(BONUS_CAP, meetings * POINTS.reunion + calls * POINTS.appel + replies * POINTS.reponse);
  const born = Date.parse(createdAt ?? "");
  const young = !Number.isNaN(born) && now.getTime() - born < SILENCE_DAYS * DAY;
  const silent = !young && !activities.some((a) => exchange(a) && recent(a, SILENCE_DAYS));

  const score = Math.max(0, Math.min(capOf(base), base + bonus - (silent ? SILENCE_MALUS : 0)));
  const parts = [`${label} ${base} %`];
  if (meetings) parts.push(`+ ${plural(meetings, "réunion", "réunions")}`);
  if (calls) parts.push(`+ ${plural(calls, "appel", "appels")}`);
  if (replies) parts.push(`+ ${plural(replies, "réponse", "réponses")}`);
  if (silent) parts.push(`− silence depuis ${SILENCE_DAYS} jours`);
  return { score, base, meetings, calls, replies, bonus, silent, explanation: `${parts.join(" ")} = ${score} %` };
}

/**
 * La chaleur d'un % pour l'affichage, sur cinq crans : plus c'est haut, plus il
 * est important de s'en occuper (du gris au rouge plein). Pure.
 */
export type ScoreTone = "froid" | "frais" | "tiede" | "chaud" | "brulant";
export const scoreTone = (score: number | null | undefined): ScoreTone => {
  const v = Number(score ?? 0);
  return v >= 85 ? "brulant" : v >= 60 ? "chaud" : v >= 40 ? "tiede" : v >= 20 ? "frais" : "froid";
};
