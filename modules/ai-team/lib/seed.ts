import type { Payload } from "payload";

import { AI_TEAM_SEED, PREVIOUS_DEFAULTS } from "@/modules/ai-team/lib/team";

/**
 * Tient l'équipe d'agents IA à jour avec l'organisation déclarée dans le code
 * (modules/ai-team/lib/team), à chaque démarrage :
 *
 *  - un membre absent est CRÉÉ (nom, métier, visage, rôle par défaut) ;
 *  - un membre présent garde ce que la direction a écrit (prénom, métier,
 *    visage, « ce qu'il fait », façon de parler, en service, budget) ; seul ce
 *    qui relève du code est réaligné : niveau, domaine, chef, rôles du moteur,
 *    ordre ;
 *  - exception : un texte encore égal à l'ancien défaut (PREVIOUS_DEFAULTS)
 *    suit la nouvelle organisation — Margaux devient « Directrice SEA ».
 *
 * ⚠️ Base partagée dev/prod : jamais de suppression. Une table absente
 * (migration pas encore appliquée) n'est pas fatale : on le dit, et
 * l'application démarre.
 */
export async function seedAiTeam(payload: Payload): Promise<void> {
  try {
    const existing = await payload.find({ collection: "ai-team-members", pagination: false, depth: 0, overrideAccess: true });
    type Doc = { id: number; key: string; jobTitle?: string; specialty?: string; level?: string; domain?: string; engineRoles?: string[] | null; order?: number | null; chief?: number | { id: number } | null };
    const byKey = new Map((existing.docs as unknown as Doc[]).map((d) => [d.key, d]));
    const ids = new Map<string, number | string>([...byKey].map(([k, d]) => [k, d.id]));
    let created = 0;
    let aligned = 0;
    // Les chefs d'abord : un sous-agent doit pouvoir pointer vers son chef.
    const ordered = [...AI_TEAM_SEED].sort((a, b) => (a.level === "chef" ? 0 : 1) - (b.level === "chef" ? 0 : 1));
    for (const m of ordered) {
      // `group` est une donnée d'affichage (code), pas une colonne : on ne l'écrit pas.
      const { chiefKey, group, ...rest } = m;
      void group;
      const code = { level: m.level, domain: m.domain, engineRoles: m.engineRoles, order: AI_TEAM_SEED.indexOf(m), chief: chiefKey ? (ids.get(chiefKey) ?? null) : null };
      const doc = byKey.get(m.key);
      if (!doc) {
        const c = await payload.create({ collection: "ai-team-members", data: { ...rest, ...code } as never, overrideAccess: true });
        ids.set(m.key, c.id);
        created += 1;
        continue;
      }
      const prev = PREVIOUS_DEFAULTS[m.key] ?? {};
      const text = {
        ...(prev.jobTitle && doc.jobTitle === prev.jobTitle ? { jobTitle: m.jobTitle } : {}),
        ...(prev.specialty && doc.specialty === prev.specialty ? { specialty: m.specialty } : {}),
      };
      // Rien à réaligner : on n'écrit pas (pas d'écriture à chaque démarrage).
      const chiefNow = doc.chief && typeof doc.chief === "object" ? doc.chief.id : (doc.chief ?? null);
      const same =
        doc.level === code.level &&
        doc.domain === code.domain &&
        Number(doc.order ?? -1) === code.order &&
        String(chiefNow ?? "") === String(code.chief ?? "") &&
        [...(doc.engineRoles ?? [])].sort().join() === [...code.engineRoles].sort().join() &&
        !Object.keys(text).length;
      if (same) continue;
      await payload.update({ collection: "ai-team-members", id: doc.id, data: { ...code, ...text } as never, overrideAccess: true });
      aligned += 1;
    }
    if (created || aligned) payload.logger.info(`[équipe IA] ${created} membre(s) créé(s), ${aligned} réaligné(s) sur l'organisation.`);
  } catch (err) {
    payload.logger.error(`[équipe IA] mise à jour de l'équipe échouée : ${err}`);
  }
}
