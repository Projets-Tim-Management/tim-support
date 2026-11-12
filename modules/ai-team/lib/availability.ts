import type { Payload } from "payload";

import type { RequestInput } from "@/modules/ai-team/lib/requests";

/**
 * Qui est EN PAUSE dans l'équipe IA — la case « en service » de l'organigramme,
 * lue par le moteur d'agents à ses trois portes d'entrée :
 *  - lancer une préparation (orchestratrice) ;
 *  - planifier un suivi (analyste) ;
 *  - confier une mission à un sous-agent (outil `creer_sous_agent`).
 *
 * Fiable plutôt que décorative : une fiche en pause BLOQUE ces trois gestes.
 * Une table illisible (migration absente, base injoignable) ne bloque rien —
 * le moteur garde son comportement d'avant l'équipe IA, et on le journalise.
 */

export type PausedMember = { name: string; jobTitle: string };

/** Rôle du moteur → la personne en pause qui l'incarne. */
export async function pausedRoles(payload: Payload): Promise<Map<string, PausedMember>> {
  try {
    const res = await payload.find({
      collection: "ai-team-members",
      where: { active: { equals: false } },
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: { name: true, jobTitle: true, engineRoles: true } as never,
    });
    const out = new Map<string, PausedMember>();
    for (const m of res.docs as unknown as { name: string; jobTitle: string; engineRoles?: string[] | null }[]) {
      for (const role of m.engineRoles ?? []) out.set(role, { name: m.name, jobTitle: m.jobTitle });
    }
    return out;
  } catch (err) {
    payload.logger.warn(`[équipe IA] état « en service » illisible, rien n'est bloqué : ${err}`);
    return new Map();
  }
}

/** La phrase qui dit pourquoi un geste est refusé : « Léa (rédactrice) est en pause dans l'équipe IA… » */
export const pausedReason = (m: PausedMember) => `${m.name} (${m.jobTitle.toLowerCase()}) est en pause dans l'équipe IA : la direction peut remettre cet agent en service dans Équipe IA › Organigramme.`;

/** Le membre de l'équipe qui incarne ce rôle du moteur (null si aucun). */
async function memberOfRole(payload: Payload, role: string): Promise<{ id: number | string; name: string; jobTitle: string; chief: number | string | null } | null> {
  const res = await payload.find({ collection: "ai-team-members", where: { engineRoles: { contains: role } }, limit: 1, depth: 0, overrideAccess: true, select: { name: true, jobTitle: true, chief: true } as never });
  const m = res.docs[0] as unknown as { id: number | string; name: string; jobTitle: string; chief?: number | string | { id: number | string } | null } | undefined;
  if (!m) return null;
  const chief = m.chief && typeof m.chief === "object" ? m.chief.id : (m.chief ?? null);
  return { id: m.id, name: m.name, jobTitle: m.jobTitle, chief };
}

/**
 * À qui s'adresse une demande : la direction ne parle qu'aux chefs. Un sous-agent
 * (Camille, cheffe Meta Ads) remonte donc par son chef (Margaux) — la demande
 * porte le nom du chef, et dit qui l'a soulevée.
 */
async function speakerOfRole(payload: Payload, role: string): Promise<{ id: number | string; via: string | null } | null> {
  const m = await memberOfRole(payload, role);
  if (!m) return null;
  return m.chief != null ? { id: m.chief, via: `${m.name} (${m.jobTitle})` } : { id: m.id, via: null };
}

/**
 * Le port que le moteur reçoit : qui est en pause, et les demandes à la
 * direction (déposer, relire les réponses), au nom du chef qui incarne le rôle.
 */
export const teamPort = (payload: Payload) => ({
  paused: async (role: string): Promise<string | null> => {
    const m = (await pausedRoles(payload)).get(role);
    return m ? pausedReason(m) : null;
  },
  ask: async (role: string, r: RequestInput, origin: { run: number | string; campaign: number | string }) => {
    const member = await speakerOfRole(payload, role);
    if (!member) throw new Error(`aucun membre de l'équipe n'incarne le rôle « ${role} ».`);
    // La même demande encore ouverte ne se dépose pas deux fois : on rend la première.
    const same = await payload.find({
      collection: "ai-team-requests",
      where: { and: [{ member: { equals: member.id } }, { status: { equals: "ouverte" } }, { title: { equals: r.title } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    if (same.docs[0]) return same.docs[0].id as number | string;
    const doc = await payload.create({
      collection: "ai-team-requests",
      data: { member: member.id, kind: r.kind, status: "ouverte", title: r.title, why: member.via ? `Soulevé par ${member.via} : ${r.why}` : r.why, url: r.url, steps: r.steps, question: r.question, run: origin.run, campaign: origin.campaign, origin: "agent" } as never,
      overrideAccess: true,
    });
    return doc.id as number | string;
  },
  answers: async (role: string) => {
    const member = await speakerOfRole(payload, role);
    if (!member) return [];
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const res = await payload.find({
      collection: "ai-team-requests",
      where: { and: [{ member: { equals: member.id } }, { status: { in: ["faite", "repondue"] } }, { closedAt: { greater_than_equal: since } }] },
      sort: "-closedAt",
      limit: 15,
      depth: 0,
      overrideAccess: true,
    });
    return (res.docs as unknown as { title: string; kind: string; status: string; answer?: string | null; closedAt?: string | null }[]).map((d) => ({
      titre: d.title,
      forme: d.kind,
      etat: d.status,
      reponse: d.answer ?? null,
      le: d.closedAt ? d.closedAt.slice(0, 10) : null,
    }));
  },
});

/**
 * Le budget IA du mois de l'équipe SEA, posé sur la carte de sa cheffe. Toute
 * la dépense « agents » du registre est celle de cette équipe (c'est la seule
 * qui existe) : le moteur la compare à ce budget avant chaque appel payant.
 * Rien de posé, ou fiche illisible : null, seul le plafond global s'applique.
 */
export async function seaMonthlyBudget(payload: Payload): Promise<{ name: string; budgetEur: number } | null> {
  try {
    const res = await payload.find({ collection: "ai-team-members", where: { key: { equals: "chef-sea" } }, limit: 1, depth: 0, overrideAccess: true, select: { name: true, monthlyAiBudgetEur: true } as never });
    const m = res.docs[0] as unknown as { name?: string; monthlyAiBudgetEur?: number | null } | undefined;
    return m && typeof m.monthlyAiBudgetEur === "number" ? { name: String(m.name ?? "La cheffe"), budgetEur: m.monthlyAiBudgetEur } : null;
  } catch {
    return null;
  }
}
