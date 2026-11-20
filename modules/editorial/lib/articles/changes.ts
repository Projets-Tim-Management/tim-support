/**
 * MESURER CHAQUE MODIFICATION D'UN ARTICLE EN LIGNE (décision du 19/11/2026 : « analyser tout ce
 * qui se fait après les mises à jour, savoir si c'est mieux ou moins bien qu'avant »).
 *
 * À chaque modification d'un article en ligne — mise à jour automatique de l'équipe, correction
 * dans le tiroir, changement de mot-clé — on note les chiffres d'AVANT (clics Google des 28 derniers
 * jours, position moyenne). Au relevé du lundi qui suit les 4 semaines complètes d'après (31 jours,
 * Search Console a 3 jours de retard), on note les chiffres d'APRÈS et on juge :
 *  - mieux : au moins +20 % de clics et +3 clics, ou position gagnée d'au moins 2 places sans perte de clics ;
 *  - moins bien : au moins −20 % de clics et −3 clics, ou position perdue d'au moins 2 places sans gain de clics ;
 *  - stable : sinon.
 * Prudence affichée : une saison (été, fêtes) ou une mise à jour de Google joue aussi ; un verdict
 * isolé n'est pas une preuve, une tendance sur plusieurs modifications du même type l'est davantage.
 * Pur (testé).
 */

export type ChangeType = "maj-auto" | "tiroir" | "mot-cle";
export type ChangeVerdict = "mieux" | "stable" | "moins-bien";
export type Snapshot = { clics28: number | null; position: number | null };
export type ChangeEntry = {
  le: string;
  type: ChangeType;
  detail: string;
  avant: Snapshot;
  apres?: Snapshot;
  verdict?: ChangeVerdict;
  lecture?: string;
  jugeLe?: string;
  annulee?: boolean;
};

export const CHANGE_LABEL: Record<ChangeType, string> = { "maj-auto": "Mise à jour de l'équipe", tiroir: "Correction dans le tiroir", "mot-cle": "Changement de mot-clé" };
export const VERDICT_LABEL: Record<ChangeVerdict, string> = { mieux: "Mieux", stable: "Stable", "moins-bien": "Moins bien" };

const DAY = 86_400_000;
export const JUDGE_AFTER_DAYS = 31;
/** Les 30 dernières modifications au plus, par article. */
const MAX_LOG = 30;
const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const ONLINE = new Set(["publie", "a-rafraichir"]);

export const snapshotOf = (a: Record<string, unknown>): Snapshot => ({ clics28: num(a.gscClicks28), position: num(a.gscPosition) });

export const logOf = (a: Record<string, unknown>): ChangeEntry[] => (Array.isArray(a.changesLog) ? (a.changesLog as ChangeEntry[]) : []);

/**
 * Ajoute une modification au journal d'un article EN LIGNE (un brouillon n'a pas de chiffres à
 * comparer). Deux modifications le même jour se fondent en une. Rend le journal, ou null s'il n'y a
 * rien à noter.
 */
export function withChange(a: Record<string, unknown>, type: ChangeType, detail: string, now: Date): ChangeEntry[] | null {
  if (!ONLINE.has(String(a.status))) return null;
  const log = logOf(a);
  const day = now.toISOString().slice(0, 10);
  const last = log[log.length - 1];
  if (last && last.le === day && last.type === type && !last.verdict) {
    return [...log.slice(0, -1), { ...last, detail: [...new Set(`${last.detail} ; ${detail}`.split(" ; "))].join(" ; ").slice(0, 300) }];
  }
  return [...log, { le: day, type, detail: detail.slice(0, 300), avant: snapshotOf(a) }].slice(-MAX_LOG);
}

/** Juge les modifications qui ont 4 semaines complètes d'après. Rend le journal mis à jour, ou null si rien ne change. */
export function judgeChanges(a: Record<string, unknown>, now: Date): ChangeEntry[] | null {
  const log = logOf(a);
  let changed = false;
  const after = snapshotOf(a);
  const out = log.map((e, i) => {
    if (e.verdict || e.annulee) return e;
    if (now.getTime() - Date.parse(e.le) < JUDGE_AFTER_DAYS * DAY) return e;
    // Une modification suivie d'une autre avant d'être jugée : on ne peut plus séparer leurs effets.
    const next = log[i + 1];
    if (next && Date.parse(next.le) - Date.parse(e.le) < JUDGE_AFTER_DAYS * DAY) {
      changed = true;
      return { ...e, verdict: "stable" as const, apres: after, jugeLe: now.toISOString().slice(0, 10), lecture: "Suivie d'une autre modification avant 4 semaines : effets mêlés, jugée avec la suivante." };
    }
    changed = true;
    return { ...e, ...judge(e.avant, after), apres: after, jugeLe: now.toISOString().slice(0, 10) };
  });
  return changed ? out : null;
}

export function judge(before: Snapshot, after: Snapshot): { verdict: ChangeVerdict; lecture: string } {
  const b = before.clics28 ?? 0;
  const c = after.clics28 ?? 0;
  const dc = c - b;
  const pb = before.position;
  const pa = after.position;
  const dp = pb != null && pa != null ? pb - pa : null; // > 0 = places gagnées
  const clicksTxt = `${b} → ${c} clics sur 28 jours (${dc >= 0 ? "+" : ""}${dc})`;
  const posTxt = dp != null ? `, position ${pb?.toFixed(1).replace(".", ",")} → ${pa?.toFixed(1).replace(".", ",")}` : "";
  const up = (c >= b * 1.2 && dc >= 3) || (dp != null && dp >= 2 && dc >= 0);
  const down = (c <= b * 0.8 && -dc >= 3) || (dp != null && dp <= -2 && dc <= 0);
  const verdict: ChangeVerdict = up && !down ? "mieux" : down && !up ? "moins-bien" : "stable";
  return { verdict, lecture: `${clicksTxt}${posTxt}. Une saison ou une mise à jour de Google peut aussi jouer.` };
}

/** Le bilan des modifications jugées, par type : ce qui marche, ce qui ne marche pas (pour les agents). Pur. */
export function changesSummary(articles: Record<string, unknown>[]) {
  const all = articles.flatMap((a) => logOf(a).filter((e) => e.verdict && !e.annulee).map((e) => ({ ...e, titre: String(a.title ?? "") })));
  const byType = Object.fromEntries(
    (Object.keys(CHANGE_LABEL) as ChangeType[]).map((t) => {
      const list = all.filter((e) => e.type === t);
      return [CHANGE_LABEL[t], { jugees: list.length, mieux: list.filter((e) => e.verdict === "mieux").length, stables: list.filter((e) => e.verdict === "stable").length, moinsBien: list.filter((e) => e.verdict === "moins-bien").length }];
    }),
  );
  const recent = [...all].sort((x, y) => String(y.jugeLe).localeCompare(String(x.jugeLe))).slice(0, 12).map((e) => ({ titre: e.titre, type: CHANGE_LABEL[e.type], le: e.le, quoi: e.detail, verdict: VERDICT_LABEL[e.verdict as ChangeVerdict], chiffres: e.lecture }));
  const pending = articles.flatMap((a) => logOf(a).filter((e) => !e.verdict && !e.annulee)).length;
  return { lecture: "Chaque modification d'un article en ligne est jugée 4 semaines après (clics Google sur 28 jours, position). Un verdict isolé n'est pas une preuve : regarder la tendance par type.", parType: byType, enAttenteDeVerdict: pending, derniersVerdicts: recent };
}
