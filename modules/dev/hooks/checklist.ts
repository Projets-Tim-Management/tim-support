import type { CollectionBeforeChangeHook } from "payload";

/**
 * La checklist d'une feature : ce que le système inscrit tout seul.
 *
 * Deux choses qu'on ne veut pas voir saisies à la main — l'auteur et la date
 * d'un commentaire (ils seraient faux dès la première distraction), et
 * l'avancement affiché dans la liste des features.
 */

type Comment = { body?: unknown; author?: unknown; at?: unknown };
type Item = { done?: unknown; comments?: unknown };

const itemsOf = (value: unknown): Item[] =>
  Array.isArray(value) ? value.filter((i): i is Item => Boolean(i) && typeof i === "object") : [];

/**
 * Auteur et date d'un commentaire, posés à l'écriture et jamais réécrits.
 *
 * Jamais réécrits, c'est le point : un commentaire reste de qui l'a écrit et du
 * jour où il l'a écrit, même si quelqu'un d'autre rouvre la feature et
 * l'enregistre six mois plus tard. On ne complète donc que ce qui est vide —
 * ce qui, dans un fil, ne peut être que le commentaire qu'on vient d'ajouter.
 */
export const stampChecklistComments: CollectionBeforeChangeHook = ({ data, req }) => {
  const items = itemsOf(data?.checklist);
  if (items.length === 0) return data;

  const now = new Date().toISOString();
  const userId = (req?.user as { id?: string | number } | undefined)?.id;

  for (const item of items) {
    const comments = itemsOf(item.comments);
    if (comments.length === 0) continue;

    /**
     * Une ligne sans texte est une ligne ajoutée puis abandonnée : on la retire
     * plutôt que de l'horodater. Elle prendrait sinon l'apparence d'un vrai
     * message dans le fil — et, tant que `body` était obligatoire, elle
     * bloquait l'enregistrement de la fiche entière sans qu'aucun écran ne
     * permette de la corriger.
     */
    const written = comments.filter(
      (c) => typeof (c as Comment).body === "string" && ((c as Comment).body as string).trim() !== "",
    );
    if (written.length !== comments.length) item.comments = written;

    for (const raw of written) {
      const comment = raw as Comment;
      if (comment.at == null) comment.at = now;
      if (comment.author == null && userId != null) comment.author = userId;
    }
  }
  return data;
};

/**
 * Avancement « 3/7 », dénormalisé pour la LISTE des features.
 *
 * Sans lui, il fallait ouvrir chaque feature pour savoir où elle en est — or
 * c'est précisément la question qu'on se pose en parcourant la liste. Vide
 * quand il n'y a pas de checklist : « 0/0 » se lirait comme un retard.
 */
export const computeChecklistProgress: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const source = data?.checklist === undefined ? originalDoc?.checklist : data.checklist;
  const items = itemsOf(source);
  data.checklistProgress = items.length === 0 ? null : `${items.filter((i) => i.done).length}/${items.length}`;
  return data;
};
