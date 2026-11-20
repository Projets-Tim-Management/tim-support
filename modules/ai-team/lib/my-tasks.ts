import type { Payload } from "payload";

import { idOf } from "@/core/lib/relations";
import { decisionSummary } from "@/modules/ads/agent/control-room";
import { DAY_MS, parisDay } from "@/modules/ai-team/lib/format";
import type { MyTask, TaskCategory } from "@/modules/ai-team/lib/my-tasks-shared";
import { stepsOf } from "@/modules/ai-team/lib/roadmap";
import { isRoadmapTeam, WHO_LABEL } from "@/modules/ai-team/lib/roadmap-constants";
import { OFFICES, teamOfKey } from "@/modules/ai-team/lib/veille-domains";

/**
 * « MES TÂCHES » (16/11/2026 : « un seul endroit où je coche au fur et à mesure ce que j'ai fait, pour voir où j'en
 * suis et ce qu'il me reste à faire ; une couleur par catégorie ; supprime les doublons »).
 *
 * Tout ce que la direction a à faire, au même endroit, quelle qu'en soit l'origine :
 *  - les demandes des chefs (ai-team-requests) — à faire (étapes à cocher) ou question (une réponse) ;
 *  - les objectifs de la semaine de Sergey (ai-team-objectives) — étapes, prompts, créneaux dans l'agenda ;
 *  - les actions des équipes sur la feuille de route (ai-team-actions) ;
 *  - ce qui attend une décision dans Publicité › À valider (créas, actions sur les campagnes) — se décide là-bas.
 *
 * C'est ici, et seulement ici, qu'on coche. La feuille de route, la fiche de Sergey et l'organigramme montrent l'état
 * (fait ou en attente) et renvoient ici.
 */

type Raw = Record<string, unknown>;

export type MyTasksInput = {
  requests: Raw[];
  objectives: Raw[];
  actions: Raw[];
  members: Raw[];
  goals: Raw[];
  campaigns: Raw[];
  pendingCreatives: Raw[];
  proposedActions: Raw[];
};

const A_VALIDER = "/admin/publicite/a-valider";
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const day = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 10) : null);
const URGENT = /^\s*🔴/;

/** Toutes les tâches de la direction, ouvertes et faites récemment. Pure (testée). */
export function buildMyTasks(input: MyTasksInput): MyTask[] {
  const byId = new Map(input.members.map((m) => [String(m.id), m]));
  const keyOf = (v: unknown) => {
    const m = byId.get(String(idOf(v)));
    return m ? String(m.key) : null;
  };
  const nameOfKey = new Map(input.members.map((m) => [String(m.key), String(m.name)]));
  const goalTitle = new Map(input.goals.map((g) => [String(g.id), String(g.title)]));
  const camp = new Map(input.campaigns.map((c) => [String(c.id), String(c.name ?? "—")]));
  const goalOf = (v: unknown) => (v == null ? null : (goalTitle.get(String(idOf(v))) ?? null));
  const empty = { why: null, diagnosis: null, benchmark: null, measure: null, page: null, question: null, url: null, notes: null, minutes: null, steps: [], stepsCheckable: false, slots: [], answer: null, goal: null, campaign: null };

  const tasks: MyTask[] = [];

  for (const r of input.requests) {
    const key = keyOf(r.member);
    const category = key ? teamOfKey(key) : "sea";
    const chief = OFFICES[category].chief;
    const question = r.kind === "question";
    const open = r.status === "ouverte";
    tasks.push({
      ...empty,
      id: `r${r.id}`,
      source: "demande",
      category,
      form: question ? "question" : "a-faire",
      title: String(r.title ?? ""),
      status: open ? "a-faire" : "fait",
      due: null,
      at: String(r.createdAt),
      doneAt: open ? null : (str(r.closedAt) ?? String(r.createdAt)),
      chief,
      from: [nameOfKey.get(chief), key && key !== chief ? `idée de ${nameOfKey.get(key) ?? key}` : null].filter(Boolean).join(" · ") || null,
      urgent: URGENT.test(String(r.title ?? "")),
      why: str(r.why),
      question: str(r.question),
      url: str(r.url),
      steps: stepsOf(r.steps),
      stepsCheckable: !question && open,
      answer: str(r.answer),
      goal: goalOf(r.goal),
      campaign: r.campaign ? (camp.get(String(idOf(r.campaign))) ?? null) : null,
    });
  }

  const serge = OFFICES.seo.chief;
  const live = input.objectives.filter((o) => o.status !== "reporte");
  for (const o of input.objectives) {
    const done = o.status === "fait";
    const reported = o.status === "reporte";
    tasks.push({
      ...empty,
      id: `o${o.id}`,
      source: "objectif",
      category: "seo",
      form: "a-faire",
      title: String(o.title ?? ""),
      status: done ? "fait" : reported ? "reporte" : "a-faire",
      ...(reported ? { carriedOver: takenOverBy(o, live) } : {}),
      due: day(o.dueDate),
      at: String(o.createdAt ?? o.week ?? ""),
      doneAt: done ? (str(o.closedAt) ?? null) : null,
      chief: serge,
      from: [nameOfKey.get(serge) ?? "Sergey", o.proposedBy ? `idée de ${nameOfKey.get(String(o.proposedBy)) ?? o.proposedBy}` : null].filter(Boolean).join(" · "),
      urgent: false,
      why: str(o.why),
      diagnosis: str(o.diagnosis),
      benchmark: str(o.benchmark),
      measure: str(o.measure),
      page: str(o.page),
      minutes: typeof o.minutes === "number" ? o.minutes : null,
      steps: stepsOf(o.steps),
      stepsCheckable: !done && !reported,
      slots: (Array.isArray(o.slots) ? (o.slots as Raw[]) : []).flatMap((s) => (s.start && s.end ? [{ start: String(s.start), end: String(s.end), link: str(s.link) }] : [])),
      goal: goalOf(o.goal),
    });
  }

  for (const a of input.actions) {
    const done = a.status === "faite";
    const category: TaskCategory = isRoadmapTeam(a.team) ? a.team : "tous";
    tasks.push({
      ...empty,
      id: `a${a.id}`,
      source: "action",
      category,
      form: "a-faire",
      title: String(a.title ?? ""),
      status: done ? "fait" : a.status === "en-cours" ? "en-cours" : "a-faire",
      due: day(a.plannedDate),
      at: String(a.createdAt),
      doneAt: done ? (day(a.doneDate) ?? null) : null,
      chief: category === "tous" ? null : OFFICES[category].chief,
      from: WHO_LABEL[String(a.who ?? "autre")] ?? "Autre",
      urgent: false,
      notes: str(a.notes),
      goal: goalOf(a.goal),
    });
  }

  // Publicité › À valider : une tâche par campagne qui a des créas à décider, une par action proposée.
  const margaux = OFFICES.sea.chief;
  const byCampaign = new Map<string, Raw[]>();
  for (const c of input.pendingCreatives) {
    const k = String(idOf(c.campaign) ?? "");
    byCampaign.set(k, [...(byCampaign.get(k) ?? []), c]);
  }
  for (const [k, list] of byCampaign) {
    const n = list.length;
    tasks.push({
      ...empty,
      id: `v-creas-${k}`,
      source: "a-valider",
      category: "sea",
      form: "a-faire",
      title: `Décider de ${n} créa${n > 1 ? "s" : ""}${camp.get(k) ? ` — ${camp.get(k)}` : ""}`,
      status: "a-faire",
      due: null,
      at: String(list[0].createdAt ?? new Date(0).toISOString()),
      doneAt: null,
      chief: margaux,
      from: nameOfKey.get(margaux) ?? null,
      urgent: false,
      why: "L'équipe a préparé ces créas ; rien ne part chez Meta sans votre décision.",
      url: `${A_VALIDER}${k ? `?campagne=${k}` : ""}`,
      steps: ["Ouvrez « À valider ».", "Pour chaque créa, regardez le visuel et les textes.", "Cliquez « Valider », ou « Refuser » en donnant le motif : l'équipe en tirera une consigne."].map((text) => ({ text, minutes: null, prompt: null, done: false })),
      campaign: camp.get(k) ?? null,
    });
  }
  // Ce que propose l'analyste (Camille) remonte par son chef : la direction ne parle qu'aux chefs.
  const analyst = input.members.find((m) => ((m.engineRoles as string[] | undefined) ?? []).includes("analyste") && m.chief);
  const via = analyst ? `Soulevé par ${analyst.name}${analyst.jobTitle ? ` (${analyst.jobTitle})` : ""} : ` : "";
  for (const d of input.proposedActions) {
    const summary = decisionSummary(String(d.kind), d.after) ?? String(d.kind);
    tasks.push({
      ...empty,
      id: `v-action-${d.id}`,
      source: "a-valider",
      category: "sea",
      form: "a-faire",
      title: summary.length > 110 ? `${summary.slice(0, 109)}…` : summary,
      status: "a-faire",
      due: null,
      at: String(d.createdAt),
      doneAt: null,
      chief: margaux,
      from: nameOfKey.get(margaux) ?? null,
      urgent: false,
      why: `${via}${str(d.rationale) ?? "Proposition de suivi."}`,
      url: A_VALIDER,
      steps: ["Ouvrez « À valider », section des actions sur les campagnes en ligne.", "Lisez la justification et les chiffres.", "Cliquez « Valider » pour l'appliquer chez Meta (les garde-fous sont revérifiés), ou « Refuser »."].map((text) => ({ text, minutes: null, prompt: null, done: false })),
      campaign: camp.get(String(idOf(d.campaign) ?? "")) ?? null,
    });
  }
  return tasks;
}

const WORD = /[a-zà-ÿ0-9]{4,}/g;
const wordsOf = (t: unknown) => new Set((String(t ?? "").toLowerCase().normalize("NFC").match(WORD) ?? []).filter((w) => !["pour", "dans", "avec", "sous", "page", "faire"].includes(w)));

/**
 * L'objectif de cette semaine qui REPREND un objectif reporté : la même page, ou au moins deux mots forts en commun
 * dans le titre (« Faire cliquer la grille de salaire BTP 2026 » / « … (titre et description) »). Null : mis de côté.
 * Pur (testé).
 */
export function takenOverBy(reported: Raw, current: Raw[]): string | null {
  const page = String(reported.page ?? "").trim();
  const mine = wordsOf(reported.title);
  const later = current.filter((o) => String(o.createdAt ?? "") > String(reported.createdAt ?? ""));
  const hit = later.find((o) => (page && String(o.page ?? "").trim() === page) || [...wordsOf(o.title)].filter((w) => mine.has(w)).length >= 2);
  return hit ? String(hit.title ?? "") : null;
}

/** Ce que la page lit : les tâches ouvertes, et celles faites ces 14 derniers jours. */
export async function loadMyTasks(payload: Payload, now = new Date()): Promise<{ tasks: MyTask[]; today: string }> {
  const common = { pagination: false, depth: 0, overrideAccess: true } as const;
  const since = new Date(now.getTime() - 14 * DAY_MS).toISOString();
  const safe = (p: Promise<{ docs: unknown[] }>) => p.then((r) => r.docs as Raw[]).catch(() => [] as Raw[]);
  const [requests, objectives, actions, members, goals, campaigns, pendingCreatives, proposedActions] = await Promise.all([
    safe(payload.find({ collection: "ai-team-requests", where: { or: [{ status: { equals: "ouverte" } }, { and: [{ status: { in: ["faite", "repondue"] } }, { closedAt: { greater_than_equal: since } }] }] }, sort: "-createdAt", limit: 200, depth: 0, overrideAccess: true })),
    // Les objectifs reportés (non finis à la fin de la semaine de Sergey) : ces 14 derniers jours, pour qu'aucun ne
    // disparaisse sans que la direction le voie (16/11/2026).
    safe(payload.find({ collection: "ai-team-objectives", where: { or: [{ status: { equals: "a-faire" } }, { and: [{ status: { in: ["fait", "reporte"] } }, { closedAt: { greater_than_equal: since } }] }] }, sort: "rank", ...common })),
    safe(payload.find({ collection: "ai-team-actions", where: { or: [{ status: { in: ["prevue", "en-cours"] } }, { and: [{ status: { equals: "faite" } }, { doneDate: { greater_than_equal: since } }] }] }, sort: "plannedDate", ...common })),
    safe(payload.find({ collection: "ai-team-members", ...common, select: { key: true, name: true, jobTitle: true, engineRoles: true, chief: true } as never })),
    safe(payload.find({ collection: "ai-team-goals", ...common, select: { title: true } as never })),
    safe(payload.find({ collection: "ad-campaigns", ...common, select: { name: true } as never })),
    safe(payload.find({ collection: "ad-creatives", where: { status: { equals: "a-valider" } }, ...common, select: { campaign: true, createdAt: true } as never })),
    safe(payload.find({ collection: "ad-decisions", where: { and: [{ status: { equals: "proposee" } }, { kind: { in: ["budget", "pause", "activation"] } }] }, ...common })),
  ]);
  return { tasks: buildMyTasks({ requests, objectives, actions, members, goals, campaigns, pendingCreatives, proposedActions }), today: parisDay(now) };
}
