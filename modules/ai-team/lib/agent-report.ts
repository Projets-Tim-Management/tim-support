import type { Payload, Where } from "payload";

import type { ClaudeModel } from "@/core/lib/ai-pricing";
import { DAY_MS } from "@/modules/ai-team/lib/format";
import { consignesBlock, consignesFor } from "@/modules/ai-team/lib/notebook";
import { loadBriefBlock } from "@/modules/ai-team/lib/brief";
import { roadmapBlock, roadmapForModel } from "@/modules/ai-team/lib/roadmap";
import { latestMethods, memberByKey } from "@/modules/ai-team/lib/shared-data";
import { SOCLES, spendKindOf, teamOfKey } from "@/modules/ai-team/lib/veille-domains";
import { INTERRUPTED, isPeriodDone, staleBefore } from "@/modules/ai-team/lib/stale";
import { runWebModel, WebRunError, type WebCall } from "@/modules/ai-team/lib/web-model";
import { fileVitrineRequests, parseVitrineRequests, VITRINE_RULE } from "@/modules/ai-team/lib/vitrine-requests";

/**
 * LE RAPPORT D'UN AGENT DE L'ÉQUIPE SEO/GEO, d'un bout à l'autre — commun à
 * l'audit du site (Ana), au rapport de concurrence (Guy) et au plan de contenu
 * (Paige) (relecture du 12/11/2026 : les trois recopiaient ce déroulé) :
 *
 *  1. l'agent existe et est en service ; le rapport est dû (ou `force`) et pas
 *     déjà fait pour cette période ;
 *  2. il se RÉSERVE (une ligne « en cours ») : un second déclenchement dans les
 *     15 minutes se retire ;
 *  3. ses données, puis le modèle avec le web (coût vérifié avant, compté au
 *     budget de l'équipe SEO/GEO) ;
 *  4. la réponse vérifiée est enregistrée — ou l'échec, avec ce qu'il a coûté.
 */

export type ReportKind = "site" | "concurrence" | "contenu" | "ia" | "technique" | "autorite" | "reseaux" | "pipeline" | "conversion" | "essais" | "sante" | "regles";
export type ReportResult = { status: "fait" | "pas-encore" | "deja-fait" | "pause" | "echec"; message?: string; findings?: number; costEur?: number };
type Member = { id: number | string; name: string; active?: boolean | null; jobTitle?: string | null };

export async function runAgentReport<F>(
  payload: Payload,
  o: {
    memberKey: string;
    kind: ReportKind;
    period: string;
    now: Date;
    force?: boolean;
    /** Le rapport est-il dû maintenant (hors `force`) ? */
    due: () => boolean | Promise<boolean>;
    /** Ce qu'il faut faire avant (lire les plans de site…), forcé ou non. */
    before?: () => Promise<void>;
    data: (member: Member) => Promise<{ data: unknown; keep?: Record<string, unknown> }>;
    system: (name: string) => string;
    ask: string;
    /** La réponse vérifiée ; `keep` : ce que la réponse ajoute au rapport enregistré (les mentions de Linda). */
    parse: (text: string) => { summary: string; findings: F[]; keep?: Record<string, unknown> } | null;
    model: ClaudeModel;
    maxTokens: number;
    maxSearches: number;
    maxFetches: number;
    detail: (name: string) => string;
    call?: WebCall;
  },
): Promise<ReportResult> {
  // Pas dû : rien n'est lu en base (le réveil de la minute passe sur une dizaine de rapports — relecture du 15/11/2026).
  if (!o.force && !(await o.due())) return { status: "pas-encore" };
  const member = await memberByKey<Member>(payload, o.memberKey, { name: true, active: true, jobTitle: true });
  if (!member) return { status: "echec", message: "Cet agent est introuvable dans l'équipe." };
  if (member.active === false) return { status: "pause", message: `${member.name} est en pause.` };
  // Un rapport coupé en route (fin du temps du réveil) reste « en cours » : il est clos « interrompu », et relancé.
  await payload.update({ collection: "ai-team-audits", where: { and: [{ member: { equals: member.id } }, { kind: { equals: o.kind } }, { status: { equals: "en-cours" } }, { createdAt: { less_than: staleBefore(o.now) } }] }, data: { status: "echec", error: INTERRUPTED } as never, overrideAccess: true }).catch(() => null);
  if (!o.force) {
    const rows = await payload.find({ collection: "ai-team-audits", where: { and: [{ member: { equals: member.id } }, { kind: { equals: o.kind } }, { period: { equals: o.period } }] }, limit: 10, depth: 0, overrideAccess: true, select: { status: true, error: true } as never });
    if (isPeriodDone(rows.docs as unknown as { status?: unknown; error?: unknown }[])) return { status: "deja-fait" };
  }
  await o.before?.();
  const running = await payload.count({ collection: "ai-team-audits", where: { and: [{ member: { equals: member.id } }, { status: { equals: "en-cours" } }, { createdAt: { greater_than: new Date(o.now.getTime() - 15 * 60_000).toISOString() } }] }, overrideAccess: true });
  if (running.totalDocs) return { status: "deja-fait", message: `Le travail de ${member.name} est déjà en cours.` };
  const reserved = await payload.create({ collection: "ai-team-audits", data: { member: member.id, kind: o.kind, period: o.period, status: "en-cours" } as never, overrideAccess: true });
  const fail = (message: string, extra: Record<string, unknown> = {}) =>
    payload.update({ collection: "ai-team-audits", id: reserved.id, data: { status: "echec", error: message.slice(0, 2000), ...extra } as never, overrideAccess: true }).catch(() => null);
  try {
    const [{ data, keep }, methods, consignes, road, brief] = await Promise.all([
      o.data(member),
      latestMethods(payload, [member.id], true).catch(() => new Map()),
      consignesFor(payload, o.memberKey).catch(() => [] as string[]),
      // La feuille de route de son équipe : les objectifs qu'il sert, ce que font les équipes humaines.
      roadmapForModel(payload, teamOfKey(o.memberKey), o.now).catch(() => null),
      // La fiche produit & positionnement : la cible, les objections, les preuves, les mots des clients.
      loadBriefBlock(payload).catch(() => ""),
    ]);
    // Sa méthode, réécrite chaque dimanche après sa veille (nouveautés, tendances France et États-Unis) : il l'applique.
    const method = methods.get(String(member.id));
    const methodBlock = method?.method ? `\n\nTa méthode (réécrite le ${String(method.createdAt ?? "").slice(0, 10)} après ta veille web) — applique-la ; ses idées à tester sont des hypothèses, pas des preuves :\n<donnees>\n${String(method.method).replace(/<\/?donnees>/g, "").slice(0, 8_000)}\n</donnees>` : SOCLES[o.memberKey]?.length
        ? `\n\nTon socle de méthode (pas encore de veille : applique ces règles de fond de ton métier) :\n${SOCLES[o.memberKey].map((x) => `- ${x}`).join("\n")}`
        : "";
    const run = await runWebModel(payload, {
      model: o.model,
      // Les consignes en cours de son chef (son carnet) s'ajoutent à sa consigne.
      // Chaque agent peut demander une amélioration du site vitrine hors de son périmètre (19/11/2026).
      system: o.system(member.name) + brief + consignesBlock(consignes) + roadmapBlock(road) + VITRINE_RULE,
      user: `<donnees>\n${JSON.stringify(data).replace(/<\/?donnees>/g, "")}\n</donnees>${methodBlock}\n\n${o.ask}`,
      // Chaque bureau paie sur son budget : SEO/GEO, commercial (Nathan, Jade, Malo), SEA.
      kind: spendKindOf(teamOfKey(o.memberKey)),
      detail: o.detail(member.name),
      now: o.now,
      maxTokens: o.maxTokens,
      maxSearches: o.maxSearches,
      maxFetches: o.maxFetches,
      call: o.call,
    });
    const out = run.stopReason === "refusal" ? null : o.parse(run.text);
    if (!out) {
      await fail("Réponse du modèle inutilisable (constats absents).", { searches: run.searches, costEur: run.costEur });
      return { status: "echec", message: "La réponse n'a pas pu être lue.", costEur: run.costEur };
    }
    await payload.update({ collection: "ai-team-audits", id: reserved.id, data: { status: "fait", summary: out.summary, findings: out.findings, searches: run.searches, costEur: run.costEur, ...keep, ...out.keep } as never, overrideAccess: true });
    // Ses demandes d'amélioration du site vitrine, déposées dans « Mes tâches » sous son chef, avec un prompt prêt.
    const vitrine = await fileVitrineRequests(payload, member, o.memberKey, parseVitrineRequests(run.text), o.now).catch((e) => {
      payload.logger.warn(`[équipe IA] demandes vitrine de ${member.name} : ${e instanceof Error ? e.message : String(e)}`);
      return 0;
    });
    return { status: "fait", findings: out.findings.length, costEur: run.costEur, ...(vitrine ? { message: `${vitrine} demande(s) pour le site vitrine.` } : {}) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await fail(message, e instanceof WebRunError ? { searches: e.searches, costEur: e.costEur } : {});
    return { status: "echec", message };
  }
}

/**
 * Le dernier rapport fait d'une nature (et son âge, et ce qu'il a mesuré). L'audit du site d'avant les natures compte
 * comme « site ». Le SEUL endroit qui lit « le dernier rapport » : Nathan, Jade, Malo et Lou passent par lui.
 */
export async function latestReport<F, M = unknown>(payload: Payload, kind: ReportKind, now = new Date()) {
  const where: Where = kind === "site" ? { or: [{ kind: { equals: "site" } }, { kind: { exists: false } }] } : { kind: { equals: kind } };
  const res = await payload.find({ collection: "ai-team-audits", where: { and: [{ status: { equals: "fait" } }, where] }, sort: "-createdAt", limit: 1, depth: 0, overrideAccess: true }).catch(() => null);
  const d = res?.docs[0] as unknown as { createdAt: string; period: string; summary?: string; findings?: F[]; measure?: M | null } | undefined;
  if (!d) return null;
  return { at: d.createdAt, period: d.period, ageDays: Math.floor((now.getTime() - Date.parse(d.createdAt)) / DAY_MS), summary: d.summary ?? "", findings: Array.isArray(d.findings) ? d.findings : [], measure: (d.measure ?? null) as M | null };
}

/** Les constats d'un rapport, triés : impact fort d'abord. */
export const IMPACT_ORDER = { fort: 0, moyen: 1, faible: 2 } as const;
