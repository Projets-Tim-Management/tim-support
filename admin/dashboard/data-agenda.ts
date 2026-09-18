import type { PayloadRequest, Where } from "payload";

import { taskKindLabel } from "@/modules/partner/lib/activity";

import { CLOSED_STATUSES } from "@/modules/marketing/lib/due-emails";
import { isStepDone } from "@/modules/marketing/lib/journey";
import { partnerStepsOnAgenda, type PartnerStep } from "@/modules/marketing/lib/partner-steps";
import { enRetard, parisDayKey, type AgendaItem } from "./agenda";

/**
 * Les rendez-vous du jour, lus en trois requêtes ciblées.
 *
 * Même discipline que le reste du dashboard (voir data.ts) : lecture serveur,
 * `depth: 0`, sélection minimale, aucune agrégation en base — la journée d'une
 * équipe tient dans quelques lignes.
 *
 * Le regroupement par jour se fait en heure de PARIS, jamais sur la chaîne ISO :
 * un rendez-vous de 22:30 est le lendemain en UTC l'hiver, et disparaîtrait de
 * la journée à laquelle il appartient.
 */

export type RunRow = {
  id: number | string;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  reviewAt?: string | null;
  sessionAt?: string | null;
  sessionMode?: string | null;
  sessionLink?: string | null;
  client?: { id?: number | string; companyName?: string } | number | string | null;
  partner?: { id?: number | string; displayName?: string | null } | number | string | null;
  steps?: (PartnerStep & { autoAt?: string | null })[] | null;
};

/**
 * La session a-t-elle eu lieu ? C'est l'étape « Session de prise en main
 * réalisée » du parcours qui le dit — cochée par le partenaire, ou acquise
 * d'elle-même le lendemain du créneau (voir SELF_VALIDATING_STEPS).
 */
const sessionFaite = (r: RunRow, nowMs: number): boolean => {
  const step = (r.steps ?? []).find((s) => s.key === "prise-en-main");
  return step ? isStepDone(step, nowMs) : false;
};

type TaskRow = {
  id: number | string;
  attempts?: unknown[] | null;
  title?: string | null;
  taskKind?: string | null;
  dueDate?: string | null;
  done?: boolean | null;
  client?: { id?: number | string; companyName?: string } | number | string | null;
};

const nomClient = (c: RunRow["client"]): string | null =>
  c && typeof c === "object" ? (c.companyName ?? null) : null;

const idClient = (c: TaskRow["client"]): number | string | null => {
  if (c == null) return null;
  if (typeof c === "object") return c.id ?? null;
  return c;
};

/**
 * Rend AUSSI l'instant retenu.
 *
 * L'horloge se lit ici, dans la couche données — un composant qui la lit
 * pendant son rendu n'est pas idempotent. Et la vue a besoin de la MÊME
 * seconde pour désigner le prochain rendez-vous : deux lectures, et la liste
 * peut ne pas correspondre à ce qu'elle met en avant.
 */
export type AgendaData = {
  now: number;
  /** Tout le mois affiché : le jour sélectionné se filtre à l'écran. */
  items: AgendaItem[];
  /** Tâches datées d'avant aujourd'hui et toujours pas cochées. */
  retard: AgendaItem[];
};

/** Les six semaines de la grille, autour du jour courant. */
export const fenetreAgenda = (maintenant: number): { jour: string; debut: string; fin: string } => {
  const jour = parisDayKey(maintenant);
  const premier = Date.parse(`${jour.slice(0, 7)}-01T00:00:00.000Z`);
  return {
    jour,
    debut: new Date(premier - 10 * 86_400_000).toISOString(),
    fin: new Date(premier + 50 * 86_400_000).toISOString(),
  };
};

/**
 * Les parcours qui ont quelque chose à mettre sur l'agenda : une session dans
 * la fenêtre, OU encore ouverts — leurs étapes qui attendent le partenaire
 * sont datées, et ces dates sont des rendez-vous comme les autres.
 *
 * Exportée à part : l'accueil lit les MÊMES parcours pour ses cartes de phase
 * de test, et une lecture suffit pour les deux (voir data-home.ts).
 */
export async function chargerParcoursAgenda(
  req: PayloadRequest,
  maintenant: number,
  partnerId?: number | string | null,
): Promise<RunRow[]> {
  const { debut, fin } = fenetreAgenda(maintenant);
  const fenetre: Where = {
    or: [
      {
        and: [{ sessionAt: { greater_than_equal: debut } }, { sessionAt: { less_than_equal: fin } }],
      },
      { status: { not_in: CLOSED_STATUSES } },
    ],
  };
  return req.payload
    .find({
      collection: "journey-runs",
      where: partnerId != null ? { and: [{ partner: { equals: partnerId } }, fenetre] } : fenetre,
      // `depth: 1` pour le nom du client : une ligne d'agenda sans nom
      // d'entreprise n'aide personne à savoir qui il voit à 10 h.
      depth: 1,
      limit: 300,
      overrideAccess: true,
      req,
    })
    .then((r) => r.docs as RunRow[])
    .catch(() => [] as RunRow[]);
}

export async function getTodayAgenda(
  req: PayloadRequest,
  adminRoute: string,
  maintenant: number = Date.now(),
  options: {
    /** Un partenaire ne voit que SES parcours et SES tâches. */
    partnerId?: number | string | null;
    /** Parcours déjà lus par l'appelant : on ne les relit pas. */
    parcours?: RunRow[];
  } = {},
): Promise<AgendaData> {
  const payload = req.payload;
  const { partnerId } = options;
  const { jour, debut, fin } = fenetreAgenda(maintenant);
  /** Restreint une requête de tâches au partenaire, quand il y en a un. */
  const scope = (clauses: Where[]): Where[] =>
    partnerId != null ? [{ partner: { equals: partnerId } }, ...clauses] : clauses;

  /**
   * Fenêtre unique : les six semaines de la grille.
   *
   * Cliquer une date ne doit pas repartir en base — le mois tient dans une
   * poignée de lignes, on le charge une fois et l'écran filtre. Trois requêtes
   * au total, au lieu d'une par jour consulté.
   */
  const [parcours, taches, tachesEnRetard] = await Promise.all([
    options.parcours ?? chargerParcoursAgenda(req, maintenant, partnerId),
    payload
      .find({
        collection: "client-activities",
        where: {
          and: scope([
            // Le champ s'appelle `type` (note / email / tache / systeme).
            { type: { equals: "tache" } },
            { dueDate: { greater_than_equal: debut } },
            { dueDate: { less_than_equal: fin } },
          ]),
        },
        depth: 1,
        limit: 500,
        overrideAccess: true,
        req,
      })
      .then((r) => r.docs as TaskRow[])
      .catch(() => [] as TaskRow[]),
    /**
     * Les tâches EN SOUFFRANCE : datées d'avant aujourd'hui, jamais cochées.
     *
     * Bornées à 30 jours et à 20 lignes : au-delà, ce n'est plus un retard mais
     * un ménage à faire, et une liste sans fin en tête du tableau de bord ne se
     * lit plus. Les sessions n'y figurent pas — une session passée a eu lieu ou
     * non, elle ne « traîne » pas.
     */
    payload
      .find({
        collection: "client-activities",
        where: {
          and: scope([
            { type: { equals: "tache" } },
            { done: { not_equals: true } },
            { dueDate: { greater_than_equal: new Date(maintenant - 30 * 86_400_000).toISOString() } },
            { dueDate: { less_than: `${jour}T00:00:00.000Z` } },
          ]),
        },
        depth: 1,
        limit: 20,
        sort: "dueDate",
        overrideAccess: true,
        req,
      })
      .then((r) => r.docs as TaskRow[])
      .catch(() => [] as TaskRow[]),
  ]);

  /** Une ligne d'historique devient une ligne d'agenda. */
  const versItem = (t: TaskRow): AgendaItem => ({
    id: `tache-${t.id}`,
    at: t.dueDate as string,
    kind: t.taskKind ?? "a-faire",
    label: taskKindLabel(t.taskKind) ?? "Tâche",
    title: t.title?.trim() || (taskKindLabel(t.taskKind) ?? "Tâche"),
    client: typeof t.client === "object" ? (t.client?.companyName ?? null) : null,
    // On ouvre l'OPPORTUNITÉ, pas la ligne d'historique : c'est là qu'on trouve
    // le téléphone, le contexte et de quoi noter l'échange.
    href: `${adminRoute}/collections/partner-clients/${idClient(t.client) ?? ""}`,
    done: Boolean(t.done),
    taskId: t.id,
    attempts: Array.isArray(t.attempts) ? t.attempts.length : 0,
  });

  const dansLaFenetre = (iso: string): boolean => iso >= debut && iso <= fin;

  /**
   * Une étape de parcours devient une ligne d'agenda — et une ligne qu'on
   * COCHE : `etape` porte de quoi écrire sur le parcours, et le parcours porte
   * l'état qu'on relit ici. Une seule vérité, deux écrans.
   *
   * On ouvre le PARCOURS, pas la fiche client : c'est là que vivent l'étape,
   * sa note, et les autres relevés autour.
   */
  const etapes: AgendaItem[] = parcours
    .filter((r) => !CLOSED_STATUSES.includes(r.status ?? ""))
    .flatMap((r) =>
      partnerStepsOnAgenda(r).map(({ step, due, done }) => ({
        id: `etape-${r.id}-${step.key ?? ""}`,
        at: due,
        kind: "etape",
        label: "Phase de test",
        title: step.label ?? "Étape du parcours",
        client: nomClient(r.client),
        href: `${adminRoute}/collections/journey-runs/${r.id}`,
        done,
        allDay: true,
        etape: { runId: r.id, key: step.key ?? "" },
      })),
    );

  const items: AgendaItem[] = [
    ...parcours
      .filter((r) => r.sessionAt && dansLaFenetre(r.sessionAt))
      .map((r) => ({
        id: `session-${r.id}`,
        at: r.sessionAt as string,
        kind: "session",
        label: "Prise en main",
        title: "Session de prise en main",
        client: nomClient(r.client),
        href: `${adminRoute}/collections/journey-runs/${r.id}`,
        link: r.sessionLink ?? null,
        mode: r.sessionMode ?? null,
        done: sessionFaite(r, maintenant),
      })),
    ...taches.filter((t) => t.dueDate).map(versItem),
    ...etapes.filter((e) => dansLaFenetre(e.at)),
  ];

  // Même borne que les tâches : au-delà de 30 jours, ce n'est plus un retard.
  const plancherRetard = new Date(maintenant - 30 * 86_400_000).toISOString();

  return {
    now: maintenant,
    items: items.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
    retard: enRetard(
      [
        ...tachesEnRetard.filter((t) => t.dueDate).map(versItem),
        ...etapes.filter((e) => e.at >= plancherRetard),
      ],
      jour,
    ),
  };
}
