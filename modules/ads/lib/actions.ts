/**
 * Agir sur une campagne en ligne (plan Publicité, phase 2, §6 et D5) : changer
 * un budget, mettre en pause, réactiver. Les garde-fous décident ICI, en code ;
 * un prompt se contourne, un `if` non.
 *
 * Trois issues pour une action :
 *  - `executer` : le code l'applique chez Meta (campagne « autonome », action
 *    dans les bornes) ;
 *  - `proposer` : elle attend Charlie dans « À valider » (campagne « proposer »,
 *    ou action que le plan réserve à un humain) ;
 *  - `bloquer` : un garde-fou la refuse, avec la raison — elle est journalisée,
 *    jamais appliquée.
 *
 * Pure.
 */

export type Level = "campaign" | "adset" | "ad";
export type Action =
  | { kind: "budget"; level: "adset" | "campaign"; externalId: string; name: string; fromEur: number; toEur: number }
  | { kind: "pause"; level: Level; externalId: string; name: string; urgence?: boolean }
  | { kind: "activation"; level: Level; externalId: string; name: string };

export type Autonomy = "observer" | "proposer" | "autonome";

export type GuardSettings = {
  enabled: boolean;
  /** Variation de budget maximale par décision, en % (défaut 20). */
  maxBudgetChangePct: number;
  /** Délai minimal entre deux modifications d'un même objet, en heures (défaut 72). */
  minHoursBetweenChanges: number;
};

export type GuardContext = {
  settings: GuardSettings;
  autonomy: Autonomy;
  now: Date;
  /** Dernière modification de CET objet (décision exécutée), s'il y en a une. */
  lastChangeAt: Date | null;
  /** Activation de la campagne chez Meta : les 7 premiers jours sont gelés, sauf urgence. */
  activatedAt: Date | null;
  /** Budget quotidien Meta plancher de la campagne : l'agent ne peut pas l'« économiser » en la tuant. */
  floorEur: number | null;
  /** Plafond mensuel du compte, dépense du mois à ce jour, et budget quotidien total du compte AVANT l'action. */
  monthlyCapEur: number | null;
  monthSpentEur: number;
  accountDailyEur: number;
  daysLeftInMonth: number;
};

export type Verdict = { outcome: "executer" | "proposer" | "bloquer"; reasons: string[] };

export const FREEZE_DAYS = 7;
const H = 3_600_000;

const pct = (from: number, to: number) => (from > 0 ? ((to - from) / from) * 100 : Infinity);

/** Ce que les garde-fous font d'une action. Pure. */
export function judgeAction(a: Action, c: GuardContext): Verdict {
  const block = (reason: string): Verdict => ({ outcome: "bloquer", reasons: [reason] });
  const urgent = a.kind === "pause" && a.urgence === true;

  if (!c.settings.enabled) return block("Interrupteur général coupé : aucune décision ne s'exécute.");
  // Une pub refusée par Meta se met en pause quel que soit le niveau d'autonomie (décision 4 du §9 quinquies).
  if (urgent) return { outcome: "executer", reasons: ["Urgence : mise en pause immédiate."] };
  if (c.autonomy === "observer") return block("Campagne en observation : l'agent rapporte, il n'agit pas.");
  if (c.activatedAt && c.now.getTime() - c.activatedAt.getTime() < FREEZE_DAYS * 24 * H) return block(`Gel des ${FREEZE_DAYS} premiers jours de diffusion : Meta apprend encore.`);
  if (c.lastChangeAt && c.now.getTime() - c.lastChangeAt.getTime() < c.settings.minHoursBetweenChanges * H) {
    return block(`Modifié il y a moins de ${c.settings.minHoursBetweenChanges} h : on ne relance pas sans cesse l'apprentissage de Meta.`);
  }

  const human: string[] = [];
  if (a.kind === "budget") {
    if (!(a.toEur > 0)) return block("Un budget doit rester positif : pour arrêter, c'est une pause.");
    if (c.floorEur != null && a.toEur < c.floorEur) return block(`Sous le plancher de la campagne (${c.floorEur} € par jour).`);
    if (c.monthlyCapEur != null) {
      const projected = c.monthSpentEur + (c.accountDailyEur - a.fromEur + a.toEur) * c.daysLeftInMonth;
      if (projected > c.monthlyCapEur) return block(`Le mois finirait à ${Math.round(projected)} €, au-dessus du plafond du compte (${c.monthlyCapEur} €).`);
    }
    const change = pct(a.fromEur, a.toEur);
    if (Math.abs(change) > c.settings.maxBudgetChangePct) human.push(`Variation de ${Math.round(change)} %, au-delà de ±${c.settings.maxBudgetChangePct} % : validée à la main.`);
  }
  // Réactiver une campagne entière relance toute la dépense : jamais sans Charlie.
  if (a.kind === "activation" && a.level === "campaign") human.push("Réactiver une campagne entière se valide à la main.");

  if (c.autonomy === "proposer") return { outcome: "proposer", reasons: ["Campagne en mode « proposer » : à valider.", ...human] };
  return human.length ? { outcome: "proposer", reasons: human } : { outcome: "executer", reasons: ["Dans les bornes : exécutée (campagne autonome)."] };
}

/** L'action en une phrase, pour le journal et « À valider ». Pure. */
export function actionSummary(a: Action): string {
  const what = a.level === "campaign" ? "la campagne" : a.level === "adset" ? `l'ensemble « ${a.name} »` : `la publicité « ${a.name} »`;
  if (a.kind === "budget") return `Budget de ${what} : ${a.fromEur.toFixed(2)} € → ${a.toEur.toFixed(2)} € par jour`;
  if (a.kind === "pause") return `${a.urgence ? "Urgence — m" : "M"}ettre en pause ${what}`;
  return `Réactiver ${what}`;
}

/** Une action telle qu'un outil ou la base la donne, vérifiée. Null si elle ne se lit pas. Pure. */
export function readAction(raw: unknown): Action | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const level = r.level === "campaign" || r.level === "adset" || r.level === "ad" ? r.level : null;
  const externalId = typeof r.externalId === "string" && /^\d{5,30}$/.test(r.externalId) ? r.externalId : null;
  const name = typeof r.name === "string" ? r.name.slice(0, 120) : "";
  if (!level || !externalId) return null;
  if (r.kind === "budget" && level !== "ad" && typeof r.fromEur === "number" && typeof r.toEur === "number") return { kind: "budget", level, externalId, name, fromEur: r.fromEur, toEur: Math.round(r.toEur * 100) / 100 };
  if (r.kind === "pause") return { kind: "pause", level, externalId, name, urgence: r.urgence === true };
  if (r.kind === "activation") return { kind: "activation", level, externalId, name };
  return null;
}
