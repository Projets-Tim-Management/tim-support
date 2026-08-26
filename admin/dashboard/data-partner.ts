import type { PayloadRequest } from "payload";

import { clientStatusMeta } from "@/modules/partner/lib/clientStatus";
import { isBillableClient } from "@/modules/partner/lib/pricing";

/**
 * Données du tableau de bord d'un PARTENAIRE connecté — strictement scopées à SA
 * fiche (`partner = partnerId`, dérivé du compte authentifié). 5 requêtes max en
 * parallèle (bien sous le plafond du pooler à 15).
 */

export interface PartnerMonthPoint {
  /** 1er du mois, ISO court (yyyy-mm-dd). */
  day: string;
  ca: number;
  commission: number;
}

export interface PartnerClientsMetrics {
  active: number;
  total: number;
  /** CA mensuel des clients ACTIFS uniquement (voir isBillableClient). */
  caMonthly: number;
  commissionRate: number;
  commissionMonthly: number;
  /** Clients signés sur les 12 derniers mois. */
  signedLast12: number;
  byStatus: { key: string; label: string; count: number; color: string }[];
  top: { label: string; value: number }[];
  series: PartnerMonthPoint[];
}

export interface MissionToDo {
  id: number | string;
  title: string;
  points: number;
  /** Logo de la mission, `null` si elle n'en a pas (repli sur un monogramme). */
  image: string | null;
}
export interface RewardTeaser {
  id: number | string;
  title: string;
  cost: number;
  image: string | null;
  /** Points manquants pour l'obtenir (0 = déjà accessible). */
  missing: number;
}

/**
 * Ce qui motive un partenaire-UTILISATEUR : ce qu'il a, ce qu'il peut déjà
 * s'offrir, et ce qui l'en sépare. Les récompenses épuisées (stock 0) sont
 * exclues — proposer un objectif indisponible est le meilleur moyen de décevoir.
 */
export interface PartnerUserMetrics {
  earned: number;
  spent: number;
  /** Missions non encore soumises, avec ce qu'elles rapportent. */
  missionsToDo: MissionToDo[];
  /** Points encore à gagner sur ces missions. */
  pointsToGrab: number;
  /** Récompenses déjà accessibles avec le solde. */
  reachable: RewardTeaser[];
  /** La moins chère des récompenses hors de portée — le palier suivant. */
  nextReward: RewardTeaser | null;
  /**
   * La plus belle récompense du catalogue — celle qu'on met en vitrine. Distincte
   * du palier suivant : l'une fait rêver, l'autre se gagne bientôt.
   */
  topReward: RewardTeaser | null;
  /** Les plus gros lots, du plus cher au moins cher — défilement en vitrine. */
  topRewards: RewardTeaser[];
}

export interface PartnerMetrics {
  isMetier: boolean;
  pointsBalance: number;
  submissions: { pending: number; approved: number; total: number };
  orders: { pending: number; total: number };
  /** Uniquement pour un partenaire-métier (ses clients apportés). */
  clients: PartnerClientsMetrics | null;
  /** Uniquement pour un partenaire-utilisateur (points, missions, cadeaux). */
  user: PartnerUserMetrics | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Doc = Record<string, any>;

/**
 * Ordre des parts du donut. Il diffère volontairement de l'ordre du pipeline
 * (CLIENT_STATUSES) : « Archivé », gris neutre, s'intercale entre « Actif » (vert)
 * et « Résilié » (rouge). Deux parts vert/rouge contiguës sont indistinguables en
 * deutéranopie — ΔE 4.8, sous le seuil de 8 mesuré par le validateur de palette ;
 * avec le gris entre les deux, ΔE 8.7. L'ordre du pipeline reste inchangé partout
 * ailleurs (Kanban, onglets, champ) : ici l'ordre n'est que présentationnel.
 */
const DONUT_ORDER = [
  "nouvelle",
  "en-qualification",
  "demo-programmee",
  "attente-engagement",
  "attente-longue",
  "en-test",
  "actif",
  "archive",
  "resilie",
  "perdue",
];

/** 1er du mois, en UTC, décalé de `back` mois. */
function monthStart(back: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
}

/**
 * Série mensuelle (12 mois) du CA et de la commission, reconstituée depuis
 * l'`history` de chaque client — une entrée par mois de CHANGEMENT, avec le CA et
 * la commission figés au taux de l'époque.
 *
 * Un mois sans entrée n'est donc pas un mois à zéro : on reporte la dernière
 * valeur connue (le contrat court toujours). On s'arrête à la date de fin de
 * contrat quand elle existe, sinon un client résilié compterait indéfiniment.
 */
function buildMonthlySeries(clients: Doc[], months: number): PartnerMonthPoint[] {
  const starts = Array.from({ length: months }, (_, i) => monthStart(months - 1 - i));

  return starts.map((start, i) => {
    // Borne haute du mois : début du mois suivant (ou maintenant pour le mois courant).
    const end = i === starts.length - 1 ? new Date() : starts[i + 1];
    let ca = 0;
    let commission = 0;

    for (const c of clients) {
      const ended = c.resiliationDate ? Date.parse(c.resiliationDate) : null;
      if (ended != null && ended < start.getTime()) continue;

      const hist = (Array.isArray(c.history) ? c.history : [])
        .filter((h: Doc) => h?.at && Date.parse(h.at) < end.getTime())
        .sort((a: Doc, b: Doc) => Date.parse(a.at) - Date.parse(b.at));
      const last = hist[hist.length - 1];
      if (!last) continue;

      ca += Number(last.caHT) || 0;
      commission += Number(last.commission) || 0;
    }

    return { day: start.toISOString().slice(0, 10), ca: Math.round(ca), commission: Math.round(commission) };
  });
}

export async function getPartnerMetrics(
  req: PayloadRequest,
  partnerId: string | number,
  isMetier: boolean,
): Promise<PartnerMetrics> {
  const { payload } = req;
  const where = { partner: { equals: partnerId } };
  const base = { overrideAccess: true as const, depth: 0 as const, req, pagination: false as const };

  const [ptx, subs, orders, clients, partner, missions, rewards] = await Promise.all([
    payload
      .find({ ...base, collection: "point-transactions", where, limit: 40000, select: { delta: true } })
      .then((r) => r.docs as Doc[]),
    payload
      .find({
        ...base,
        collection: "mission-submissions",
        where,
        limit: 8000,
        select: { status: true, mission: true },
      })
      .then((r) => r.docs as Doc[]),
    payload
      .find({ ...base, collection: "reward-orders", where, limit: 8000, select: { status: true } })
      .then((r) => r.docs as Doc[]),
    isMetier
      ? payload
          .find({
            ...base,
            collection: "partner-clients",
            where,
            limit: 8000,
            select: {
              companyName: true,
              clientStatus: true,
              caPaye: true,
              signatureDate: true,
              contractStartDate: true,
              resiliationDate: true,
              history: true,
            },
          })
          .then((r) => r.docs as Doc[])
      : Promise.resolve([] as Doc[]),
    // Le taux de commission vit sur la fiche partenaire : c'est lui qui transforme
    // un CA en revenu pour le partenaire (lecture ouverte au partenaire, cf. RBAC §7).
    isMetier
      ? payload
          .findByID({ collection: "partners", id: partnerId, depth: 0, overrideAccess: true, req })
          .catch(() => null)
      : Promise.resolve(null),
    // Catalogues du programme de points — pour un partenaire-utilisateur seulement.
    isMetier
      ? Promise.resolve([] as Doc[])
      : payload
          .find({
            ...base,
            collection: "missions",
            limit: 500,
            depth: 1, // logo de la mission
            sort: "order",
            select: { title: true, points: true, logo: true },
          })
          .then((r) => r.docs as Doc[]),
    isMetier
      ? Promise.resolve([] as Doc[])
      : payload
          .find({
            ...base,
            collection: "rewards",
            limit: 500,
            depth: 1, // visuel de la récompense
            sort: "cost",
            select: { title: true, cost: true, stock: true, image: true },
          })
          .then((r) => r.docs as Doc[]),
  ]);

  let clientsMetrics: PartnerClientsMetrics | null = null;

  if (isMetier) {
    const actifs = clients.filter((c) => isBillableClient(c));
    const caMonthly = actifs.reduce((s, c) => s + (Number(c.caPaye) || 0), 0);
    const commissionRate = Number((partner as Doc | null)?.commissionRate) || 0;
    const since12 = monthStart(11).getTime();

    clientsMetrics = {
      active: actifs.length,
      total: clients.length,
      caMonthly,
      commissionRate,
      commissionMonthly: Math.round((caMonthly * commissionRate) / 100),
      signedLast12: clients.filter(
        (c) => c.signatureDate && Date.parse(c.signatureDate) >= since12,
      ).length,
      // Tous les statuts, y compris à zéro : la répartition se lit aussi par ce
      // qui manque (aucun prospect = pipeline vide).
      byStatus: DONUT_ORDER.map((value) => {
        const s = clientStatusMeta(value);
        return {
          key: value,
          label: s?.label ?? value,
          count: clients.filter((c) => c.clientStatus === value).length,
          color: s?.color ?? "var(--tim-gray)",
        };
      }),
      top: actifs
        .map((c) => ({ label: String(c.companyName ?? "—"), value: Number(c.caPaye) || 0 }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 5),
      series: buildMonthlySeries(clients, 12),
    };
  }

  const pointsBalance = ptx.reduce((s, t) => s + (Number(t.delta) || 0), 0);

  let userMetrics: PartnerUserMetrics | null = null;

  if (!isMetier) {
    // Une mission déjà soumise (quel que soit le verdict) sort de la liste :
    // la reproposer laisserait croire qu'elle rapporte encore.
    const done = new Set(
      subs
        .map((s) => (s.mission && typeof s.mission === "object" ? s.mission.id : s.mission))
        .filter((v) => v != null)
        .map(String),
    );
    const missionsToDo = missions
      .filter((m) => !done.has(String(m.id)))
      .map((m) => ({
        id: m.id,
        title: String(m.title ?? "Mission"),
        points: Number(m.points) || 0,
        image: m.logo && typeof m.logo === "object" ? (m.logo.url ?? null) : null,
      }));

    const teaser = (r: Doc): RewardTeaser => {
      const img = r.image && typeof r.image === "object" ? (r.image.url ?? null) : null;
      const cost = Number(r.cost) || 0;
      return {
        id: r.id,
        title: String(r.title ?? "Récompense"),
        cost,
        image: img,
        missing: Math.max(0, cost - pointsBalance),
      };
    };
    // `stock === 0` = épuisée : jamais proposée comme objectif.
    const available = rewards.filter((r) => Number(r.stock) !== 0).map(teaser);

    userMetrics = {
      earned: ptx.reduce((s, t) => s + Math.max(0, Number(t.delta) || 0), 0),
      // `Math.abs` et non `* -1` : sans somme négative, ce dernier donne « -0 ».
      spent: Math.abs(ptx.reduce((s, t) => s + Math.min(0, Number(t.delta) || 0), 0)),
      missionsToDo,
      pointsToGrab: missionsToDo.reduce((s, m) => s + m.points, 0),
      // Les plus chères d'abord : la plus belle des récompenses accessibles
      // se voit en premier.
      reachable: available.filter((r) => r.missing === 0).sort((a, b) => b.cost - a.cost),
      nextReward: available.filter((r) => r.missing > 0).sort((a, b) => a.cost - b.cost)[0] ?? null,
      topReward: [...available].sort((a, b) => b.cost - a.cost)[0] ?? null,
      topRewards: [...available].sort((a, b) => b.cost - a.cost).slice(0, 8),
    };
  }

  return {
    isMetier,
    pointsBalance,
    submissions: {
      pending: subs.filter((s) => s.status === "pending").length,
      approved: subs.filter((s) => s.status === "approved").length,
      total: subs.length,
    },
    orders: {
      pending: orders.filter((o) => o.status === "pending").length,
      total: orders.length,
    },
    clients: clientsMetrics,
    user: userMetrics,
  };
}
