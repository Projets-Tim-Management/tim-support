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
    .map((s) => String(s ?? "").replace(/\s+/g, " ").trim())
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
