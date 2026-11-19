import type { Payload } from "payload";

import { overlaps, topicTokens } from "@/modules/editorial/lib/articles/cannibal";
import { OFFICES, teamOfKey } from "@/modules/ai-team/lib/veille-domains";

/**
 * LES DEMANDES POUR LE SITE VITRINE (décision de la direction, 19/11/2026) : « les agents
 * sont limités dans leurs secteurs, mais si besoin ils peuvent me solliciter, tant que c'est
 * dans un but d'amélioration » — une calculette, une page, un composant, tout ce qu'un
 * simple article ne peut pas faire.
 *
 * Un agent l'écrit dans son rapport (balise <demandesVitrine>) ; le code la dépose dans
 * « Mes tâches » à son nom, sous son chef (« Sergey · idée de Paige »), avec un PROMPT
 * COMPLET à donner à Claude dans le projet du site vitrine (tim-front). Le prompt est
 * construit par le code : le cadre (règles du site, livraison) est toujours le même ; l'agent
 * n'apporte que le besoin, la preuve et le détail.
 *
 * Garde-fous : 2 demandes par rapport au plus ; jamais un doublon d'une demande des 6
 * derniers mois (ouverte, faite ou retirée) ; 3 demandes vitrine ouvertes au plus par équipe.
 * Pur, sauf `fileVitrineRequests`.
 */

export const VITRINE_PREFIX = "Site vitrine : ";
const MAX_PER_REPORT = 2;
const MAX_OPEN_PER_TEAM = 3;
const DEDUP_DAYS = 180;

/** La consigne ajoutée au rôle de chaque agent qui rend un rapport. */
export const VITRINE_RULE = [
  "",
  "DEMANDER UNE AMÉLIORATION DU SITE VITRINE (tim-management.co) — seulement si c'est vraiment utile :",
  "Ton périmètre est limité. Si une amélioration qui ferait progresser tes résultats ne peut PAS se faire avec ce que tu produis (un article, une fiche, un texte, une recommandation) — par exemple une calculette ou un convertisseur quand Google classe des outils en tête, une page ou une section manquante, un composant, un formulaire, un tableau interactif —, ajoute à la fin de ta réponse :",
  '<demandesVitrine>[{"titre": "ce qu\'il faut ajouter, en une ligne", "besoin": "ce que le visiteur doit pouvoir faire", "pourquoi": "le gain attendu pour TIM Management", "preuve": "le chiffre ou le constat tiré de tes données qui le justifie (requête, position, volume, concurrents classés…)", "page": "l\'adresse ou la section visée sur tim-management.co", "details": "le comportement attendu : champs, calculs, exemples, contenu, et comment vérifier que c\'est réussi"}]</demandesVitrine>',
  "Règles : 0 à 2 demandes, seulement pour une amélioration réelle appuyée sur tes données ; jamais pour ce que tu peux faire toi-même ; jamais de chiffre inventé ni de promesse. La direction la reçoit de ton chef avec un prompt prêt pour le développeur du site. Aucune demande est une bonne réponse.",
].join("\n");

export type VitrineRequest = { titre: string; besoin: string; pourquoi: string; preuve: string; page: string; details: string };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Les demandes d'un rapport (0 à 2), vérifiées. Pure (testée). */
export function parseVitrineRequests(text: string): VitrineRequest[] {
  const m = /<demandesVitrine>([\s\S]*?)<\/demandesVitrine>/i.exec(text);
  if (!m) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(m[1].trim().replace(/^```(?:json)?|```$/g, ""));
  } catch {
    return [];
  }
  return (Array.isArray(raw) ? raw : [])
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      return { titre: str(o.titre, 160), besoin: str(o.besoin, 1500), pourquoi: str(o.pourquoi, 1500), preuve: str(o.preuve, 1500), page: str(o.page, 300), details: str(o.details, 4000) };
    })
    .filter((r) => r.titre && r.besoin && r.pourquoi && r.preuve)
    .slice(0, MAX_PER_REPORT);
}

/** Le prompt complet à donner à Claude dans le projet du site vitrine. Pure (testée). */
export function buildVitrinePrompt(r: VitrineRequest, o: { agent: string; job: string; chief: string; date: string }): string {
  return `Tu travailles sur le site vitrine de TIM Management (tim-management.co) : le dépôt tim-front (Next.js, contenus lus dans WordPress par l'API, déployé sur Vercel).

Demande de ${o.agent} (${o.job}, équipe IA de TIM Management), transmise par ${o.chief} le ${o.date}, et retenue par la direction.

## Ce qu'il faut faire
${r.titre}

${r.besoin}

## Pourquoi
${r.pourquoi}

Preuve : ${r.preuve}

## Où
${r.page || "À toi de proposer l'emplacement le plus logique dans l'arborescence actuelle du site."}

## Détail attendu
${r.details || "À préciser avec la direction si un point manque : pose la question avant de coder."}

## Règles du site à respecter
- Commence par lire le README et les conventions du dépôt, et regarde comment sont faites les pages voisines (pour un outil : app/(marketing)/outils-gratuits et lib/outils/) : réutilise leurs composants, leur style, leurs données structurées et leurs tests, plutôt que d'inventer un nouveau modèle.
- Marque : toujours « TIM Management », jamais « Tim ». Aucune promesse chiffrée sur TIM Management. Aucun chiffre réglementaire sans source officielle (Légifrance, service-public, code.travail.gouv.fr, URSSAF…), citée sur la page.
- SEO et GEO : un H1 en texte HTML, titre et méta description, données structurées adaptées au contenu réel, liens vers les pages proches du site, et l'essentiel (le résultat d'un calcul, un exemple, un tableau) présent dans le HTML, pas seulement après un clic.
- Accessibilité : vrais <label>, <button> et <a>, contrastes suffisants, utilisable au clavier et sur mobile.
- Ne modifie rien d'autre que ce que demande cette tâche. Si la demande te semble mauvaise ou déjà couverte par une page existante, dis-le avant de coder.

## Livraison
- Une branche dédiée ; la logique (calculs, conversions) testée avec vitest ; tsc, eslint et le build au vert.
- Une pull request en français : ce qui change, pourquoi, et comment le vérifier sur la prévisualisation Vercel. Ne la fusionne pas : la direction la relit et la fusionne.`;
}

type Member = { id: number | string; name: string; key?: string; jobTitle?: string | null };

/** Dépose les demandes d'un agent dans « Mes tâches » (à son nom, sous son chef). Rend le nombre déposé. */
export async function fileVitrineRequests(payload: Payload, agent: Member, agentKey: string, requests: VitrineRequest[], now = new Date()): Promise<number> {
  if (!requests.length) return 0;
  const team = teamOfKey(agentKey);
  const chiefKey = OFFICES[team].chief;
  const chief = (await payload.find({ collection: "ai-team-members", where: { key: { equals: chiefKey } }, limit: 1, depth: 0, overrideAccess: true, select: { name: true } as never })).docs[0] as unknown as { name?: string } | undefined;
  const since = new Date(now.getTime() - DEDUP_DAYS * 86_400_000).toISOString();
  const past = (await payload.find({ collection: "ai-team-requests", where: { and: [{ title: { like: VITRINE_PREFIX } }, { createdAt: { greater_than_equal: since } }] }, pagination: false, depth: 1, overrideAccess: true, select: { title: true, status: true, member: true } as never })).docs as unknown as { title?: string; status?: string; member?: { key?: string } | null }[];
  let open = past.filter((p) => p.status === "ouverte" && p.member && teamOfKey(String(p.member.key ?? "")) === team).length;
  let filed = 0;
  for (const r of requests) {
    if (open >= MAX_OPEN_PER_TEAM) break;
    const tokens = topicTokens(r.titre, true);
    if (past.some((p) => overlaps(tokens, topicTokens(String(p.title ?? "").replace(VITRINE_PREFIX, ""), true)))) continue;
    const prompt = buildVitrinePrompt(r, { agent: agent.name, job: agent.jobTitle ?? "agent de l'équipe", chief: chief?.name ?? "son chef", date: now.toLocaleDateString("fr-FR") });
    const url = /^https:\/\/(www\.)?tim-management\.co(\/|$)/.test(r.page) ? r.page : null;
    await payload.create({
      collection: "ai-team-requests",
      overrideAccess: true,
      data: {
        member: agent.id,
        kind: "a-faire",
        status: "ouverte",
        title: `${VITRINE_PREFIX}${r.titre}`.slice(0, 200),
        why: `${r.pourquoi}\n\nPreuve : ${r.preuve}`.slice(0, 1500),
        url,
        steps: [
          { text: "Ouvre le projet du site vitrine (dossier Vitrine/tim-front) dans Claude Code.", minutes: 1 },
          { text: "Copie ce prompt et donne-le à Claude : il prépare la modification sur une branche et ouvre une pull request.", minutes: 2, prompt },
          { text: "Relis la prévisualisation Vercel de la pull request, puis fusionne-la si elle te convient.", minutes: 10 },
          { text: `Coche « C'est fait » : ${agent.name} mesurera l'effet.`, minutes: 1 },
        ],
        origin: "agent",
        channel: team === "seo" ? "seo" : "tous",
        proposedBy: agentKey,
      } as never,
    });
    past.push({ title: r.titre, status: "ouverte", member: { key: agentKey } });
    open++;
    filed++;
  }
  return filed;
}
