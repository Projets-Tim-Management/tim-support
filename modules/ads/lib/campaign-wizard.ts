import { DEFAULT_AI_SHARE_PCT, DEFAULT_META_FLOOR_EUR, validateAgentBudget } from "@/modules/ads/agent/limits";

/**
 * Créer une campagne pas à pas (demande de Charlie, 20/10/2026 : « des étapes
 * avec popup… on est sûr de ne louper aucune étape »). Six étapes ; chacune est
 * ENREGISTRÉE en passant à la suivante — la première crée le brouillon, les
 * autres le complètent —, si bien qu'une fenêtre fermée se reprend là où elle
 * s'était arrêtée : à la première étape incomplète.
 *
 * Ce module dit ce qui manque et ce qu'on écrit ; la fenêtre ne fait que
 * l'afficher. Pur, utilisable côté client.
 */

export const WIZARD_STEPS = [
  { key: "bases", label: "Bases", title: "La campagne" },
  { key: "cible", label: "Cible", title: "À qui parle-t-on ?" },
  { key: "offre", label: "Offre", title: "Que propose-t-on ?" },
  { key: "pub", label: "Pub", title: "Où mène la pub ?" },
  { key: "budget", label: "Budget", title: "Combien, et quelle liberté pour l'agent ?" },
  { key: "verifier", label: "Vérifier", title: "Tout est-il juste ?" },
] as const;

export type StepKey = (typeof WIZARD_STEPS)[number]["key"];

/** Ce que la fenêtre édite : les champs de la campagne, à plat. */
export type WizardDraft = {
  id: number | string | null;
  name: string;
  account: number | string | null;
  objective: string;
  audience: string;
  pain: string;
  offer: string;
  promise: string;
  proofs: (number | string)[];
  landingUrl: string;
  cta: string;
  tone: string;
  angles: string[];
  forbidden: string;
  totalDailyEur: number | null;
  metaFloorEur: number | null;
  maxAiSharePct: number | null;
  autonomy: string;
};

export const emptyDraft = (): WizardDraft => ({
  id: null,
  name: "",
  account: null,
  objective: "leads",
  audience: "",
  pain: "",
  offer: "",
  promise: "",
  proofs: [],
  landingUrl: "",
  cta: "en-savoir-plus",
  tone: "vous",
  angles: [],
  forbidden: "",
  totalDailyEur: null,
  metaFloorEur: DEFAULT_META_FLOOR_EUR,
  maxAiSharePct: DEFAULT_AI_SHARE_PCT,
  autonomy: "proposer",
});

const LANDING = /^https:\/\/[^\s/]+\.[^\s]+$/i;
const filled = (s: string) => s.trim().length > 0;
const idOf = (v: unknown): number | string | null => (v && typeof v === "object" && "id" in v ? (v as { id: number | string }).id : (v as number | string | null) ?? null);

/** Ce qui manque à une étape pour passer à la suivante ; vide = on peut avancer. Pure. */
export function stepProblems(step: StepKey, d: WizardDraft): string[] {
  const out: string[] = [];
  if (step === "bases") {
    if (!filled(d.name)) out.push("Donnez un nom à la campagne.");
    if (d.account == null) out.push("Choisissez le compte publicitaire.");
    if (!filled(d.objective)) out.push("Dites ce que la campagne doit obtenir.");
  }
  if (step === "cible") {
    if (!filled(d.audience)) out.push("Décrivez la cible.");
    if (!filled(d.pain)) out.push("Décrivez leur problème, dans leurs mots.");
  }
  if (step === "offre") {
    if (!filled(d.offer)) out.push("Décrivez l'offre.");
    if (!filled(d.promise)) out.push("Décrivez la promesse.");
  }
  if (step === "pub") {
    if (!filled(d.landingUrl)) out.push("Indiquez la page d'arrivée.");
    else if (!LANDING.test(d.landingUrl.trim())) out.push("La page d'arrivée doit être une adresse complète en https://.");
  }
  if (step === "budget") {
    if (d.totalDailyEur == null || !(d.totalDailyEur > 0)) out.push("Indiquez le budget quotidien.");
    else {
      const v = validateAgentBudget({ totalDailyEur: d.totalDailyEur, maxAiSharePct: d.maxAiSharePct, metaFloorEur: d.metaFloorEur });
      if (v !== true) out.push(v);
    }
  }
  return out;
}

/** La première étape incomplète — là où une campagne commencée se reprend. Pure. */
export function resumeStep(d: WizardDraft): StepKey {
  return WIZARD_STEPS.find((s) => s.key !== "verifier" && stepProblems(s.key, d).length > 0)?.key ?? "verifier";
}

/** Vrai quand toutes les étapes sont remplies. Pure. */
export const isComplete = (d: WizardDraft): boolean => resumeStep(d) === "verifier";

type Doc = {
  id?: number | string;
  name?: string | null;
  account?: unknown;
  objective?: string | null;
  autonomy?: string | null;
  brief?: {
    audience?: string | null;
    pain?: string | null;
    offer?: string | null;
    promise?: string | null;
    proofs?: unknown[] | null;
    forbidden?: string | null;
    landingUrl?: string | null;
    cta?: string | null;
    tone?: string | null;
    angles?: { angle?: string | null }[] | null;
  } | null;
  agentBudget?: { totalDailyEur?: number | null; metaFloorEur?: number | null; maxAiSharePct?: number | null } | null;
};

/** Une campagne lue par l'API, en brouillon de fenêtre. Pure. */
export function draftFromDoc(doc: Doc): WizardDraft {
  const e = emptyDraft();
  const b = doc.brief ?? {};
  const g = doc.agentBudget ?? {};
  return {
    id: doc.id ?? null,
    name: doc.name ?? "",
    account: idOf(doc.account),
    objective: doc.objective ?? e.objective,
    audience: b.audience ?? "",
    pain: b.pain ?? "",
    offer: b.offer ?? "",
    promise: b.promise ?? "",
    proofs: (b.proofs ?? []).map(idOf).filter((x): x is number | string => x != null),
    landingUrl: b.landingUrl ?? "",
    cta: b.cta ?? e.cta,
    tone: b.tone ?? e.tone,
    angles: (b.angles ?? []).map((a) => a.angle ?? "").filter(filled),
    forbidden: b.forbidden ?? "",
    totalDailyEur: g.totalDailyEur ?? null,
    metaFloorEur: g.metaFloorEur ?? e.metaFloorEur,
    maxAiSharePct: g.maxAiSharePct ?? e.maxAiSharePct,
    autonomy: doc.autonomy ?? e.autonomy,
  };
}

/**
 * Ce qu'on écrit en quittant une étape. Le brief est envoyé EN ENTIER à chaque
 * fois : une écriture partielle d'un groupe pourrait vider les champs absents.
 * Pure.
 */
export function stepData(step: StepKey, d: WizardDraft): Record<string, unknown> {
  const brief = {
    audience: d.audience.trim(),
    pain: d.pain.trim(),
    offer: d.offer.trim(),
    promise: d.promise.trim(),
    proofs: d.proofs,
    forbidden: d.forbidden.trim(),
    landingUrl: d.landingUrl.trim(),
    cta: d.cta,
    tone: d.tone,
    angles: d.angles.map((a) => a.trim()).filter(filled).map((angle) => ({ angle })),
  };
  if (step === "bases") return { name: d.name.trim(), account: d.account, objective: d.objective };
  if (step === "budget") return { agentBudget: { totalDailyEur: d.totalDailyEur, metaFloorEur: d.metaFloorEur, maxAiSharePct: d.maxAiSharePct }, autonomy: d.autonomy };
  if (step === "verifier") return {};
  return { brief };
}

const OBJECTIVE_PHRASE: Record<string, string> = { leads: "Obtenir des prospects", trafic: "Amener du trafic qualifié sur le site", notoriete: "Faire connaître TIM", autre: "Atteindre l'objectif de la campagne" };

/** La phrase d'objectif proposée pour le premier passage de l'agent, modifiable. Pure. */
export function suggestedRunObjective(d: WizardDraft): string {
  const who = d.audience.trim().split(/\n|\.(\s|$)/)[0]?.trim();
  return `${OBJECTIVE_PHRASE[d.objective] ?? OBJECTIVE_PHRASE.autre}${who ? ` auprès de : ${who}` : ""}${d.offer.trim() ? `, avec l'offre « ${d.offer.trim()} »` : ""}.`;
}
