import { adminUrl, internalNotice } from "@/core/lib/email-template";

import type { MonthValidation } from "./billing-validation";

/**
 * Le rappel du rapprochement : « il reste des factures à signer ».
 *
 * La validation vit sur un écran qu'on n'a pas de raison d'ouvrir tous les
 * jours. Sans rappel, un mois passe, la facture part, et personne n'a vérifié
 * que la fiche et l'abonnement disaient la même chose. Deux moments, pas plus :
 *   - le 1er du mois : ce qu'il y a à préparer ce mois-ci ;
 *   - deux jours avant une facture encore non signée : le dernier appel.
 * Un rappel quotidien apprendrait à ne plus être lu.
 *
 * Pur : la décision et le message se testent sans base ni horloge.
 */

export type ReminderItem = {
  clientId: number | string;
  client: string;
  validation: MonthValidation;
};

const PARIS = "Europe/Paris";

/** Jour civil à Paris, `2026-10-02`. */
export const parisDay = (d: Date | string | number): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: PARIS, dateStyle: "short" }).format(new Date(d));

const daysUntil = (dayIso: string, today: string): number =>
  Math.round((Date.parse(dayIso.slice(0, 10)) - Date.parse(today)) / 86_400_000);

/** Encore à signer : à valider, à revalider, ou bloqué par un écart. */
export const needsAction = (v: MonthValidation): boolean =>
  v.state === "a-valider" || v.state === "a-revalider" || v.state === "ecart";

/**
 * Faut-il rappeler CETTE fiche aujourd'hui ?
 *
 * Le 1er du mois, tout ce qui attend. Sinon, seulement à J-2 de sa facture :
 * le jour où il est encore temps de corriger un des deux côtés.
 */
export const reminderDue = (v: MonthValidation, today: string): "mois" | "dernier-appel" | null => {
  if (!needsAction(v)) return null;
  if (today.endsWith("-01")) return "mois";
  if (v.invoiceDate && daysUntil(v.invoiceDate, today) === 2) return "dernier-appel";
  return null;
};

const frDate = (iso: string) =>
  new Date(iso.slice(0, 10)).toLocaleDateString("fr-FR", { timeZone: "UTC", day: "numeric", month: "long" });

const etat = (v: MonthValidation): string =>
  v.state === "ecart"
    ? `écart à corriger : ${v.blockers.map((b) => b.label).join(" · ")}`
    : v.state === "a-revalider"
      ? "la fiche a changé depuis la signature"
      : "à signer";

/**
 * Le message : une ligne par fiche, la date de facture, ce qui attend, et le
 * bouton vers le filtre « À valider ». Objet : le compte, et l'urgence quand
 * c'est un dernier appel.
 */
export function buildValidationReminder(
  items: ReminderItem[],
  kind: "mois" | "dernier-appel",
  today: string,
): { subject: string; html: string; text: string } | null {
  if (items.length === 0) return null;
  const n = items.length;
  const s = n > 1 ? "s" : "";
  const subject =
    kind === "dernier-appel"
      ? `Dernier appel : ${n} facture${s} à valider avant le ${frDate(items[0].validation.invoiceDate ?? today)}`
      : `${n} facture${s} à valider ce mois-ci`;

  const rows: [string, string][] = items.map((i) => [
    i.client,
    `${i.validation.invoiceDate ? `facture le ${frDate(i.validation.invoiceDate)} — ` : ""}${etat(i.validation)}`,
  ]);
  const url = adminUrl("/facturation?f=a-valider");

  return {
    subject,
    html: internalNotice({
      kicker: "Rapprochement",
      heading: kind === "dernier-appel" ? "Dernier appel avant facture" : "Les factures du mois à valider",
      rows,
      message:
        kind === "dernier-appel"
          ? "Ces factures partent dans deux jours. Vérifiez que la fiche et l'abonnement Pennylane disent la même chose, corrigez le côté qui a oublié, puis signez."
          : "Pour chaque fiche, vérifiez que les licences de la fiche et celles de l'abonnement Pennylane sont alignées, puis signez le mois. Une licence ajoutée ou retirée se modifie le même jour des deux côtés.",
      cta: { label: "Ouvrir le rapprochement", url },
    }),
    text: [
      kind === "dernier-appel" ? "DERNIER APPEL AVANT FACTURE" : "LES FACTURES DU MOIS À VALIDER",
      "",
      ...rows.map(([c, r]) => `• ${c} — ${r}`),
      "",
      `Ouvrir le rapprochement : ${url}`,
    ].join("\n"),
  };
}
