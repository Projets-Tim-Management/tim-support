/**
 * L'agenda du jour, réduit à sa règle.
 *
 * Deux sources qui n'ont rien à voir entre elles — une session de prise en main
 * vit sur un parcours, un appel à passer sur une opportunité — mais une seule
 * question le matin : « qu'est-ce que j'ai aujourd'hui ? ». On les met donc dans
 * la même liste, triée par heure, et c'est la pastille qui dit la nature.
 *
 * Pur : le tri, l'ordre et le passé se testent sans base ni horloge réelle.
 */

export type AgendaItem = {
  /** Identifiant d'affichage, unique dans la liste. */
  id: string;
  /** Instant du rendez-vous (ISO). */
  at: string;
  /** Nature, pour la pastille : `session` ou une clé de TASK_KINDS. */
  kind: string;
  label: string;
  /** Ce qui est prévu — objet de la tâche, ou « Session de prise en main ». */
  title: string;
  /** Chez qui. */
  client: string | null;
  /** Fiche à ouvrir. */
  href: string;
  /** Visio à rejoindre, quand il y en a une. */
  link?: string | null;
  /** En visio, sur place… — seulement pour les sessions. */
  mode?: string | null;
  /** Déjà cochée : on la garde, barrée, plutôt que de la faire disparaître. */
  done?: boolean;
};

/** Jour civil à Paris, pour comparer des instants stockés en UTC. */
export const parisDayKey = (value: string | number | Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", dateStyle: "short" }).format(
    new Date(value),
  );

/** Heure à Paris, « 09:30 ». */
export const parisTime = (value: string | number | Date): string =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

/**
 * Ne garde que le jour demandé, et trie par heure.
 *
 * Le tri est la seule chose qui compte vraiment ici : une liste de rendez-vous
 * dans le désordre oblige à tout lire pour trouver le prochain, ce qui est
 * exactement ce qu'on venait éviter.
 */
export const agendaDuJour = (items: AgendaItem[], jour: string): AgendaItem[] =>
  items
    .filter((i) => parisDayKey(i.at) === jour)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

/**
 * Les deux lignes d'un rendez-vous : quoi, puis chez qui.
 *
 * Une tâche créée sans être renommée s'appelle comme sa nature — « Appel ».
 * Affichée telle quelle à côté de sa pastille, la ligne disait « Appel · Appel ·
 * Bironalu » : trois mots pour deux informations. Quand le titre ne fait que
 * répéter la nature, c'est le CLIENT qui devient la ligne principale — c'est lui
 * qu'on cherche à 15 h.
 */
export const lignesAgenda = (item: AgendaItem): { principal: string; secondaire: string | null } => {
  const repete = item.title.trim().toLowerCase() === item.label.trim().toLowerCase();
  if (repete && item.client) return { principal: item.client, secondaire: null };
  return { principal: item.title, secondaire: item.client };
};

/**
 * Ce qui traîne : daté d'AVANT aujourd'hui et toujours pas coché.
 *
 * Sans cette liste, une tâche non faite disparaissait du tableau de bord le
 * lendemain à minuit — l'écran redevenait calme alors que le travail, lui,
 * restait. Le plus ancien d'abord : c'est celui qui a le plus attendu.
 */
export const enRetard = (items: AgendaItem[], jour: string): AgendaItem[] =>
  items
    .filter((i) => !i.done && parisDayKey(i.at) < jour)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

/** Retard en clair : « hier », « il y a 3 jours ». */
export const depuisQuand = (item: AgendaItem, jour: string): string => {
  const jours = Math.round(
    (Date.parse(`${jour}T12:00:00.000Z`) - Date.parse(`${parisDayKey(item.at)}T12:00:00.000Z`)) /
      86_400_000,
  );
  if (jours <= 1) return "hier";
  if (jours < 7) return `il y a ${jours} jours`;
  if (jours < 31) return `il y a ${Math.round(jours / 7)} sem.`;
  return `il y a ${Math.round(jours / 30)} mois`;
};

// ─── Calendrier du mois ──────────────────────────────────────────────────────

export type JourCalendrier = {
  /** Jour civil parisien, `YYYY-MM-DD`. */
  date: string;
  /** Numéro affiché (1–31). */
  numero: number;
  /** Appartient au mois affiché — les autres restent visibles, en pâle. */
  dansLeMois: boolean;
  aujourdHui: boolean;
  /** Actions datées ce jour-là, et celles qui restent à faire. */
  total: number;
  restants: number;
};

/** Ajoute des jours à une clé `YYYY-MM-DD` sans jamais repasser par un fuseau. */
const plusDeJours = (jour: string, n: number): string =>
  new Date(Date.parse(`${jour}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Lundi de la semaine contenant `jour` (la semaine française commence lundi). */
const lundiDe = (jour: string): string => {
  const d = new Date(`${jour}T00:00:00.000Z`).getUTCDay(); // 0 = dimanche
  return plusDeJours(jour, d === 0 ? -6 : 1 - d);
};

/**
 * La grille du mois : SIX semaines, toujours.
 *
 * Un calendrier qui compte cinq lignes en février et six en mars change de
 * hauteur d'un mois à l'autre — or il est posé à côté d'un autre bloc, dont il
 * doit épouser la hauteur. Six lignes couvrent tous les cas, y compris un mois
 * de 31 jours commençant un dimanche.
 *
 * @param compteurs actions par jour, indexées sur la clé `YYYY-MM-DD`.
 */
export const grilleDuMois = (
  jour: string,
  compteurs: Map<string, { total: number; restants: number }>,
): JourCalendrier[][] => {
  const premier = `${jour.slice(0, 7)}-01`;
  const depart = lundiDe(premier);
  const moisAffiche = jour.slice(0, 7);

  const semaines: JourCalendrier[][] = [];
  for (let s = 0; s < 6; s += 1) {
    const semaine: JourCalendrier[] = [];
    for (let j = 0; j < 7; j += 1) {
      const date = plusDeJours(depart, s * 7 + j);
      const c = compteurs.get(date);
      semaine.push({
        date,
        numero: Number(date.slice(8, 10)),
        dansLeMois: date.slice(0, 7) === moisAffiche,
        aujourdHui: date === jour,
        total: c?.total ?? 0,
        restants: c?.restants ?? 0,
      });
    }
    semaines.push(semaine);
  }
  return semaines;
};

/** Compte les actions par jour — une entrée par journée occupée. */
export const compterParJour = (
  items: AgendaItem[],
): Map<string, { total: number; restants: number }> => {
  const out = new Map<string, { total: number; restants: number }>();
  for (const i of items) {
    const cle = parisDayKey(i.at);
    const c = out.get(cle) ?? { total: 0, restants: 0 };
    c.total += 1;
    if (!i.done) c.restants += 1;
    out.set(cle, c);
  }
  return out;
};

/** « septembre 2026 », pour le titre du calendrier. */
export const nomDuMois = (jour: string): string =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", month: "long", year: "numeric" }).format(
    new Date(`${jour}T00:00:00.000Z`),
  );
