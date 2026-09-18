/**
 * « Pas de réponse » sur une tâche d'appel : la tentative se note, la tâche
 * se reporte. Un seul geste, une trace — plutôt que cocher la tâche et en
 * recréer une identique, ce qui perdait le nombre d'essais et leurs heures.
 *
 * Pur : la date de report et les libellés se testent sans base ni horloge.
 */

export type Attempt = { at: string; by?: number | string | { id?: number | string } | null };

const PARIS = "Europe/Paris";
const DAY_MS = 86_400_000;

const parts = (ms: number) => {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: PARIS,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: get("hour"), minute: get("minute"), weekday: get("weekday") };
};

/** L'instant « jour de Paris + heure de Paris » en ISO — en passant par l'offset réel de ce jour-là. */
const parisDateTime = (day: string, hour: string, minute: string): string => {
  const guess = Date.parse(`${day}T${hour}:${minute}:00Z`);
  const seen = parts(guess);
  const wanted = Number(hour) * 60 + Number(minute);
  const got = Number(seen.hour) * 60 + Number(seen.minute) + (seen.day < day ? -1440 : seen.day > day ? 1440 : 0);
  return new Date(guess + (wanted - got) * 60_000).toISOString();
};

/**
 * La date du prochain essai : le prochain jour OUVRÉ après aujourd'hui, à
 * l'heure prévue de la tâche — un appel manqué le vendredi 16 h revient lundi
 * 16 h. Une tâche déjà prévue plus tard garde sa date : on note l'essai, on
 * ne la repousse pas pour autant.
 */
export function nextAttemptDate(dueIso: string | null | undefined, nowMs: number): string {
  const due = dueIso ? Date.parse(dueIso) : NaN;
  const { hour, minute } = Number.isNaN(due) ? { hour: "09", minute: "00" } : parts(due);
  let ms = nowMs + DAY_MS;
  for (let i = 0; i < 7; i += 1) {
    const w = parts(ms).weekday;
    if (w !== "Sat" && w !== "Sun") break;
    ms += DAY_MS;
  }
  const candidate = parisDateTime(parts(ms).day, hour, minute);
  return !Number.isNaN(due) && due > Date.parse(candidate) ? new Date(due).toISOString() : candidate;
}

/** « 17 sept. 14:32 » — pour la ligne de chronologie et l'étiquette de la tâche. */
export const attemptLabel = (iso: string): string =>
  new Date(iso).toLocaleString("fr-FR", { timeZone: PARIS, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(",", "");

/** Ce que dit la tâche : « 2 essais sans réponse · dernier 17 sept. 14:32 ». */
export const attemptsSummary = (attempts: Attempt[] | null | undefined): string | null => {
  const list = (attempts ?? []).filter((a) => a?.at);
  if (!list.length) return null;
  const last = list[list.length - 1];
  return `${list.length} essai${list.length > 1 ? "s" : ""} sans réponse · dernier ${attemptLabel(last.at)}`;
};
