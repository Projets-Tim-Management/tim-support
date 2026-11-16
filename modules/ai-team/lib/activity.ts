import type { Payload } from "payload";

import { idOf } from "@/core/lib/relations";
import { ROLE_SUBJECT } from "@/modules/ads/agent/roles";
import { num, parisMonthStart, r2 } from "@/modules/ai-team/lib/format";
import { spentOf } from "@/modules/ads/lib/spend";
import { buildTeamSpend, type TeamSpend } from "@/modules/ai-team/lib/spend";
import { groupOf, type TeamGroup } from "@/modules/ai-team/lib/team";

/**
 * Ce que fait chaque membre de l'équipe IA, lu dans le moteur d'agents :
 * les instances `ad-agents` (une par mission), les passages `ad-agent-runs`,
 * le fil `ad-agent-steps`. Rien n'est écrit : la page « Équipe IA » ne fait
 * que mettre un nom et un visage sur ce que le moteur enregistre déjà.
 *
 * Qui est qui : un membre incarne un ou plusieurs rôles du moteur
 * (`engineRoles`) — Margaux, la cheffe SEA, est à la fois l'orchestratrice et
 * l'analyste.
 *
 * `buildTeamView` est pur (testé) ; `loadTeamView` lit la base.
 */

type Raw = Record<string, unknown>;
type Id = number | string;

export type MemberState = "pause" | "bientot" | "travail" | "validation" | "repos";

/**
 * L'essentiel d'un long texte : sa première phrase, coupée à `max` caractères.
 * L'écran montre ça d'abord ; le texte entier reste à un clic.
 */
export function firstSentence(text: string | null | undefined, max = 170): string | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const m = /^(.+?[.!?…])(\s|$)/.exec(t);
  const first = m && m[1].length >= 20 ? m[1] : t;
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
}

/** Les lignes du fil qui parlent au moteur, pas à la direction (« X décide : lire_resultats, lire_journal. »). */
const TECHNICAL_LINE = /\bdécide\s*:/i;

export type MissionView = {
  id: Id;
  at: string;
  campaign: string;
  /** Ce que la cheffe lui a demandé, et sa première phrase. */
  mission: string;
  ask: string;
  status: string;
  /** Ce qu'il a rendu à sa cheffe (texte), ou le motif d'échec. */
  result: string | null;
  /** La première phrase de ce qu'il a rendu (ou de l'échec). */
  answer: string | null;
  error: string | null;
  costEur: number;
  /** Le budget que le chef lui a confié pour cette mission. */
  budgetEur: number;
};

export type RunView = { id: Id; at: string; kind: string; kindKey: string; status: string; campaign: string; summary: string | null; headline: string | null; costEur: number };

export type MemberView = {
  id: Id;
  key: string;
  name: string;
  jobTitle: string;
  level: "chef" | "sous-agent";
  portrait: string;
  photoUrl: string | null;
  chiefId: Id | null;
  specialty: string;
  /** La case « en service » : décochée, le moteur ne l'emploie plus. */
  active: boolean;
  /** Sa rangée dans l'organigramme. */
  group: TeamGroup;
  /** Ses rôles dans le moteur ; vide : son travail n'est pas encore branché. */
  engineRoles: string[];
  state: MemberState;
  /** Une ligne : ce qu'il fait en ce moment, ou depuis quand il est au repos. */
  stateLine: string;
  monthMissions: number;
  monthCostEur: number;
  lastAt: string | null;
  missions: MissionView[];
  /** Chefs seulement : les passages qu'il a menés (préparations, suivis). */
  runs: RunView[];
};

export type TeamView = {
  members: MemberView[];
  /** Les créas qui attendent la direction dans « À valider ». */
  pendingValidations: number;
  /** Le fil d'activité de toute l'équipe, au prénom, le plus récent d'abord. */
  feed: { at: string; memberKey: string | null; line: string }[];
};

const RUN_KIND_LABELS: Record<string, string> = { preparation: "Préparation de campagne", quotidien: "Suivi (tous les 2 jours)", hebdomadaire: "Suivi du lundi", mensuel: "Bilan du mois" };
export const STATUS_LABELS: Record<string, string> = {
  "en-attente": "En attente",
  "en-cours": "En cours",
  "en-pause-budget": "En pause (plafond du jour)",
  "a-valider": "À valider",
  termine: "Terminé",
  arrete: "Arrêté",
  echoue: "Échoué",
};
const ACTIVE = new Set(["en-cours", "en-attente", "en-pause-budget"]);

/** Le texte que l'agent a rendu : son `resume` quand il y en a un, sans le gras Markdown. */
export function resultText(result: unknown): string | null {
  if (result == null) return null;
  const raw = typeof result === "string" ? result : typeof result === "object" && typeof (result as { resume?: unknown }).resume === "string" ? (result as { resume: string }).resume : JSON.stringify(result);
  const clean = raw.replace(/\*\*(.+?)\*\*/g, "$1").trim();
  return clean || null;
}

/**
 * Une ligne du fil au prénom : « L'analyste lit… » → « Margaux lit… ». Le sujet
 * est en tête de ligne (ROLE_SUBJECT) ; on ne touche à rien d'autre.
 */
export function personalize(line: string, nameByRole: Map<string, string>): { line: string; role: string | null } {
  for (const [role, subject] of Object.entries(ROLE_SUBJECT)) {
    if (line.startsWith(subject)) {
      const name = nameByRole.get(role);
      return { line: name ? name + line.slice(subject.length) : line, role };
    }
  }
  return { line, role: null };
}

/** Le 1er du mois (UTC) : à une ou deux heures près, c'est le mois vu de Paris — assez pour un compte de missions. */
const sinceLine = (iso: string | null, now: Date) => {
  if (!iso) return "Pas encore de mission";
  const days = Math.floor((now.getTime() - Date.parse(iso)) / 86400_000);
  return days <= 0 ? "Dernière mission aujourd'hui" : days === 1 ? "Dernière mission hier" : `Dernière mission il y a ${days} jours`;
};

/** Les chefs de canal qui lisent leur régie sans rôle moteur : branchés dès que leur variable est posée. */
const READERS: Record<string, { env: string; line: string }> = {
  "sea-google": { env: "GOOGLE_ADS_CUSTOMER_ID", line: "Lit le compte Google Ads (lecture seule)" },
  "sea-chatgpt": { env: "OPENAI_ADS_API_KEY", line: "Lit le compte ChatGPT Ads (lecture seule)" },
  "chef-seo": { env: "GSC_SITE_URL", line: "Fixe vos objectifs SEO/GEO chaque lundi" },
  "seo-analyste": { env: "GA4_PROPERTY_ID", line: "Suit l'entonnoir gratuit, audite le site chaque mois" },
  "seo-concurrence": { env: "GSC_SITE_URL", line: "Lit chaque semaine les sites des concurrents" },
  "seo-contenu": { env: "GSC_SITE_URL", line: "Fait le plan de contenu chaque lundi" },
  "seo-visibilite-ia": { env: "ANTHROPIC_API_KEY", line: "Mesure chaque mois la place de TIM dans les IA" },
  "seo-technique": { env: "ANTHROPIC_API_KEY", line: "Contrôle chaque mois la santé technique du site" },
  "seo-autorite": { env: "ANTHROPIC_API_KEY", line: "Cherche chaque mois où TIM est nommé, et où il manque" },
  "seo-reseaux": { env: "ANTHROPIC_API_KEY", line: "Lit chaque semaine vos réseaux et vos vidéos" },
};

/**
 * Son travail est-il branché ? Un rôle dans le moteur, ou Yanis (la fiche des
 * canaux), ou un chef de canal dont le connecteur est posé.
 */
export function isPlugged(key: string, engineRoles: readonly string[]): boolean {
  const reader = READERS[key];
  return engineRoles.length > 0 || key === "sea-mesure" || Boolean(reader && process.env[reader.env]?.trim());
}

export function buildTeamView(input: { members: Raw[]; agents: Raw[]; runs: Raw[]; campaigns: Raw[]; steps: Raw[]; pendingValidations: number; now: Date }): TeamView {
  const campaignName = new Map(input.campaigns.map((c) => [String(c.id), String(c.name ?? "—")]));
  const runById = new Map(input.runs.map((r) => [String(r.id), r]));
  const campOfRun = (runId: unknown) => {
    const r = runById.get(String(idOf(runId)));
    return r ? (campaignName.get(String(idOf(r.campaign))) ?? "—") : "—";
  };
  const monthFrom = parisMonthStart(input.now);

  const roleOwner = new Map<string, Raw>();
  for (const m of input.members) for (const role of (m.engineRoles as string[] | undefined) ?? []) roleOwner.set(role, m);
  const nameByRole = new Map([...roleOwner.entries()].map(([role, m]) => [role, String(m.name)]));
  const roleOfAgent = new Map(input.agents.map((a) => [String(a.id), String(a.role)]));

  const members: MemberView[] = input.members.map((m) => {
    const roles = new Set((m.engineRoles as string[] | undefined) ?? []);
    const mine = input.agents.filter((a) => roles.has(String(a.role))).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const working = mine.find((a) => ACTIVE.has(String(a.status)));
    const isChief = m.level === "chef";
    // La cheffe porte les passages : préparation (orchestratrice) et suivis (analyste).
    const runs: RunView[] = isChief
      ? [...input.runs]
          .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
          .slice(0, 12)
          .map((r) => ({
            id: r.id as Id,
            at: String(r.startedAt),
            kind: RUN_KIND_LABELS[String(r.kind)] ?? String(r.kind),
            kindKey: String(r.kind),
            status: String(r.status),
            campaign: campaignName.get(String(idOf(r.campaign))) ?? "—",
            summary: (r.summary as string | null) ?? null,
            headline: firstSentence(r.summary as string | null),
            costEur: r2(num(r.costEur)),
          }))
      : [];
    // Les créas à valider sont celles du SEA : elles attendent Margaux, pas Serge.
    const waiting = String(m.key) === "chef-sea" && input.pendingValidations > 0;
    const active = m.active !== false;
    // Yanis (mesure) tient la fiche des canaux ; Thomas lit Google Ads et Sarah ChatGPT Ads dès que
    // leur connecteur est posé : ils travaillent sans rôle moteur.
    const reader = READERS[String(m.key)];
    const plugged = isPlugged(String(m.key), [...roles]);
    const state: MemberState = !plugged ? "bientot" : !active ? "pause" : working ? "travail" : waiting ? "validation" : "repos";
    const lastAt = mine[0] ? String(mine[0].createdAt) : null;
    const inMonth = mine.filter((a) => Date.parse(String(a.createdAt)) >= monthFrom);
    return {
      id: m.id as Id,
      key: String(m.key),
      name: String(m.name),
      jobTitle: String(m.jobTitle),
      level: m.level === "chef" ? "chef" : "sous-agent",
      portrait: String(m.portrait),
      photoUrl: (m.photo && typeof m.photo === "object" ? ((m.photo as { url?: string }).url ?? null) : null) || null,
      chiefId: idOf(m.chief),
      specialty: String(m.specialty ?? ""),
      state,
      active,
      group: m.level === "chef" ? "direction" : groupOf(String(m.key)),
      engineRoles: [...roles],
      stateLine:
        String(m.key) === "sea-mesure" && state !== "pause"
          ? "Tient la fiche des canaux à jour"
          : reader && state !== "bientot" && state !== "pause"
          ? reader.line
          : state === "bientot"
          ? "Son travail arrive bientôt"
          : state === "pause"
          ? "En pause : le moteur ne l'emploie plus"
          : state === "travail"
          ? `Au travail : ${String(working!.mission).slice(0, 90)}${String(working!.mission).length > 90 ? "…" : ""}`
          : state === "validation"
            ? `${input.pendingValidations} créa${input.pendingValidations > 1 ? "s" : ""} attend${input.pendingValidations > 1 ? "ent" : ""} votre validation`
            : sinceLine(lastAt, input.now),
      monthMissions: inMonth.length,
      monthCostEur: r2(inMonth.reduce((s, a) => s + num(a.spentEur), 0)),
      lastAt,
      missions: mine.slice(0, 15).map((a) => ({
        id: a.id as Id,
        at: String(a.createdAt),
        campaign: campOfRun(a.run),
        mission: String(a.mission ?? ""),
        ask: firstSentence(String(a.mission ?? "")) ?? "",
        status: String(a.status),
        result: resultText(a.result),
        answer: firstSentence((a.error as string | null) ?? resultText(a.result)),
        error: (a.error as string | null) ?? null,
        costEur: r2(num(a.spentEur)),
        budgetEur: r2(num(a.budgetEur)),
      })),
      runs,
    };
  });

  const feed = input.steps
    .filter((s) => typeof s.line === "string" && s.line && !TECHNICAL_LINE.test(String(s.line)))
    .map((s) => {
      const { line, role } = personalize(String(s.line), nameByRole);
      const r = role ?? roleOfAgent.get(String(idOf(s.agent))) ?? null;
      return { at: String(s.createdAt), memberKey: r ? (roleOwner.get(r)?.key as string | undefined) ?? null : null, line };
    });

  return { members, pendingValidations: input.pendingValidations, feed };
}

/** La page Équipe IA : l'activité de chacun, et ce que coûte l'équipe. */
export async function loadTeamView(payload: Payload, now = new Date()): Promise<TeamView & { spend: TeamSpend }> {
  const common = { overrideAccess: true, pagination: false, depth: 0 } as const;
  const [members, agents, runs, campaigns, steps, pending] = await Promise.all([
    payload.find({ collection: "ai-team-members", sort: "order", overrideAccess: true, pagination: false, depth: 1 }),
    payload.find({ collection: "ad-agents", sort: "-createdAt", limit: 400, overrideAccess: true, depth: 0, select: { role: true, status: true, mission: true, result: true, error: true, spentEur: true, budgetEur: true, createdAt: true, run: true } as never }),
    payload.find({ collection: "ad-agent-runs", sort: "-startedAt", limit: 60, overrideAccess: true, depth: 0, select: { campaign: true, kind: true, status: true, summary: true, costEur: true, startedAt: true } as never }),
    payload.find({ collection: "ad-campaigns", ...common, select: { name: true } as never }),
    payload.find({ collection: "ad-agent-steps", sort: "-createdAt", limit: 40, overrideAccess: true, depth: 0, select: { line: true, agent: true, createdAt: true } as never }),
    payload.count({ collection: "ad-creatives", where: { status: { equals: "a-valider" } }, overrideAccess: true }),
  ]);
  const [messages, questions, settings, registry] = await Promise.all([
    payload.find({ collection: "ai-team-messages", where: { from: { equals: "agent" } }, pagination: false, depth: 0, overrideAccess: true, select: { member: true, costEur: true, createdAt: true } as never }),
    payload.find({ collection: "ad-questions", pagination: false, depth: 0, overrideAccess: true, select: { costEur: true, askedAt: true } as never }),
    payload.findGlobal({ slug: "ads-settings", overrideAccess: true }) as Promise<{ agentMonthlyEur?: number | null }>,
    // Le chiffre que le moteur compare au budget : le registre des dépenses « agents » du mois.
    spentOf(payload, "agent", now),
  ]);
  const spend = buildTeamSpend({
    registryMonthEur: registry.month,
    members: members.docs as unknown as Raw[],
    agents: agents.docs as unknown as Raw[],
    messages: messages.docs as unknown as Raw[],
    questions: questions.docs as unknown as Raw[],
    capMonthEur: settings.agentMonthlyEur ?? null,
    now,
  });
  const view = buildTeamView({
    members: members.docs as unknown as Raw[],
    agents: agents.docs as unknown as Raw[],
    runs: runs.docs as unknown as Raw[],
    campaigns: campaigns.docs as unknown as Raw[],
    steps: steps.docs as unknown as Raw[],
    pendingValidations: pending.totalDocs,
    now,
  });
  return { ...view, spend };
}
