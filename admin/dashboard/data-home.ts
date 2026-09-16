import type { PayloadRequest, Where } from "payload";

import { CLOSED_STATUSES } from "@/modules/marketing/lib/due-emails";
import { STEPS_DONE_ON_SEND, isStepDone } from "@/modules/marketing/lib/journey";
import { countByMonth, lastMonths } from "@/modules/analytics/lib/growth";
import { pendingValidations } from "@/modules/partner/lib/billing-validation";
import { isPipelineStatus } from "@/modules/partner/lib/clientStatus";
import { isBillableClient } from "@/modules/partner/lib/pricing";

import { chargerParcoursAgenda, getTodayAgenda, type AgendaData, type RunRow } from "./data-agenda";
import { euros, plain } from "./format";
import type { IconName } from "./icons";

/**
 * L'accueil, réduit à sa question : « qu'est-ce qui demande mon action ? ».
 *
 * L'ancien tableau de bord empilait quatre compartiments de chiffres (support,
 * partenaires, éditorial, système) que la section Analyses donne déjà, en
 * mieux et sur une période choisie. Ce qui manquait, c'était l'inverse : les
 * choses vivantes — une phase de test qui finit dans trois jours, un Go/No-Go
 * qui attend TIM, une opportunité que personne n'a touchée depuis deux
 * semaines. C'est ce qu'on lit ici, et seulement ça.
 *
 * Deux blocs, dans l'ordre où on les lit le matin :
 *   1. AUJOURD'HUI — l'agenda (data-agenda.ts), inchangé sur le fond.
 *   2. PHASES DE TEST — une carte par parcours ouvert : où il en est, ce qui
 *      l'attend, qui doit agir.
 *   + quatre chiffres, chacun renvoyant vers sa page d'analyse,
 *   + douze mois croisés : le CA en bâtons, les entrées (prospects, clients)
 *     en lignes — deux panneaux alignés, jamais un double axe.
 *
 * Même discipline que le reste : lecture serveur, sélection minimale, jamais
 * plus de cinq requêtes en parallèle (pooler Supabase à 15 connexions). Un
 * partenaire-métier lit le MÊME écran, scopé à sa fiche.
 */

const DAY_MS = 86_400_000;

export type TestCard = {
  runId: number | string;
  client: string;
  clientId: number | string | null;
  partner: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  /** Jour courant du test (1 = premier jour), null avant le démarrage. */
  day: number | null;
  total: number | null;
  /** 0–100, pour la barre. */
  progress: number;
  /** Jours restants (négatif : dépassé), null sans date de fin. */
  daysLeft: number | null;
  /** L'étape sur laquelle le parcours est arrêté, et qui doit la faire. */
  next: { label: string; actor: string; blocked: boolean } | null;
  href: string;
};

export type FigureTone = "brand" | "green" | "indigo" | "amber";

export type KeyFigure = {
  key: string;
  icon: IconName;
  /** La couleur du pictogramme — une par chiffre, pour les reconnaître sans lire. */
  tone: FigureTone;
  label: string;
  value: string;
  sub?: string | null;
  href: string;
  /** Vers quoi mène le lien — « Analyses » ou une liste. */
  cta: string;
};

export type MonthRow = {
  /** 1er du mois, ISO. */
  month: string;
  /** Σ CA HT / mois d'après la ligne d'historique en vigueur ce mois-là. */
  ca: number;
  /** Fiches créées ce mois-là — les entrées dans le pipeline. */
  prospects: number;
  /** Signatures ce mois-là. */
  clients: number;
};

export type HomeData = {
  now: number;
  agenda: AgendaData;
  tests: TestCard[];
  figures: KeyFigure[];
  months: MonthRow[];
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type Doc = Record<string, any>;

const idOf = (v: unknown): number | string | null =>
  v && typeof v === "object" ? ((v as { id?: number | string }).id ?? null) : ((v as number | string) ?? null);

const nameOf = (v: unknown): string | null =>
  v && typeof v === "object" ? ((v as { companyName?: string; displayName?: string }).companyName ?? (v as { displayName?: string }).displayName ?? null) : null;

/**
 * Étape qui attend QUELQU'UN : pas celle qui s'acquiert toute seule.
 *
 * `autoValidate` ne veut pas dire « sans personne » : le dossier de démarrage
 * attend le client, le provisionnement attend TIM — le logiciel ne fait que
 * constater le geste. N'attendent personne : une étape déjà ARMÉE (le compte à
 * rebours court), et les conseils d'usage, cochés par l'envoi du cron.
 */
const attendQuelquUn = (step: { key?: string | null; state?: string | null }): boolean =>
  step.state !== "auto" && !STEPS_DONE_ON_SEND.has(step.key ?? "");

/**
 * L'étape sur laquelle un parcours est ARRÊTÉ : la première non acquise qui
 * attend quelqu'un.
 *
 * C'est elle qui dit qui doit agir. Montrer une étape automatique comme
 * « prochaine étape » ferait chercher une action là où il n'y en a pas. Une
 * étape bloquée, elle, compte comme l'arrêt — quelqu'un a constaté qu'elle ne
 * pouvait pas se faire, et c'est bien là que le parcours attend.
 */
const etapeCourante = (run: RunRow, nowMs: number) =>
  (run.steps ?? []).find((s) => !isStepDone(s, nowMs) && (attendQuelquUn(s) || s.state === "bloque")) ?? null;

const ACTOR_LABEL: Record<string, string> = {
  admin: "TIM",
  partenaire: "Partenaire",
  client: "Client",
};

export const actorLabel = (actor?: string | null): string => (actor && ACTOR_LABEL[actor]) || "—";

/** Une carte de phase de test, depuis un parcours ouvert. */
const versCarte = (run: RunRow, nowMs: number, adminRoute: string): TestCard => {
  const start = run.startDate ? Date.parse(run.startDate) : NaN;
  const end = run.endDate ? Date.parse(run.endDate) : NaN;
  const total = !Number.isNaN(start) && !Number.isNaN(end) ? Math.max(1, Math.round((end - start) / DAY_MS)) : null;
  const started = !Number.isNaN(start) && start <= nowMs;
  const day = started && total ? Math.min(total, Math.floor((nowMs - start) / DAY_MS) + 1) : null;
  const daysLeft = !Number.isNaN(end) ? Math.ceil((end - nowMs) / DAY_MS) : null;
  const courante = etapeCourante(run, nowMs);

  return {
    runId: run.id,
    client: nameOf(run.client) ?? "Client",
    clientId: idOf(run.client),
    partner: nameOf(run.partner),
    status: run.status ?? "en-cours",
    startDate: run.startDate ?? null,
    endDate: run.endDate ?? null,
    day,
    total,
    progress: day && total ? Math.round((day / total) * 100) : 0,
    daysLeft,
    next: courante
      ? {
          label: courante.label ?? courante.key ?? "Étape",
          actor: courante.actor ?? "",
          blocked: courante.state === "bloque",
        }
      : null,
    href: `${adminRoute}/collections/journey-runs/${run.id}`,
  };
};

/**
 * Douze mois, croisés : le CA d'un côté, les entrées de l'autre.
 *
 * Le CA vient de l'`history` des fiches — la ligne en vigueur ce mois-là,
 * pour un contrat déjà démarré et pas encore résilié — comme dans Analyses →
 * Facturation. Un mois sans ligne n'est pas un mois à zéro : le contrat court,
 * on reporte la dernière valeur connue. Les prospects sont les fiches créées,
 * les clients les signatures. Le mois en cours est en dernier, incomplet par
 * nature — c'est l'agenda du mois, pas un bilan.
 */
export function monthlyRows(fiches: Doc[], nowMs: number, months = 12): MonthRow[] {
  const now = new Date(nowMs);
  const prospects = countByMonth(fiches, (c) => c.createdAt, months, now);
  const signes = countByMonth(fiches, (c) => c.signatureDate, months, now);

  return lastMonths(months, now).map((month, i) => {
    const debut = Date.parse(month);
    const m = new Date(month);
    const finDuMois = Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0, 23, 59, 59);
    const asOf = Math.min(finDuMois, nowMs);

    let ca = 0;
    for (const c of fiches) {
      const start = c.contractStartDate ? Date.parse(c.contractStartDate) : NaN;
      if (Number.isNaN(start) || start > asOf) continue;
      if (c.resiliationDate && Date.parse(c.resiliationDate) < debut) continue;
      const enVigueur = ((c.history ?? []) as Doc[])
        .filter((h) => h?.at && Date.parse(h.at) <= finDuMois)
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
      ca += Number(enVigueur?.caHT) || 0;
    }

    return { month, ca: Math.round(ca), prospects: prospects[i].count, clients: signes[i].count };
  });
}

export async function getHomeData(
  req: PayloadRequest,
  adminRoute: string,
  options: {
    /** Partenaire-métier connecté : tout est scopé à sa fiche. */
    partnerId?: number | string | null;
    /** Vue admin : tous les partenaires, et les tickets dans les chiffres. */
    admin: boolean;
  },
): Promise<HomeData> {
  const { payload } = req;
  const now = Date.now();
  const { partnerId, admin } = options;
  const scoped = (clauses: Where[]): Where => {
    const all = partnerId != null ? [{ partner: { equals: partnerId } }, ...clauses] : clauses;
    return all.length ? { and: all } : {};
  };
  const base = { depth: 0 as const, overrideAccess: true as const, req };

  // ── Lot 1 : les parcours (partagés avec l'agenda) et les opportunités
  const [parcours, fiches] = await Promise.all([
    chargerParcoursAgenda(req, now, partnerId),
    payload
      .find({
        ...base,
        collection: "partner-clients",
        // TOUTES les fiches, closes comprises : un client résilié en mai a
        // bien pesé dans le CA de mars. Les chiffres du jour filtrent ensuite.
        where: scoped([]),
        limit: 3000,
        pagination: false,
        select: {
          companyName: true,
          clientStatus: true,
          partner: true,
          createdAt: true,
          caPaye: true,
          commissionMonthly: true,
          contractStartDate: true,
          signatureDate: true,
          resiliationDate: true,
          history: true,
        },
      })
      .then((r) => r.docs as Doc[])
      .catch(() => [] as Doc[]),
  ]);

  const clients = fiches.filter((c) => !["archive", "resilie", "perdue"].includes(c.clientStatus));

  // ── Lot 2 : l'agenda (sur les parcours déjà lus) et les compteurs de sujets
  const count = (collection: string, where: Where) =>
    payload.count({ collection: collection as never, where, overrideAccess: true, req }).then((r) => r.totalDocs).catch(() => 0);

  const [agenda, ticketsUrgent, ticketsOpen] = await Promise.all([
    getTodayAgenda(req, adminRoute, now, { partnerId, parcours }),
    admin
      ? count("tickets", { and: [{ priority: { equals: "urgent" } }, { status: { not_equals: "resolved" } }] })
      : Promise.resolve(0),
    admin ? count("tickets", { status: { not_equals: "resolved" } }) : Promise.resolve(0),
  ]);

  // ── Phases de test : une carte par parcours ouvert, la plus pressée d'abord
  const ouverts = parcours.filter((r) => !CLOSED_STATUSES.includes(r.status ?? ""));
  const tests = ouverts
    .map((r) => versCarte(r, now, adminRoute))
    .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));

  // ── Chiffres clés : quatre, chacun avec sa porte vers l'analyse
  const factures = clients.filter((c) => isBillableClient(c));
  const caMensuel = factures.reduce((n, c) => n + (Number(c.caPaye) || 0), 0);
  const actifs = clients.filter((c) => c.clientStatus === "actif").length;
  const enTest = clients.filter((c) => c.clientStatus === "en-test").length;
  const ouvertes = clients.filter((c) => isPipelineStatus(c.clientStatus)).length;
  const nouvelles = clients.filter(
    (c) => isPipelineStatus(c.clientStatus) && c.createdAt && now - Date.parse(c.createdAt) <= 7 * DAY_MS,
  );

  // Ce qui reste à signer sur le rapprochement, depuis la base seule : le
  // chiffre du CA mène alors à l'écran de validation plutôt qu'à l'analyse.
  const aValider = admin ? pendingValidations(fiches as never, new Date(now)).length : 0;

  const figures: KeyFigure[] = admin
    ? [
        {
          key: "ca",
          icon: "euro",
          tone: "brand",
          label: "CA mensuel HT",
          value: euros(caMensuel),
          sub: aValider
            ? `${aValider} facture${aValider > 1 ? "s" : ""} à valider`
            : `${factures.length} client${factures.length > 1 ? "s" : ""} facturé${factures.length > 1 ? "s" : ""}, tout est validé`,
          href: aValider ? "/admin/facturation?f=a-valider" : "/admin/analyses/facturation",
          cta: aValider ? "Rapprochement" : "Analyse facturation",
        },
        {
          key: "clients",
          icon: "building",
          tone: "green",
          label: "Clients actifs",
          value: plain(actifs),
          sub: enTest ? `+ ${enTest} en phase de test` : "aucune phase de test en cours",
          href: "/admin/analyses/pipeline",
          cta: "Clients & pipeline",
        },
        {
          key: "pipeline",
          icon: "target",
          tone: "indigo",
          label: "Opportunités ouvertes",
          value: plain(ouvertes),
          sub: nouvelles.length ? `${nouvelles.length} nouvelle${nouvelles.length > 1 ? "s" : ""} cette semaine` : "aucune nouvelle cette semaine",
          href: "/admin/analyses/acquisition",
          cta: "Analyse acquisition",
        },
        {
          key: "tickets",
          icon: "ticket",
          tone: "amber",
          label: "Tickets ouverts",
          value: plain(ticketsOpen),
          sub: ticketsUrgent ? `dont ${ticketsUrgent} urgent${ticketsUrgent > 1 ? "s" : ""}` : "aucun urgent",
          href: "/admin/analyses/support",
          cta: "Analyse support",
        },
      ]
    : [
        {
          key: "clients",
          icon: "building",
          tone: "green",
          label: "Clients actifs",
          value: plain(actifs),
          sub: enTest ? `+ ${enTest} en phase de test` : `${ouvertes} opportunité${ouvertes > 1 ? "s" : ""} ouverte${ouvertes > 1 ? "s" : ""}`,
          href: `${adminRoute}/collections/partner-clients`,
          cta: "Mes clients",
        },
        {
          key: "ca",
          icon: "euro",
          tone: "brand",
          label: "CA payé HT / mois",
          value: euros(caMensuel),
          sub: "clients actifs uniquement",
          href: `${adminRoute}/collections/partner-clients`,
          cta: "Mes clients",
        },
        {
          key: "commission",
          icon: "coins",
          tone: "amber",
          label: "Ma commission / mois",
          value: euros(factures.reduce((n, c) => n + (Number(c.commissionMonthly) || 0), 0)),
          sub: "sur les clients facturés",
          href: `${adminRoute}/collections/partner-clients`,
          cta: "Mes clients",
        },
        {
          key: "signed",
          icon: "check",
          tone: "indigo",
          label: "Clients signés",
          value: plain(
            clients.filter((c) => c.signatureDate && now - Date.parse(c.signatureDate) <= 365 * DAY_MS).length,
          ),
          sub: "sur les 12 derniers mois",
          href: `${adminRoute}/collections/partner-clients?where[clientStatus][equals]=actif`,
          cta: "Mes clients",
        },
      ];

  return { now, agenda, tests, figures, months: monthlyRows(fiches, now) };
}
