/** Ce qu'il faut d'une activité de la fiche pour préparer une réponse. */
export type ReplySource = {
  type?: string;
  title?: string | null;
  content?: string | null;
  occurredAt?: string;
  emailSubject?: string | null;
  emailFrom?: string | null;
  emailDirection?: string | null;
  sourceMessageId?: string | null;
};

/**
 * La réponse à un e-mail du prospect, prête à écrire (17/11/2026) : à son adresse, « Re : » l'objet de son message
 * (à défaut, celui du dernier e-mail qu'on lui a envoyé), son message cité dessous. Pure.
 */
export function replyDraft(task: ReplySource, all: ReplySource[], fallbackTo?: string) {
  const fromTitle = /[^\s<>«»"]+@[^\s<>«»"]+\.[a-z]{2,}/i.exec(task.title ?? "")?.[0];
  const to = task.emailFrom || fromTitle || fallbackTo || "";
  const lastSent = all
    .filter((a) => a.type === "email" && a.emailDirection !== "recu" && a.title)
    .sort((x, y) => Date.parse(y.occurredAt ?? "") - Date.parse(x.occurredAt ?? ""))[0]?.title;
  const base = (task.emailSubject || lastSent || "votre message").trim();
  const title = /^(re|tr|fwd?)\s*:/i.test(base) ? base : `Re : ${base}`;
  const when = task.occurredAt
    ? new Date(task.occurredAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })
    : null;
  // Le message cité vit À PART de la réponse : il se place SOUS la signature, comme dans toute messagerie.
  const text = (task.content ?? "").trim();
  const quote = text ? { header: `${when ? `Le ${when}, ` : ""}${to || "le prospect"} a écrit :`, text } : null;
  return { to, title, quote, inReplyTo: task.sourceMessageId || null };
}
