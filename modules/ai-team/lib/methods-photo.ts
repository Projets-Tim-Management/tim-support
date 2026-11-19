import type { Payload } from "payload";

import { latestMethods, membersByKeys } from "@/modules/ai-team/lib/shared-data";

/**
 * Les MÉTHODES lues par le moteur d'agents (B2 de l'apprentissage,
 * 12/11/2026) : au lancement d'un passage (préparation, renouvellement,
 * suivi), on prend une PHOTO des méthodes du moment — comme pour les consignes
 * et le carnet — et chaque agent la lit dans son premier message :
 *
 *  - Mark (orchestrateur) : sa méthode de direction SEA, et la méthode
 *    Meta Ads de Camille (elle prépare des campagnes Meta) ;
 *  - Camille (analyste) : la sienne ;
 *  - le studio (stratège, rédactrice, directeur artistique, contrôleuse) :
 *    chacun la sienne, puis la méthode Meta Ads de Camille.
 *
 * La photo ne bouge plus : une reprise relit la même chose, et on sait après
 * coup ce que l'agent avait sous les yeux. Une méthode n'est qu'un texte
 * donné au modèle : les consignes de Charlie passent avant, et les garde-fous
 * en code après, quoi qu'elle dise.
 */

export type MethodPhoto = { key: string; name: string; title: string; week: string; text: string };
export type MethodsRead = MethodPhoto[];

const MAX_CHARS = 6_000;
const TITLES: Record<string, string> = {
  "chef-sea": "Méthode de direction SEA",
  "sea-meta": "Méthode Meta Ads",
  "sea-stratege": "Méthode de stratégie créative",
  "sea-redacteur": "Méthode de rédaction publicitaire",
  "sea-directeur-artistique": "Méthode de direction artistique",
  "sea-controleur": "Méthode de contrôle",
};
/** Le membre de l'équipe qui incarne chaque rôle du moteur. */
const OWN: Record<string, string> = { orchestrateur: "chef-sea", analyste: "sea-meta", stratege: "sea-stratege", redacteur: "sea-redacteur", "directeur-artistique": "sea-directeur-artistique", controleur: "sea-controleur" };
/** Quelles méthodes lit chaque rôle du moteur, dans l'ordre : la sienne, puis celle de Camille (Meta). */
const READS: Record<string, string[]> = {
  orchestrateur: ["chef-sea", "sea-meta"],
  analyste: ["sea-meta"],
  stratege: ["sea-stratege", "sea-meta"],
  redacteur: ["sea-redacteur", "sea-meta"],
  "directeur-artistique": ["sea-directeur-artistique", "sea-meta"],
  controleur: ["sea-controleur", "sea-meta"],
};
const DEFAULT_READS = ["sea-meta"];

/** La photo : la dernière version faite des méthodes utiles au moteur. Vide si rien (ou table absente). */
export async function loadMethodsPhoto(payload: Payload): Promise<MethodsRead> {
  try {
    const members = await membersByKeys(payload, Object.keys(TITLES));
    const methods = await latestMethods(payload, members.map((m) => m.id), true);
    return members.flatMap((m) => {
      const d = methods.get(String(m.id));
      return d?.method ? [{ key: m.key, name: m.name, title: TITLES[m.key], week: d.week, text: d.method.slice(0, MAX_CHARS) }] : [];
    });
  } catch (err) {
    payload.logger?.warn?.(`[équipe IA] méthodes illisibles pour le passage, il part sans : ${err}`);
    return [];
  }
}

/** Relit la photo stockée sur un passage (json) ; vide si absente (passages d'avant les méthodes). Pure. */
export function methodsOf(run: { methodsRead?: unknown }): MethodsRead {
  return Array.isArray(run.methodsRead) ? (run.methodsRead as MethodsRead).filter((m) => m && typeof m.text === "string") : [];
}

/** Ce que l'agent lit dans son premier message ; vide s'il n'a aucune méthode à lire. Pure (testée). */
export function methodsText(photo: MethodsRead, role: string): string {
  const wanted = READS[role] ?? DEFAULT_READS;
  const parts = wanted
    .map((key) => photo.find((m) => m.key === key))
    .filter((m): m is MethodPhoto => Boolean(m))
    .map((m) => {
      const whose = OWN[role] === m.key ? `Ta ${m.title.charAt(0).toLowerCase()}${m.title.slice(1)}` : `La ${m.title.charAt(0).toLowerCase()}${m.title.slice(1)} de ${m.name}`;
      return `${whose} pour TIM (réécrite après la veille de la semaine du ${m.week}) :\n<methode>\n${m.text.replace(/<\/?methode>/g, "")}\n</methode>`;
    });
  if (!parts.length) return "";
  return [
    "Méthode — tes repères de métier, mis à jour chaque semaine par la veille et les résultats de TIM. Les consignes de Charlie passent avant elle ; ce qui y est marqué « à tester » n'est pas prouvé.",
    ...parts,
  ].join("\n");
}
