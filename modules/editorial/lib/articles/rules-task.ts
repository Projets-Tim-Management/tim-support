import type { Payload } from "payload";

/**
 * LES RECOMMANDATIONS DE SERGEY ARRIVENT DANS « MES TÂCHES » (19/11/2026).
 *
 * La direction ne va pas les chercher dans le menu : quand la revue mensuelle en propose, une
 * seule tâche « à faire » est déposée au nom de Sergey, avec le lien vers celles qui attendent.
 * Elle se ferme d'elle-même quand la dernière est tranchée (validée ou refusée).
 */
export const RULES_TASK_PREFIX = "Règles des articles : ";
export const RULES_TASK_URL = "/admin/collections/article-rule-proposals?where[status][equals]=proposee";

const pendingCount = (payload: Payload) =>
  payload.count({ collection: "article-rule-proposals" as never, where: { status: { equals: "proposee" } }, overrideAccess: true }).then((r) => r.totalDocs);

// `like` de Payload cherche chaque mot n'importe où : on filtre ensuite sur le DÉBUT exact du titre.
const openTasks = (payload: Payload) =>
  payload
    .find({ collection: "ai-team-requests", where: { and: [{ title: { like: RULES_TASK_PREFIX } }, { status: { equals: "ouverte" } }, { kind: { equals: "a-faire" } }] }, pagination: false, depth: 0, overrideAccess: true, select: { title: true } as never })
    .then((r) => (r.docs as unknown as { id: number | string; title?: string }[]).filter((t) => String(t.title ?? "").startsWith(RULES_TASK_PREFIX)));

export const rulesTaskTitle = (n: number) => `${RULES_TASK_PREFIX}${n} recommandation${n > 1 ? "s" : ""} de Sergey à trancher`;

/** Dépose (ou met à jour) la tâche de la direction. Rien s'il n'y a rien à trancher. */
export async function fileRulesTask(payload: Payload, member: { id: number | string } | undefined): Promise<void> {
  const n = await pendingCount(payload);
  if (!n || !member) return;
  const title = rulesTaskTitle(n);
  const open = await openTasks(payload);
  if (open[0]) {
    await payload.update({ collection: "ai-team-requests", id: open[0].id, overrideAccess: true, data: { title } as never });
    return;
  }
  await payload.create({
    collection: "ai-team-requests",
    overrideAccess: true,
    data: {
      member: member.id,
      kind: "a-faire",
      status: "ouverte",
      title,
      why: "Sergey propose de faire évoluer les règles que suit le rédacteur ou la grille de la note SEO/GEO, preuves à l'appui. Validée, une recommandation crée une nouvelle version des règles ; refusée, elle est gardée avec son motif pour ne pas revenir.",
      url: RULES_TASK_URL,
      steps: [
        { text: "Ouvre chaque recommandation et lis ce qui change, pourquoi, et ses preuves.", minutes: 5 },
        { text: "Clique « Valider » ou « Refuser » (un motif est demandé pour refuser).", minutes: 2 },
        { text: "La tâche se ferme d'elle-même quand la dernière est tranchée.", minutes: 0 },
      ],
      origin: "revue",
      channel: "seo",
    } as never,
  });
}

/** Après une décision : ferme la tâche si plus rien n'attend, sinon met son compteur à jour. */
export async function syncRulesTask(payload: Payload, now = new Date()): Promise<void> {
  const [n, open] = await Promise.all([pendingCount(payload), openTasks(payload)]);
  for (const t of open) {
    await payload.update({
      collection: "ai-team-requests",
      id: t.id,
      overrideAccess: true,
      data: (n ? { title: rulesTaskTitle(n) } : { status: "faite", answer: "Toutes les recommandations ont été tranchées.", closedAt: now.toISOString() }) as never,
    });
  }
}
