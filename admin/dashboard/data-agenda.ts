import type { PayloadRequest } from "payload";

import { taskKindLabel } from "@/modules/partner/lib/activity";

import { enRetard, parisDayKey, type AgendaItem } from "./agenda";

/**
 * Les rendez-vous du jour, lus en deux requêtes ciblées.
 *
 * Même discipline que le reste du dashboard (voir data.ts) : lecture serveur,
 * `depth: 0`, sélection minimale, aucune agrégation en base — la journée d'une
 * équipe tient dans quelques lignes.
 *
 * Le regroupement par jour se fait en heure de PARIS, jamais sur la chaîne ISO :
 * un rendez-vous de 22:30 est le lendemain en UTC l'hiver, et disparaîtrait de
 * la journée à laquelle il appartient.
 */

type RunRow = {
  id: number | string;
  sessionAt?: string | null;
  sessionMode?: string | null;
  sessionLink?: string | null;
  client?: { companyName?: string } | number | string | null;
};

type TaskRow = {
  id: number | string;
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
export async function getTodayAgenda(
  req: PayloadRequest,
  adminRoute: string,
  maintenant: number = Date.now(),
): Promise<{
  now: number;
  /** Tout le mois affiché : le jour sélectionné se filtre à l'écran. */
  items: AgendaItem[];
  /** Tâches datées d'avant aujourd'hui et toujours pas cochées. */
  retard: AgendaItem[];
}> {
  const payload = req.payload;
  const jour = parisDayKey(maintenant);

  /**
   * Fenêtre unique : les six semaines de la grille.
   *
   * Cliquer une date ne doit pas repartir en base — le mois tient dans une
   * poignée de lignes, on le charge une fois et l'écran filtre. Trois requêtes
   * au total, au lieu d'une par jour consulté.
   */
  const premier = Date.parse(`${jour.slice(0, 7)}-01T00:00:00.000Z`);
  const debut = new Date(premier - 10 * 86_400_000).toISOString();
  const fin = new Date(premier + 50 * 86_400_000).toISOString();

  const [sessions, taches, tachesEnRetard] = await Promise.all([
    payload
      .find({
        collection: "journey-runs",
        where: {
          and: [{ sessionAt: { greater_than_equal: debut } }, { sessionAt: { less_than_equal: fin } }],
        },
        // `depth: 1` pour le nom du client : une ligne d'agenda sans nom
        // d'entreprise n'aide personne à savoir qui il voit à 10 h.
        depth: 1,
        limit: 200,
        overrideAccess: true,
        req,
      })
      .then((r) => r.docs as RunRow[])
      .catch(() => [] as RunRow[]),
    payload
      .find({
        collection: "client-activities",
        where: {
          and: [
            // Le champ s'appelle `type` (note / email / tache / systeme).
            { type: { equals: "tache" } },
            { dueDate: { greater_than_equal: debut } },
            { dueDate: { less_than_equal: fin } },
          ],
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
          and: [
            { type: { equals: "tache" } },
            { done: { not_equals: true } },
            { dueDate: { greater_than_equal: new Date(maintenant - 30 * 86_400_000).toISOString() } },
            { dueDate: { less_than: `${jour}T00:00:00.000Z` } },
          ],
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
  });

  const items: AgendaItem[] = [
    ...sessions
      .filter((r) => r.sessionAt)
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
      })),
    ...taches.filter((t) => t.dueDate).map(versItem),
  ];

  return {
    now: maintenant,
    items: items.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
    retard: enRetard(tachesEnRetard.filter((t) => t.dueDate).map(versItem), jour),
  };
}
