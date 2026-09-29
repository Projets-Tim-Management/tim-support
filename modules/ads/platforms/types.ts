import type { PlatformKey } from "@/modules/ads/lib/platforms";

/**
 * Le contrat d'une régie publicitaire (plan Publicité, §5).
 *
 * Une régie = un adaptateur. Les méthodes d'écriture sont OPTIONNELLES et
 * annoncées par `capabilities` : on branche une régie partiellement (lecture
 * d'abord) sans rien casser, et plus tard l'agent ne recevra que les outils que
 * la régie sait faire. En phase 0, aucune écriture n'est implémentée.
 */

export type Capability =
  | "lecture" // campagnes, métriques
  | "budget" // modifier un budget
  | "statut" // mettre en pause / réactiver
  | "creation" // créer campagne, ensemble, annonce
  | "upload-crea" // envoyer image / vidéo
  | "conversions" // renvoyer un événement (lead qualifié, signé)
  | "leads-natifs"; // formulaires hébergés par la régie

/** Niveau d'un objet chez la régie. L'ensemble de publicités de Meta = le groupe d'annonces de Google. */
export type Level = "campaign" | "adset" | "ad";

/** Objectif normalisé, commun à toutes les régies. */
export type Objective = "leads" | "trafic" | "notoriete" | "autre";

/** État normalisé d'une campagne. */
export type CampaignStatus = "brouillon" | "active" | "en-pause" | "terminee";

/** Jours inclus, au format AAAA-MM-JJ, dans le fuseau du compte. */
export type DateRange = { since: string; until: string };

/** Ce qu'un adaptateur reçoit pour parler au nom d'un compte. Le jeton est en clair : il ne sort jamais du serveur. */
export type AccountContext = {
  externalId: string;
  token: string;
  currency?: string | null;
  timezone?: string | null;
};

/** Résultat d'une connexion OAuth. */
export type AccountToken = {
  token: string;
  /** Échéance, si la régie en donne une (Meta : ~60 jours, sans rafraîchissement). */
  expiresAt: Date | null;
};

/** Un compte publicitaire accessible avec un jeton. */
export type AccountSnapshot = {
  externalId: string;
  name: string;
  currency: string;
  timezone: string;
};

export type CampaignSnapshot = {
  externalId: string;
  name: string;
  objective: Objective;
  status: CampaignStatus;
  /** État brut chez la régie (ex. `ACTIVE`, `CAMPAIGN_PAUSED`), gardé pour comprendre un écart. */
  externalStatus: string;
  /** Budget quotidien en devise du compte, `null` si le budget vit au niveau de l'ensemble. */
  dailyBudget: number | null;
};

export type MetricRow = {
  level: Level;
  externalId: string;
  name: string;
  /** Campagne parente — permet de remonter un ensemble ou une annonce à sa campagne. */
  campaignExternalId: string;
  day: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
};

/** Référence d'un objet à modifier chez la régie (phases suivantes). */
export type ObjectRef = { level: Level; externalId: string };

export interface AdPlatform {
  key: PlatformKey;
  label: string;
  capabilities: Capability[];
  /** Échange le code OAuth contre un jeton — longue durée quand la régie le permet. */
  connect(code: string, redirectUri: string): Promise<AccountToken>;
  /** Les comptes publicitaires que le jeton ouvre : on en choisit un à la connexion. */
  listAccounts(token: string): Promise<AccountSnapshot[]>;
  listCampaigns(acc: AccountContext): Promise<CampaignSnapshot[]>;
  fetchMetrics(acc: AccountContext, range: DateRange, level: Level): Promise<MetricRow[]>;
  setBudget?(acc: AccountContext, ref: ObjectRef, amount: number): Promise<void>;
  setStatus?(acc: AccountContext, ref: ObjectRef, status: "active" | "pause"): Promise<void>;
}

/** Erreur de jeton : expiré, révoqué, droits retirés. Le compte passe « expiré », pas « en erreur ». */
export class AdTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdTokenError";
  }
}
