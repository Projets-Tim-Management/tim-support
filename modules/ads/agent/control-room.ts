import type { Payload } from "payload";

import { ROLE_SUBJECT } from "@/modules/ads/agent/roles";
import type { Id } from "@/modules/ads/agent/types";
import { AGENT_ROLES } from "@/modules/ads/collections/AdAgents";
import { DECISION_KINDS, DECISION_STATUSES } from "@/modules/ads/collections/AdDecisions";
import { planSummary, type MediaPlan } from "@/modules/ads/lib/media-plan";
import { spentOf } from "@/modules/ads/lib/spend";

/**
 * La salle de contrôle d'une campagne (plan Publicité, §9 quater, point 4 ;
 * commit 7), dans l'onglet « Agent » : pour un passage, l'arbre des agents,
 * le fil d'activité, les jauges et le journal des décisions avec leurs appuis.
 *
 * Tout ce qui s'affiche est écrit par le code (les phrases du fil, les
 * libellés) : pas de JSON brut, et aucun modèle payé pour résumer.
 */

const ACTIVE = ["en-cours", "en-pause-budget"];
/** Le fil complet d'un passage tient largement : au-delà, les plus anciennes lignes tombent. */
const MAX_FEED = 300;
const PASSAGES = 10;

type Raw = Record<string, unknown>;
const idOf = (v: unknown): Id | null => (v && typeof v === "object" ? (v as { id: Id }).id : ((v as Id | null) ?? null));
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const label = (list: readonly { label: string; value: string }[], v: unknown) => list.find((x) => x.value === v)?.label ?? String(v ?? "—");

export type RoomAgent = { id: Id; parent: Id | null; depth: number; role: string; roleLabel: string; status: string; mission: string; budgetEur: number; spentEur: number; error: string | null };
export type RoomDecision = {
  id: Id;
  le: string;
  type: string;
  typeLabel: string;
  etat: string;
  etatLabel: string;
  par: string | null;
  pourquoi: string;
  resume: string | null;
  gardeFou: string | null;
  appuis: { ref: string; text: string }[];
};
export type ControlRoom = {
  passages: { id: Id; le: string; statut: string; depenseEur: number; budgetEur: number }[];
  run: {
    id: Id;
    statut: string;
    objectif: string;
    budgetEur: number;
    depenseEur: number;
    lanceLe: string;
    finLe: string | null;
    bilan: string | null;
    motif: string | null;
    enCours: boolean;
    lus: { consignes: number; apprentissages: number };
  };
  agents: RoomAgent[];
  fil: { ligne: string; le: string; echoue: boolean }[];
  decisions: RoomDecision[];
  jauges: { iaJour: { depense: number; plafond: number }; iaMois: { depense: number; plafond: number }; meta: { publiee: boolean } };
} | null;

/** L'arbre à plat, dans l'ordre de lecture : chaque agent suivi de ses enfants (dans l'ordre de création). Pure. */
export function treeOrder<T extends { id: Id; parent: Id | null }>(agents: T[]): T[] {
  const kids = new Map<string, T[]>();
  for (const a of agents) {
    const k = String(a.parent ?? "");
    if (!kids.has(k)) kids.set(k, []);
    kids.get(k)!.push(a);
  }
  const out: T[] = [];
  const seen = new Set<string>();
  const walk = (parent: string) => {
    for (const a of kids.get(parent) ?? []) {
      if (seen.has(String(a.id))) continue;
      seen.add(String(a.id));
      out.push(a);
      walk(String(a.id));
    }
  };
  walk("");
  // Un agent dont le parent manque (ne devrait pas arriver) reste visible, en fin de liste.
  return [...out, ...agents.filter((a) => !seen.has(String(a.id)))];
}

/** Ce que dit une décision, en une ligne, à partir de ses valeurs structurées. Pure. */
export function decisionSummary(kind: string, after: unknown): string | null {
  const a = (after ?? {}) as Raw;
  const eur = (n: unknown) => `${num(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  switch (kind) {
    case "positionnement":
      return a.positionnement ? `« ${String(a.positionnement)} »` : null;
    case "angle":
      return Array.isArray(a.angles) ? a.angles.map((x) => `« ${String(x)} »`).join(", ") : null;
    case "audience":
      // Le plan de diffusion (depuis le 19/10/2026) ; avant, une simple audience.
      if (a.objectif) return planSummary(a as unknown as MediaPlan);
      return a.mode === "advantage-plus" ? `Advantage+ seul, ${eur(a.budgetMetaQuotidienEur)} par jour` : a.mode ? `Ciblage détaillé contre Advantage+, ${eur(a.budgetMetaQuotidienEur)} par jour` : null;
    case "repartition-budget":
      return `IA ${eur(a.aiDailyEur)} par jour, Meta ${eur(a.metaDailyEur)} par jour`;
    case "rejet-controleur":
      return a.angle ? `Angle « ${String(a.angle)} », rejet ${num(a.rejet)}${a.limiteAtteinte ? " (limite atteinte)" : ""}` : null;
    case "creation-sous-agent":
      return a.role ? `${label(AGENT_ROLES, a.role)}, ${eur(a.budgetEur)} : « ${String(a.mission ?? "")} »` : null;
    case "concurrent":
      return a.name ? String(a.name) : null;
    default:
      return null;
  }
}

/** Pure : la salle de contrôle à partir des lignes lues en base. */
export function buildControlRoom(input: {
  runs: Raw[];
  run: Raw | null;
  agents: Raw[];
  steps: Raw[];
  decisions: Raw[];
  spent: { day: number; month: number };
  caps: { day: number; month: number };
  campaignStatus: string | null | undefined;
}): ControlRoom {
  const { run } = input;
  if (!run) return null;
  const agents: RoomAgent[] = treeOrder(
    input.agents.map((a) => ({
      id: a.id as Id,
      parent: idOf(a.parent),
      depth: num(a.depth),
      role: String(a.role),
      roleLabel: label(AGENT_ROLES, a.role),
      status: String(a.status),
      mission: String(a.mission ?? ""),
      budgetEur: num(a.budgetEur),
      spentEur: num(a.spentEur),
      error: (a.error as string | null) ?? null,
    })),
  );
  const roleOf = new Map(agents.map((a) => [String(a.id), a.role]));
  const list = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  return {
    passages: input.runs.map((r) => ({ id: r.id as Id, le: String(r.startedAt), statut: String(r.status), depenseEur: num(r.costEur), budgetEur: num(r.budgetEur) })),
    run: {
      id: run.id as Id,
      statut: String(run.status),
      objectif: String(run.objective ?? ""),
      budgetEur: num(run.budgetEur),
      depenseEur: num(run.costEur),
      lanceLe: String(run.startedAt),
      finLe: (run.finishedAt as string | null) ?? null,
      bilan: (run.summary as string | null) ?? null,
      motif: (run.error as string | null) ?? null,
      enCours: ACTIVE.includes(String(run.status)),
      lus: { consignes: list(run.instructionsRead), apprentissages: list(run.learningsRead) },
    },
    agents,
    fil: input.steps.map((s) => ({ ligne: String(s.line ?? ""), le: String(s.createdAt), echoue: s.status === "echoue" })).filter((l) => l.ligne),
    decisions: input.decisions.map((d) => {
      const role = roleOf.get(String(idOf(d.agent)));
      return {
        id: d.id as Id,
        le: String(d.createdAt),
        type: String(d.kind),
        typeLabel: label(DECISION_KINDS, d.kind),
        etat: String(d.status),
        etatLabel: label(DECISION_STATUSES, d.status),
        par: role ? ROLE_SUBJECT[role as keyof typeof ROLE_SUBJECT] : null,
        pourquoi: String(d.rationale ?? ""),
        resume: decisionSummary(String(d.kind), d.after),
        gardeFou: (d.guardrail as string | null) ?? null,
        appuis: Array.isArray(d.citations) ? (d.citations as { ref: string; text: string }[]) : [],
      };
    }),
    jauges: {
      iaJour: { depense: Math.round(input.spent.day * 100) / 100, plafond: input.caps.day },
      iaMois: { depense: Math.round(input.spent.month * 100) / 100, plafond: input.caps.month },
      // Avant la phase 2, rien n'est publié : pas de dépense Meta à montrer (plan, §9 quater, point 4).
      meta: { publiee: Boolean(input.campaignStatus && input.campaignStatus !== "brouillon") },
    },
  };
}

/** La salle de contrôle d'une campagne : le passage demandé, sinon le dernier. */
export async function controlRoom(payload: Payload, campaignId: Id, runId?: Id | null, now = new Date()): Promise<ControlRoom> {
  const common = { depth: 0, overrideAccess: true } as const;
  const runs = await payload.find({ collection: "ad-agent-runs", where: { campaign: { equals: campaignId } }, sort: "-startedAt", limit: PASSAGES, ...common });
  const wanted = runId != null ? (runs.docs as unknown as Raw[]).find((r) => String(r.id) === String(runId)) : undefined;
  // Un passage plus ancien que les 10 derniers (ou d'une autre campagne) n'est pas servi : on retombe sur le dernier.
  const run = (wanted ?? (runs.docs[0] as unknown as Raw | undefined)) ?? null;
  if (!run) return null;
  const [agents, steps, decisions, spent, settings, campaign] = await Promise.all([
    payload.find({ collection: "ad-agents", where: { run: { equals: run.id } }, sort: "createdAt", pagination: false, ...common }),
    payload.find({ collection: "ad-agent-steps", where: { run: { equals: run.id } }, sort: "-createdAt", limit: MAX_FEED, select: { line: true, status: true, createdAt: true } as never, ...common }),
    // Le plus récent en haut, comme le fil : pendant un passage, c'est ce qu'on vient voir.
    payload.find({ collection: "ad-decisions", where: { run: { equals: run.id } }, sort: "-createdAt", pagination: false, ...common }),
    spentOf(payload, "agent", now),
    payload.findGlobal({ slug: "ads-settings", overrideAccess: true }) as Promise<{ agentDailyEur?: number | null; agentMonthlyEur?: number | null }>,
    payload.findByID({ collection: "ad-campaigns", id: campaignId, ...common, select: { status: true } as never }).catch(() => null),
  ]);
  return buildControlRoom({
    runs: runs.docs as unknown as Raw[],
    run,
    agents: agents.docs as unknown as Raw[],
    steps: steps.docs as unknown as Raw[],
    decisions: decisions.docs as unknown as Raw[],
    spent,
    caps: { day: settings.agentDailyEur ?? 15, month: settings.agentMonthlyEur ?? 150 },
    campaignStatus: (campaign as { status?: string } | null)?.status,
  });
}
