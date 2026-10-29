import type { Action } from "@/modules/ads/lib/actions";

/**
 * Les urgences d'une campagne en ligne, détectées par le CODE, sans IA (plan
 * Publicité, §9 quinquies §5 « continu » et §9 nonies, étape 2).
 *
 * Chaque synchro (celle de la nuit, avant le passage de l'analyste) les
 * recalcule à partir de ce que la base sait — l'état des pubs, les chiffres du
 * jour, la page d'arrivée. Une alerte qui ne se constate plus se clôt seule.
 *
 * Ce que chacune déclenche :
 *  - **pub refusée** : mise en pause de la pub, quel que soit le niveau
 *    d'autonomie (décision 4 du 29/09/2026) ;
 *  - **dépense anormale** (au-delà de 175 % du budget du jour, le plafond
 *    annoncé par Meta) et **page d'arrivée en panne** (constatée à deux synchros
 *    de suite — une coupure d'une minute ne coupe pas la campagne) : pause de la
 *    campagne, selon son niveau d'autonomie, sans attendre la fin du gel des 7
 *    jours ni les 72 h entre deux changements ;
 *  - **diffusion nulle** depuis 24 h : rien à couper, il faut regarder ;
 *  - **clics sans lead** : des visites sur la page, aucun formulaire — ce n'est
 *    pas une urgence (pas d'e-mail), mais les agents de suivi la lisent.
 *
 * Pure.
 */

export const ALERT_KINDS = [
  { label: "Publicité refusée", value: "pub-refusee" },
  { label: "Dépense anormale", value: "depense-anormale" },
  { label: "Diffusion nulle", value: "diffusion-nulle" },
  { label: "Page d'arrivée en panne", value: "lien-casse" },
  { label: "Des visites, aucun lead", value: "clics-sans-lead" },
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number]["value"];

/** Ce qui mérite un e-mail tout de suite (décision du 29/10/2026 : urgences + récapitulatif du lundi). */
export const URGENT_KINDS: AlertKind[] = ["pub-refusee", "depense-anormale", "diffusion-nulle", "lien-casse"];

/** Meta annonce pouvoir dépenser jusqu'à 75 % de plus que le budget quotidien un jour donné. */
export const OVERSPEND_RATIO = 1.75;
export const SILENT_HOURS = 24;
/** Vues de la page d'arrivée sur 7 jours sans un seul lead : à 2 % de conversion, on en attendrait déjà 3. */
export const VIEWS_WITHOUT_LEAD = 150;

export type CampaignIn = {
  id: number | string;
  name: string;
  externalId: string;
  /** Activée chez Meta le… (publication) ; null pour une campagne lue chez la régie sans être née ici. */
  activatedAt: string | null;
};
export type ObjectIn = { level: "adset" | "ad"; externalId: string; name: string; campaignExternalId: string; status: string; effectiveStatus: string; dailyBudget: number | null; issues: string[] };
export type DayIn = { campaignExternalId: string; day: string; spend: number; impressions: number; landingViews: number; leads: number; siteLeads: number };

export type Detected = {
  campaign: number | string;
  kind: AlertKind;
  /** L'objet visé : la pub refusée, sinon la campagne. */
  level: "campaign" | "adset" | "ad";
  externalId: string;
  name: string;
  detail: string;
  /** L'action qu'elle déclenche, s'il y en a une. */
  action: Action | null;
};

const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

/** Le budget quotidien d'une campagne : la somme de ses ensembles actifs (le budget vit sur l'ensemble). */
export function dailyBudgetOf(campaignExternalId: string, objects: ObjectIn[]): number {
  return objects
    .filter((o) => o.level === "adset" && o.campaignExternalId === campaignExternalId && o.status === "ACTIVE")
    .reduce((s, o) => s + (o.dailyBudget ?? 0), 0);
}

/**
 * Les urgences de chaque campagne active. `today` et `yesterday` sont les jours
 * du compte ; `days` porte au moins les 7 derniers jours au niveau campagne ;
 * `landing` dit, par campagne, si sa page d'arrivée a répondu (absente : pas
 * vérifiée). Pure.
 */
export function detectAlerts(input: {
  campaigns: CampaignIn[];
  objects: ObjectIn[];
  days: DayIn[];
  today: string;
  yesterday: string;
  now: Date;
  landing: Map<number | string, { ok: boolean; detail: string }>;
}): Detected[] {
  const out: Detected[] = [];
  for (const c of input.campaigns) {
    const mine = input.objects.filter((o) => o.campaignExternalId === c.externalId);
    const rows = input.days.filter((d) => d.campaignExternalId === c.externalId);
    const at = (day: string) => rows.find((d) => d.day === day);
    const pauseCampaign = (): Action => ({ kind: "pause", level: "campaign", externalId: c.externalId, name: c.name, alerte: true });

    // 1. Pub refusée : on la coupe, elle ne diffuse de toute façon plus, mais elle pèse sur le compte.
    for (const ad of mine.filter((o) => o.level === "ad" && o.effectiveStatus === "DISAPPROVED" && o.status !== "PAUSED")) {
      out.push({
        campaign: c.id,
        kind: "pub-refusee",
        level: "ad",
        externalId: ad.externalId,
        name: ad.name,
        detail: `Meta a refusé « ${ad.name} »${ad.issues.length ? ` : ${ad.issues.join(" ; ")}` : "."}`,
        action: { kind: "pause", level: "ad", externalId: ad.externalId, name: ad.name, urgence: true },
      });
    }

    // 2. Dépense du jour au-delà de ce que Meta s'autorise.
    const budget = dailyBudgetOf(c.externalId, mine);
    const spent = at(input.today)?.spend ?? 0;
    if (budget > 0 && spent > budget * OVERSPEND_RATIO) {
      out.push({
        campaign: c.id,
        kind: "depense-anormale",
        level: "campaign",
        externalId: c.externalId,
        name: c.name,
        detail: `${eur(spent)} dépensés aujourd'hui pour un budget de ${eur(budget)} par jour (plus de ${Math.round(OVERSPEND_RATIO * 100)} %).`,
        action: pauseCampaign(),
      });
    }

    // 3. Plus rien ne sort depuis 24 h, alors que la campagne tourne depuis plus longtemps.
    const live = c.activatedAt != null && input.now.getTime() - Date.parse(c.activatedAt) > SILENT_HOURS * 3_600_000;
    const delivering = mine.some((o) => o.level === "ad" && o.effectiveStatus === "ACTIVE");
    const shown = (at(input.today)?.impressions ?? 0) + (at(input.yesterday)?.impressions ?? 0);
    if (live && budget > 0 && shown === 0) {
      out.push({
        campaign: c.id,
        kind: "diffusion-nulle",
        level: "campaign",
        externalId: c.externalId,
        name: c.name,
        detail: delivering
          ? "Aucune impression hier ni aujourd'hui, alors que des publicités sont actives : vérifier le compte (paiement, plafond) et la diffusion chez Meta."
          : "Aucune impression hier ni aujourd'hui, et aucune publicité n'est en diffusion (refusées, en revue ou en pause).",
        action: null,
      });
    }

    // 4. La page d'arrivée ne répond plus.
    const page = input.landing.get(c.id);
    if (page && !page.ok) {
      out.push({ campaign: c.id, kind: "lien-casse", level: "campaign", externalId: c.externalId, name: c.name, detail: `La page d'arrivée ne répond pas : ${page.detail}.`, action: pauseCampaign() });
    }

    // 5. Des visites, aucun formulaire : la page ou l'offre ne convertit pas.
    const week = rows.filter((d) => d.day <= input.today).sort((a, b) => b.day.localeCompare(a.day)).slice(0, 7);
    const views = week.reduce((s, d) => s + d.landingViews, 0);
    const leads = week.reduce((s, d) => s + d.siteLeads + d.leads, 0);
    if (views >= VIEWS_WITHOUT_LEAD && leads === 0) {
      out.push({
        campaign: c.id,
        kind: "clics-sans-lead",
        level: "campaign",
        externalId: c.externalId,
        name: c.name,
        detail: `${views} personnes sont arrivées sur la page en 7 jours, aucun formulaire : la page d'arrivée ou l'offre ne convertit pas (à 2 %, on en attendrait ${Math.floor(views * 0.02)}).`,
        action: null,
      });
    }
  }
  return out;
}

/** La clé d'une alerte : une seule ouverte par campagne, type et objet. */
export const alertKey = (a: { campaign: number | string; kind: string; externalId: string }) => `${a.campaign}|${a.kind}|${a.externalId}`;

/** Une page d'arrivée en panne n'agit qu'à la deuxième constatation, au moins 30 min après la première. */
export const CONFIRM_AFTER_MS = 30 * 60_000;
export const needsConfirmation = (kind: AlertKind) => kind === "lien-casse";
