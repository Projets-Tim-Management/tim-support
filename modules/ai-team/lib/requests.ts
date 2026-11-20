/**
 * Les DEMANDES d'un chef de l'équipe IA à la direction (décision du
 * 12/11/2026 : « un truc simple — soit un lien qui m'ouvre la bonne page avec
 * une consigne par étape, soit une réponse texte ; l'IA peut tout me demander
 * et ensuite je modifie »).
 *
 * Deux formes, pas une de plus :
 *  - « à faire » : un lien vers la bonne page, des étapes numérotées, et la
 *    direction clique « C'est fait » (un mot facultatif) ;
 *  - « question » : une question, et la direction répond en texte.
 *
 * Un lien ne mène QUE au back-office ou à une console connue : un agent ne peut
 * pas envoyer la direction sur une page arbitraire (une donnée lue sur le web
 * pourrait le lui souffler).
 *
 * Pur : testé sans base.
 */

export const REQUEST_KINDS = [
  { label: "À faire", value: "a-faire" },
  { label: "Question", value: "question" },
] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number]["value"];

export const REQUEST_STATUSES = [
  { label: "En attente", value: "ouverte" },
  { label: "Faite", value: "faite" },
  { label: "Répondue", value: "repondue" },
  { label: "Retirée", value: "retiree" },
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number]["value"];

/** D'où vient une demande : la revue du lundi (une recommandation suivie), un agent au travail, ou une alerte du code. */
export const REQUEST_ORIGINS = [
  { label: "Revue du lundi", value: "revue" },
  { label: "Un agent au travail", value: "agent" },
  { label: "Alerte", value: "alerte" },
] as const;

export const REQUEST_CHANNELS = [
  { label: "Meta Ads", value: "meta" },
  { label: "Google Ads", value: "google" },
  { label: "ChatGPT Ads", value: "chatgpt" },
  { label: "SEO", value: "seo" },
  { label: "Tous canaux", value: "tous" },
] as const;

/** Le verdict d'une recommandation appliquée, quelques semaines après. */
export const REQUEST_OUTCOMES = [
  { label: "✅ A marché", value: "a-marche" },
  { label: "➖ Sans effet net", value: "sans-effet" },
  { label: "❌ A empiré", value: "a-empire" },
] as const;
export type RequestOutcome = (typeof REQUEST_OUTCOMES)[number]["value"];

/** Les consoles où un chef peut envoyer la direction (hôte exact ou sous-domaine). */
export const ALLOWED_HOSTS = [
  "business.facebook.com",
  "adsmanager.facebook.com",
  "www.facebook.com",
  "ads.google.com",
  "search.google.com",
  "analytics.google.com",
  "console.cloud.google.com",
  "www.bing.com",
  "chatgpt.com",
  "platform.openai.com",
  "ads.openai.com",
  "tim-management.co",
];

/**
 * Le lien, s'il est sûr : un chemin du back-office (« /admin/… »), ou une
 * adresse https d'une console de la liste. Sinon null — la demande part sans
 * lien plutôt qu'avec un mauvais.
 */
export function safeRequestUrl(raw: unknown): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return null;
  if (/^\/admin(\/|$|\?)/.test(v) && !v.includes("//") && !/[\s<>"]/.test(v)) return v;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    const host = u.hostname.toLowerCase();
    return ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Les étapes : des phrases non vides, 8 au plus, 300 caractères chacune. */
export function cleanSteps(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    // Une étape cochée dans « Mes tâches » est gardée en objet { text, done } : on en relit le texte.
    .map((s) => String((s && typeof s === "object" ? (s as { text?: unknown }).text : s) ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((s) => (s.length > 300 ? `${s.slice(0, 299)}…` : s));
}

export type RequestInput = { kind: RequestKind; title: string; why: string; url: string | null; steps: string[]; question: string | null };

/**
 * Une demande telle qu'un agent la formule, vérifiée : rend la demande propre,
 * ou la raison du refus (que l'agent lit pour se corriger).
 */
export function validateRequest(input: Record<string, unknown>): { ok: true; value: RequestInput } | { ok: false; reason: string } {
  const kind = input.type === "question" ? "question" : input.type === "a-faire" ? "a-faire" : null;
  if (!kind) return { ok: false, reason: "type : « a-faire » ou « question »." };
  const title = String(input.titre ?? "").replace(/\s+/g, " ").trim();
  if (!title || title.length > 120) return { ok: false, reason: "titre : une phrase courte, 120 caractères au plus." };
  const why = String(input.pourquoi ?? "").trim();
  if (!why || why.length > 600) return { ok: false, reason: "pourquoi : ce qui motive la demande, 600 caractères au plus." };
  if (kind === "question") {
    const question = String(input.question ?? "").trim();
    if (!question || question.length > 600) return { ok: false, reason: "question : la question posée à la direction, 600 caractères au plus." };
    return { ok: true, value: { kind, title, why, url: null, steps: [], question } };
  }
  const steps = cleanSteps(input.etapes);
  if (!steps.length) return { ok: false, reason: "etapes : au moins une étape, ce que la direction doit faire, dans l'ordre." };
  const asked = typeof input.lien === "string" && input.lien.trim() ? input.lien : null;
  const url = safeRequestUrl(asked);
  if (asked && !url) return { ok: false, reason: `lien refusé : seulement une page du back-office (« /admin/… ») ou une console connue (${ALLOWED_HOSTS.join(", ")}).` };
  return { ok: true, value: { kind, title, why, url, steps, question: null } };
}

/** Ce que la direction fait d'une demande : la nouvelle valeur, ou la raison du refus. Pure (testée). */
export function closeRequest(req: { kind: string; status: string }, action: string, text: string): { ok: true; status: "faite" | "repondue" | "retiree" | "ouverte"; answer: string | null } | { ok: false; reason: string } {
  // Un « C'est fait » cliqué trop vite se rattrape : la demande se rouvre (une question répondue, non).
  if (action === "rouvrir") return req.kind === "a-faire" && req.status === "faite" ? { ok: true, status: "ouverte", answer: null } : { ok: false, reason: "Seule une tâche faite se rouvre." };
  if (req.status !== "ouverte") return { ok: false, reason: "Cette demande est déjà close." };
  const t = text.trim();
  if (t.length > 2000) return { ok: false, reason: "2 000 caractères au plus." };
  if (action === "retirer") return { ok: true, status: "retiree", answer: t || null };
  if (action === "fait") {
    if (req.kind !== "a-faire") return { ok: false, reason: "Une question attend une réponse, pas « C'est fait »." };
    return { ok: true, status: "faite", answer: t || null };
  }
  if (action === "repondre") {
    if (req.kind !== "question") return { ok: false, reason: "Cette demande n'est pas une question." };
    if (!t) return { ok: false, reason: "Écrivez votre réponse." };
    return { ok: true, status: "repondue", answer: t };
  }
  return { ok: false, reason: "Action inconnue." };
}

export type RequestStep = { text: string; done: boolean };

/**
 * Cocher ou décocher une étape d'une demande « à faire » (« Mes tâches », 16/11/2026). Les étapes, écrites en
 * simples textes par les agents, sont gardées en objets { text, done } dès la première coche. Toutes cochées : la
 * demande est faite. Pure (testée).
 */
export function checkRequestStep(req: { kind: string; status: string; steps?: unknown }, step: number, done: boolean): { ok: true; steps: RequestStep[]; status: "ouverte" | "faite" } | { ok: false; reason: string } {
  if (req.kind !== "a-faire") return { ok: false, reason: "Une question n'a pas d'étapes à cocher." };
  if (req.status !== "ouverte" && req.status !== "faite") return { ok: false, reason: "Cette demande est close." };
  const steps: RequestStep[] = (Array.isArray(req.steps) ? req.steps : []).flatMap((s) => {
    const text = String((s && typeof s === "object" ? (s as { text?: unknown }).text : s) ?? "").trim();
    return text ? [{ text, done: Boolean(s && typeof s === "object" && (s as { done?: unknown }).done) }] : [];
  });
  if (!Number.isInteger(step) || step < 0 || step >= steps.length) return { ok: false, reason: "Étape inconnue." };
  steps[step] = { ...steps[step], done };
  return { ok: true, steps, status: steps.every((s) => s.done) ? "faite" : "ouverte" };
}

/**
 * La règle de toutes les demandes faites à la direction (16/11/2026 : « c'est à moi de faire cette tâche, pas à un
 * agent ? » — Sergey lui faisait exporter de la Search Console une liste que Robert avait déjà) : jointe à la consigne
 * de chaque agent qui confie un geste à la direction.
 */
export const NO_LEGWORK =
  "- Ne fais jamais faire à la direction ce que l'équipe sait déjà ou peut lire elle-même (CRM, comptes publicitaires en lecture, Search Console, GA4, contrôles du site, rapports des agents) : pas d'étape « exportez », « relevez », « vérifiez combien… » ; écris la liste ou le chiffre DANS l'étape et commence par l'action. La direction ne fait que ce qu'aucun agent ne peut faire : modifier, écrire, publier, appeler, décider.";
