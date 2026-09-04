/**
 * Séquences de relance après une affaire perdue — la mécanique.
 *
 * Une opportunité passée en « Perdue » ouvre la séquence ACTIVE dont la liste de
 * motifs contient le sien. Les messages, leur ordre et leurs délais vivent dans
 * la collection `sequences`, en base : créer une séquence ou changer un rythme
 * est une décision commerciale, elle ne doit pas demander de déploiement.
 *
 * Ce module ne porte donc que ce qui reste vrai quel que soit le contenu :
 * l'ordonnancement selon les besoins cochés, et le calcul des dates.
 */

/**
 * Les deux façons d'habiller un message.
 *
 * « Sobre » n'est pas un marketing au rabais : c'est un registre différent. Une
 * relance qui demande si le projet existe encore doit ressembler à un e-mail
 * qu'on a écrit soi-même, sinon elle se lit comme une campagne de plus.
 */
export const MESSAGE_STYLES = [
  { label: "Marketing (avec le design)", value: "marketing" },
  { label: "Sobre (comme un e-mail écrit à la main)", value: "standard" },
] as const;

export type MessageStyle = (typeof MESSAGE_STYLES)[number]["value"];

/** Unités de délai proposées entre deux messages. */
export const DELAY_UNITS = [
  { label: "jours", value: "jours" },
  { label: "semaines", value: "semaines" },
  { label: "mois", value: "mois" },
] as const;

export type DelayUnit = (typeof DELAY_UNITS)[number]["value"];

/**
 * Besoins que le formulaire du site propose.
 *
 * Recopiés ici plutôt qu'importés du module `forms` : ce sont les valeurs
 * stockées dans les soumissions déjà enregistrées, et elles doivent survivre à
 * une modification du formulaire. Un besoin retiré du formulaire reste un
 * critère de tri valable pour les prospects qui l'avaient coché.
 */
export const BESOIN_OPTIONS = [
  { label: "Planning", value: "planning" },
  { label: "Pointage", value: "pointage" },
  { label: "Gestion des véhicules", value: "vehicules" },
  { label: "Gestion des chantiers", value: "chantiers" },
  { label: "Gestion des documents RH", value: "documents-rh" },
] as const;

/** Un message tel qu'il est stocké dans une séquence. */
export interface SequenceMessage {
  key?: string | null;
  delayValue?: number | null;
  delayUnit?: string | null;
  besoin?: string | null;
}

export interface SequenceDoc {
  key?: string | null;
  label?: string | null;
  active?: boolean | null;
  lossReasons?: string[] | null;
  messages?: SequenceMessage[] | null;
}

/**
 * Séquence à ouvrir pour un motif de perte donné.
 *
 * La première séquence active qui revendique ce motif l'emporte. Un motif ne
 * devrait figurer que dans une seule — c'est dit dans l'écran, et deux
 * séquences qui se le disputent produiraient un choix arbitraire.
 */
export function sequenceForLossReason(
  sequences: SequenceDoc[],
  reason?: string | null,
): SequenceDoc | null {
  if (!reason) return null;
  return (
    sequences.find(
      (s) => s.active !== false && (s.lossReasons ?? []).includes(reason) && (s.messages ?? []).length > 0,
    ) ?? null
  );
}

/**
 * Messages réordonnés selon les besoins cochés.
 *
 * Ceux qui répondent à une demande explicite passent devant, dans l'ordre où la
 * personne les a cochés ; les autres suivent dans l'ordre du modèle. Les
 * messages sans besoin déclaré ne remontent jamais — un bilan de clôture n'ouvre
 * pas une séquence.
 */
export function orderedMessages(
  messages: SequenceMessage[],
  besoins: string[] = [],
): SequenceMessage[] {
  const usable = messages.filter((m) => m.key);
  const asked: SequenceMessage[] = [];
  for (const besoin of besoins) {
    for (const m of usable) {
      if (m.besoin === besoin && !asked.includes(m)) asked.push(m);
    }
  }
  return [...asked, ...usable.filter((m) => !asked.includes(m))];
}

/**
 * Ajoute des mois en restant dans le mois visé.
 *
 * `setMonth` fait déborder le 31 janvier sur le 3 mars ; on ramène au dernier
 * jour du mois. Sans ça, une perte enregistrée un 31 verrait ses envois glisser
 * d'un mois supplémentaire à chaque étape.
 */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d;
}

/** Applique un délai exprimé dans l'une des trois unités. */
export function addDelay(from: Date, value: number, unit: string): Date {
  const n = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (unit === "mois") return addMonths(from, n);
  const days = unit === "semaines" ? n * 7 : n;
  return new Date(from.getTime() + days * 86_400_000);
}

export interface PlannedMessage {
  key: string;
  /** Date d'envoi prévue, en ISO. */
  scheduledAt: string;
}

/**
 * Le calendrier complet, posé à l'enrôlement.
 *
 * Chaque délai se compte depuis le message PRÉCÉDENT — et le premier depuis la
 * perte. C'est ce qui permet des rythmes irréguliers : deux semaines, puis un
 * mois, puis deux, sans avoir à calculer des dates absolues.
 *
 * Tout est daté d'avance plutôt que recalculé à chaque envoi : on peut ainsi
 * montrer ce qui partira et quand, et décaler un message sans toucher au reste.
 */
export function planMessages(
  messages: SequenceMessage[],
  besoins: string[] = [],
  from: Date = new Date(),
): PlannedMessage[] {
  let cursor = from;
  return orderedMessages(messages, besoins).map((m) => {
    cursor = addDelay(cursor, m.delayValue ?? 0, m.delayUnit ?? "mois");
    return { key: m.key as string, scheduledAt: cursor.toISOString() };
  });
}
