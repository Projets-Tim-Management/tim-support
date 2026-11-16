/**
 * « COMMENT NOUS AVEZ-VOUS CONNUS ? » (16/11/2026 : « sans que ça soit gênant, un seul clic ») — demandé APRÈS ce
 * que le prospect est venu chercher : sur l'écran « C'est confirmé » d'un rendez-vous, et en bas de l'e-mail
 * d'accusé de réception d'une demande. La réponse va sur la fiche du prospect, à côté de la source calculée (UTM,
 * clics) : elle dit ce que les traces ne voient pas — le bouche-à-oreille, l'IA qui a cité TIM avant qu'on tape
 * l'adresse. Sans dépendance : lisible côté serveur comme dans le navigateur.
 */
export const HEARD_FROM = [
  { value: "google", label: "Google" },
  { value: "ia", label: "ChatGPT / une IA" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "facebook-instagram", label: "Facebook / Instagram" },
  { value: "youtube", label: "YouTube" },
  { value: "recommandation", label: "Recommandation" },
  { value: "salon", label: "Salon / événement" },
  { value: "autre", label: "Autre" },
] as const;
export type HeardFrom = (typeof HEARD_FROM)[number]["value"];
export const isHeardFrom = (v: unknown): v is HeardFrom => HEARD_FROM.some((h) => h.value === v);
export const HEARD_FROM_QUESTION = "Comment nous avez-vous connus ?";
export const HEARD_FROM_PATH = "/rdv/source";
