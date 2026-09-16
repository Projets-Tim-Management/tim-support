import type { Payload, Where } from "payload";

import { hasAdminRole, isPartnerMetier, isSupport, partnerIdOf } from "@/core/access";
import { pendingQuestions } from "@/modules/dev/lib/discussion";
import { CLOSED_STATUSES } from "@/modules/marketing/lib/due-emails";
import { STEPS_DONE_ON_SEND, isStepDone } from "@/modules/marketing/lib/journey";
import { partnerStepsOnAgenda, type PartnerStep } from "@/modules/marketing/lib/partner-steps";
import { taskKindLabel } from "@/modules/partner/lib/activity";
import { pendingValidations } from "@/modules/partner/lib/billing-validation";
import type { HistoryEntry } from "@/modules/partner/lib/history";

/**
 * Ce que l'assistant dit — sans intelligence, et c'est voulu : il lit ce que
 * le support sait déjà (tickets, parcours, tâches, factures, connexions) et
 * le dit en messages, chacun avec le lien qui mène au geste.
 *
 * Une ligne par sujet, jamais à zéro, du plus pressé au moins pressé. Le
 * texte est écrit ici, une fois, pour tous les écrans : le widget n'a qu'à
 * l'afficher. Scopé par rôle : l'admin voit tout, le partenaire-métier ses
 * parcours et ses tâches, le support ses tickets.
 *
 * Lecture serveur, requêtes courtes (des comptes), jamais plus de cinq en
 * parallèle — l'assistant se recharge à chaque page, il doit rester léger.
 */

export type AssistantTone = "danger" | "warn" | "info";

export type AssistantItem = {
  key: string;
  tone: AssistantTone;
  /** La phrase, telle qu'elle s'affiche : « 5 relevés d'usage sont en retard ». */
  text: string;
  /** De qui il s'agit, quand ça aide : « SOUVET VMB, Frapose et 1 autre ». */
  hint?: string | null;
  /** Le geste. */
  cta: { label: string; href: string };
};

/**
 * Une action précise de l'agenda — « Appeler Instalclim à 14:30 », « Relevé
 * d'usage J+2 · SOUVET VMB » — d'aujourd'hui ou en retard. Un compte
 * (« 3 actions prévues ») ne dit pas quoi faire ; la ligne, si.
 */
export type AssistantAction = {
  id: string;
  /** Instant prévu (ISO). */
  at: string;
  /** « 14:30 », ou null quand l'action est due dans la journée (étape de parcours). */
  time: string | null;
  kind: "tache" | "etape" | "session";
  /** Nature courte : « Appel », « Relevé », « Session ». */
  label: string;
  title: string;
  client: string | null;
  href: string;
  /** Jours de retard (0 = aujourd'hui). */
  lateDays: number;
};

export type AssistantData = {
  /** Prénom pour la salutation, ou null. */
  prenom: string | null;
  items: AssistantItem[];
  /** Actions de l'agenda aujourd'hui (tâches et étapes non faites). */
  today: number;
  /** Le détail : les actions du jour puis celles en retard, dans l'ordre où on les fait. */
  agenda: AssistantAction[];
  generatedAt: string;
};

const DAY_MS = 86_400_000;
const ORDER: Record<AssistantTone, number> = { danger: 0, warn: 1, info: 2 };

/* eslint-disable @typescript-eslint/no-explicit-any */
type Doc = Record<string, any>;

const pl = (n: number, one: string, many: string) => (n > 1 ? many : one);

/** « Instalclim, SOUVET VMB et 3 autres », dédoublonné. */
const quelques = (names: (string | null | undefined)[], max = 2): string | null => {
  const propres = [...new Set(names.filter((n): n is string => Boolean(n)))];
  if (!propres.length) return null;
  const tete = propres.slice(0, max).join(", ");
  const reste = propres.length - max;
  return reste > 0 ? `${tete} et ${reste} autre${reste > 1 ? "s" : ""}` : tete;
};

const nameOf = (v: unknown): string | null =>
  v && typeof v === "object" ? ((v as { companyName?: string }).companyName ?? null) : null;

const parisDay = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", dateStyle: "short" }).format(new Date(ms));
const parisTime = (ms: number) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));

/** Jours civils (Paris) entre une échéance et aujourd'hui ; 0 si c'est aujourd'hui ou plus tard. */
const joursDeRetard = (dueMs: number, today: string): number => {
  const d = parisDay(dueMs);
  if (d >= today) return 0;
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / DAY_MS);
};

/** Aujourd'hui d'abord par heure, puis les retards du plus ancien au plus récent. */
export const trierActions = (actions: AssistantAction[]): AssistantAction[] =>
  [...actions].sort((a, b) => {
    if ((a.lateDays > 0) !== (b.lateDays > 0)) return a.lateDays > 0 ? 1 : -1;
    return a.at.localeCompare(b.at);
  });

/** Une étape qui attend QUELQU'UN : ni armée, ni cochée par un envoi. */
const attendQuelquUn = (s: { key?: string | null; state?: string | null }) => s.state !== "auto" && !STEPS_DONE_ON_SEND.has(s.key ?? "");

export async function buildAssistant(payload: Payload, user: Doc | null): Promise<AssistantData> {
  const now = Date.now();
  const today = parisDay(now);
  const prenom = (user?.firstName as string | undefined)?.trim() || (user?.name as string | undefined)?.trim().split(/\s+/)[0] || null;
  const empty: AssistantData = { prenom, items: [], today: 0, agenda: [], generatedAt: new Date(now).toISOString() };
  if (!user) return empty;

  const admin = hasAdminRole(user);
  const support = !admin && isSupport(user);
  const partnerId = !admin && isPartnerMetier(user) ? partnerIdOf(user) : null;
  if (!admin && !support && partnerId == null) return empty;

  const base = { depth: 0 as const, overrideAccess: true as const };
  const count = (collection: string, where: Where) =>
    payload.count({ collection: collection as never, where, overrideAccess: true }).then((r) => r.totalDocs).catch(() => 0);
  const scoped = (clauses: Where[]): Where => ({ and: partnerId != null ? [{ partner: { equals: partnerId } }, ...clauses] : clauses });

  const items: AssistantItem[] = [];
  const push = (n: number, item: Omit<AssistantItem, "key"> & { key: string }) => {
    if (n > 0) items.push(item);
  };

  // ── Tickets (admin, support)
  if (admin || support) {
    const [replies, urgent, news] = await Promise.all([
      count("tickets", { unreadClientReply: { equals: true } }),
      count("tickets", { and: [{ priority: { equals: "urgent" } }, { status: { not_equals: "resolved" } }] }),
      count("tickets", {
        and: [{ needsAttention: { equals: true } }, { unreadClientReply: { not_equals: true } }, { status: { not_equals: "resolved" } }],
      }),
    ]);
    push(replies, {
      key: "replies",
      tone: "danger",
      text: `${replies} ${pl(replies, "réponse client attend", "réponses client attendent")} d'être lue${replies > 1 ? "s" : ""}.`,
      cta: { label: "Voir les réponses", href: "/admin/collections/tickets?where[unreadClientReply][equals]=true" },
    });
    push(urgent, {
      key: "urgent",
      tone: "danger",
      text: `${urgent} ticket${urgent > 1 ? "s" : ""} urgent${urgent > 1 ? "s" : ""} ${pl(urgent, "est", "sont")} encore ouvert${urgent > 1 ? "s" : ""}.`,
      cta: { label: "Traiter les urgents", href: "/admin/collections/tickets?where[and][0][priority][equals]=urgent&where[and][1][status][not_equals]=resolved" },
    });
    push(news, {
      key: "news",
      tone: "warn",
      text: `${news} ${pl(news, "nouveau ticket n'a", "nouveaux tickets n'ont")} pas encore été pris en compte.`,
      cta: { label: "Ouvrir les nouveaux", href: "/admin/collections/tickets?where[and][0][needsAttention][equals]=true&where[and][1][status][not_equals]=resolved" },
    });
  }
  if (support) return { ...empty, items };

  // ── Parcours ouverts (admin, partenaire)
  const runs = (
    await payload
      .find({
        ...base,
        collection: "journey-runs",
        where: scoped([{ status: { not_in: CLOSED_STATUSES } }]),
        depth: 1,
        limit: 300,
      })
      .catch(() => ({ docs: [] as Doc[] }))
  ).docs as (Doc & { steps?: (PartnerStep & { autoAt?: string | null })[] | null })[];

  // Les étapes datées (relevés d'usage…) du jour et en retard, une ligne chacune —
  // même règle que l'agenda de l'accueil : non faites, 30 jours au plus.
  const actions: AssistantAction[] = runs.flatMap((r) =>
    partnerStepsOnAgenda(r)
      .filter((s) => !s.done && parisDay(Date.parse(s.due)) <= today && now - Date.parse(s.due) <= 30 * DAY_MS)
      .map((s) => ({
        id: `etape-${r.id}-${s.step.key ?? ""}`,
        at: s.due,
        time: null,
        kind: "etape" as const,
        label: "Phase de test",
        title: s.step.label ?? "Étape du parcours",
        client: nameOf(r.client),
        href: `/admin/collections/journey-runs/${r.id}`,
        lateDays: joursDeRetard(Date.parse(s.due), today),
      })),
  );
  // La session de prise en main d'aujourd'hui, si elle n'a pas encore eu lieu.
  for (const r of runs) {
    const at = r.sessionAt ? Date.parse(r.sessionAt) : NaN;
    const step = (r.steps ?? []).find((s) => s.key === "prise-en-main");
    if (Number.isNaN(at) || parisDay(at) !== today || (step && isStepDone(step, now))) continue;
    actions.push({
      id: `session-${r.id}`,
      at: r.sessionAt,
      time: parisTime(at),
      kind: "session",
      label: "Prise en main",
      title: `Session de prise en main${r.sessionMode === "visio" ? " en visio" : r.sessionMode === "sur-place" ? " sur place" : ""}`,
      client: nameOf(r.client),
      href: `/admin/collections/journey-runs/${r.id}`,
      lateDays: 0,
    });
  }

  // Parcours arrêtés sur moi : l'étape courante attend mon acteur.
  const acteur = admin ? "admin" : "partenaire";
  const surMoi = runs
    .map((r) => ({ r, step: (r.steps ?? []).find((s) => !isStepDone(s, now) && (attendQuelquUn(s) || s.state === "bloque")) }))
    .filter(({ step }) => step && step.actor === acteur && step.state !== "bloque");
  push(surMoi.length, {
    key: "steps-me",
    tone: "warn",
    text: `${surMoi.length} parcours ${pl(surMoi.length, "attend", "attendent")} ${admin ? "TIM" : "votre action"}.`,
    hint: quelques(surMoi.map(({ r, step }) => `${nameOf(r.client) ?? "Client"} · ${step!.label ?? step!.key}`)),
    cta: {
      label: surMoi.length === 1 ? "Ouvrir le parcours" : "Voir les parcours",
      href: surMoi.length === 1 ? `/admin/collections/journey-runs/${surMoi[0].r.id}` : "/admin/collections/journey-runs?where[status][equals]=en-cours",
    },
  });

  // Tests qui finissent sous 7 jours.
  const finissent = runs.filter((r) => {
    const end = r.endDate ? Date.parse(r.endDate) : NaN;
    return r.status === "en-cours" && !Number.isNaN(end) && end >= now && end - now <= 7 * DAY_MS;
  });
  push(finissent.length, {
    key: "tests-ending",
    tone: "info",
    text: `${finissent.length} phase${finissent.length > 1 ? "s" : ""} de test se ${pl(finissent.length, "termine", "terminent")} dans la semaine.`,
    hint: quelques(finissent.map((r) => nameOf(r.client))),
    cta: { label: "Voir les phases de test", href: "/admin/collections/journey-runs?where[status][equals]=en-cours&sort=endDate" },
  });

  // ── Tâches (admin, partenaire) : celles du jour et celles en souffrance, en lignes.
  // Bornées à 30 jours et 40 lignes, comme l'accueil : au-delà c'est un ménage, pas un retard.
  const taches = (
    await payload
      .find({
        ...base,
        collection: "client-activities",
        where: scoped([
          { type: { equals: "tache" } },
          { done: { not_equals: true } },
          { dueDate: { greater_than_equal: new Date(now - 30 * DAY_MS).toISOString() } },
          { dueDate: { less_than: `${parisDay(now + DAY_MS)}T00:00:00.000Z` } },
        ]),
        depth: 1,
        limit: 40,
        sort: "dueDate",
      })
      .catch(() => ({ docs: [] as Doc[] }))
  ).docs as Doc[];
  for (const t of taches) {
    const at = t.dueDate ? Date.parse(t.dueDate) : NaN;
    if (Number.isNaN(at) || parisDay(at) > today) continue;
    const clientId = t.client && typeof t.client === "object" ? t.client.id : t.client;
    actions.push({
      id: `tache-${t.id}`,
      at: t.dueDate,
      time: parisTime(at),
      kind: "tache",
      label: taskKindLabel(t.taskKind) ?? "Tâche",
      title: (t.title as string | undefined)?.trim() || taskKindLabel(t.taskKind) || "Tâche",
      client: nameOf(t.client),
      href: `/admin/collections/partner-clients/${clientId ?? ""}`,
      lateDays: joursDeRetard(at, today),
    });
  }

  // ── Points (admin : à valider ; partenaire : en attente)
  const soumissions = await count("mission-submissions", scoped([{ status: { equals: "pending" } }]));
  push(soumissions, {
    key: "submissions",
    tone: "info",
    text: admin
      ? `${soumissions} soumission${soumissions > 1 ? "s" : ""} de mission ${pl(soumissions, "attend", "attendent")} votre validation.`
      : `${soumissions} soumission${soumissions > 1 ? "s" : ""} de mission ${pl(soumissions, "est", "sont")} en attente de validation.`,
    cta: { label: "Voir les soumissions", href: "/admin/collections/mission-submissions?where[status][equals]=pending" },
  });

  if (admin) {
    const [orders, forms, devs, clients, connections] = await Promise.all([
      count("reward-orders", { status: { equals: "pending" } }),
      count("form-submissions", { processingStatus: { in: ["echec", "brouillon"] } }),
      payload
        .find({ ...base, collection: "developments", where: { "checklist.comments.askedTo": { equals: user.id } }, limit: 50, select: { checklist: true } })
        .then((r) => (r.docs as Doc[]).reduce((n, d) => n + ((d.checklist ?? []) as Doc[]).reduce((m, p) => m + pendingQuestions(p?.comments, String(user.id)).length, 0), 0))
        .catch(() => 0),
      payload
        .find({ ...base, collection: "partner-clients", where: { clientStatus: { equals: "actif" } }, limit: 3000, pagination: false, select: { clientStatus: true, history: true } })
        .then((r) => r.docs as { id: number | string; clientStatus?: string | null; history?: HistoryEntry[] | null }[])
        .catch(() => []),
      payload
        .findGlobal({ slug: "support-connections", depth: 0, overrideAccess: true })
        .then((g) => ((g as { entries?: Doc[] | null }).entries ?? []).filter((e) => e.lastTestAt && e.lastTestOk === false).map((e) => String(e.key)))
        .catch(() => [] as string[]),
    ]);
    push(orders, {
      key: "orders",
      tone: "info",
      text: `${orders} commande${orders > 1 ? "s" : ""} de récompense ${pl(orders, "est", "sont")} à traiter.`,
      cta: { label: "Voir les commandes", href: "/admin/collections/reward-orders?where[status][equals]=pending" },
    });
    push(forms, {
      key: "forms",
      tone: "warn",
      text: `${forms} formulaire${forms > 1 ? "s" : ""} du site vitrine ${pl(forms, "est", "sont")} à reprendre (brouillon ou échec).`,
      cta: { label: "Voir les formulaires", href: "/admin/collections/form-submissions?where[processingStatus][in]=echec,brouillon" },
    });
    push(devs, {
      key: "questions",
      tone: "info",
      text: `${devs} question${devs > 1 ? "s" : ""} de développement ${pl(devs, "attend", "attendent")} votre réponse.`,
      cta: { label: "Répondre", href: `/admin/collections/developments?where[checklist.comments.askedTo][equals]=${user.id}` },
    });
    const aValider = pendingValidations(clients, new Date(now)).length;
    push(aValider, {
      key: "billing",
      tone: "warn",
      text: `${aValider} facture${aValider > 1 ? "s" : ""} ${pl(aValider, "reste", "restent")} à valider sur le rapprochement.`,
      cta: { label: "Ouvrir le rapprochement", href: "/admin/facturation?f=a-valider" },
    });
    push(connections.length, {
      key: "connections",
      tone: "danger",
      text: `${connections.length} connexion${connections.length > 1 ? "s" : ""} du support ${pl(connections.length, "a échoué", "ont échoué")} au dernier test.`,
      hint: connections.join(", "),
      cta: { label: "Voir les connexions", href: "/admin/connexions-support" },
    });
  }

  items.sort((a, b) => ORDER[a.tone] - ORDER[b.tone]);
  const agenda = trierActions(actions);
  return { prenom, items, today: agenda.filter((a) => a.lateDays === 0).length, agenda, generatedAt: new Date(now).toISOString() };
}
