/**
 * Les questions d'une discussion, et ce qui les tient pour répondues.
 *
 * Un message peut solliciter quelqu'un (`askedTo`). Il reste EN ATTENTE tant que
 * cette personne n'a pas écrit après lui dans le même fil. Rien n'est stocké
 * pour ça — pas de drapeau « résolu » à entretenir, donc rien qui puisse mentir :
 * l'état se déduit du fil lui-même, et une réponse suffit à le changer.
 *
 * Règle volontairement simple : le premier message de la personne sollicitée,
 * postérieur à la question, ferme la question. On ne cherche pas à savoir si le
 * contenu répond vraiment — c'est le travail des humains, pas du code.
 */

export type DiscussionComment = {
  body?: string | null;
  author?: unknown;
  at?: string | null;
  /** Personne dont on attend la réponse. */
  askedTo?: unknown;
};

/** Id d'une relation, qu'elle arrive peuplée ou réduite à son identifiant. */
export const refId = (ref: unknown): string | null => {
  if (ref == null) return null;
  if (typeof ref === "object") {
    const id = (ref as { id?: number | string }).id;
    return id == null ? null : String(id);
  }
  return String(ref);
};

/** Un message vide est une ligne abandonnée, pas un message. */
const isWritten = (c: DiscussionComment | null | undefined): boolean =>
  typeof c?.body === "string" && c.body.trim() !== "";

export const writtenComments = (comments: unknown): DiscussionComment[] =>
  (Array.isArray(comments) ? (comments as DiscussionComment[]) : []).filter(isWritten);

export type PendingQuestion = {
  /** Rang du message dans le fil (après filtrage des lignes vides). */
  index: number;
  /** Personne sollicitée. */
  askedTo: string;
  comment: DiscussionComment;
};

/**
 * Les questions restées sans réponse, dans l'ordre du fil.
 *
 * @param onlyFor id d'une personne : ne renvoie que ce qu'ELLE doit à d'autres.
 */
export const pendingQuestions = (comments: unknown, onlyFor?: string | null): PendingQuestion[] => {
  const list = writtenComments(comments);
  const out: PendingQuestion[] = [];

  list.forEach((comment, index) => {
    const askedTo = refId(comment.askedTo);
    if (!askedTo) return;
    if (onlyFor != null && askedTo !== String(onlyFor)) return;
    // Répondu dès que la personne sollicitée reprend la parole après la question.
    const answered = list.slice(index + 1).some((later) => refId(later.author) === askedTo);
    if (!answered) out.push({ index, askedTo, comment });
  });

  return out;
};

/** Nombre de messages écrits (compteur affiché sur la barre d'un point). */
export const commentCount = (comments: unknown): number => writtenComments(comments).length;
