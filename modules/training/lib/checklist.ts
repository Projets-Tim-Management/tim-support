/**
 * Checklist de préparation d'une journée de formation — règles pures.
 *
 * Deux sortes de points, selon la règle « validation = geste réel » :
 *  - les CONSTATS : ce que le logiciel sait déjà (date fixée, formateur
 *    désigné, mots de passe générés, convocation partie…). Ils se cochent
 *    seuls ; aucune case à cocher qui mentirait.
 *  - les GESTES faits hors du logiciel (réserver la salle, tester le lien,
 *    vérifier le wifi) : ceux-là se cochent à la main — c'est la seule façon
 *    de le savoir. On peut en ajouter.
 *
 * Testé seul : tests/training-checklist.test.ts.
 */

import type { PlanContact, PlanDay, PlanSession } from "@/modules/training/lib/plan";

export type ChecklistItem = {
  key: string;
  label: string;
  /** Constat (coché par le logiciel) ou geste (coché à la main). */
  kind: "constat" | "geste";
  done: boolean;
  /** Ce qui manque, ou qui l'a coché et quand. */
  hint?: string;
  /** Point ajouté à la main pour cette journée (supprimable). */
  custom?: boolean;
};

/** Ce qui est rangé sur la journée (`training-days.checklist`). */
export type StoredChecklist = {
  done?: Record<string, { at: string; by?: string | null }>;
  custom?: { key: string; label: string }[];
};

type EmailRow = { key: string; sentAt?: string | null; cancelledAt?: string | null };

/** Les gestes proposés d'office, selon le mode de la journée. */
export const DEFAULT_GESTURES: Record<"sur-place" | "distance", { key: string; label: string }[]> = {
  "sur-place": [
    { key: "salle", label: "Salle réservée chez le client" },
    { key: "ecran", label: "Écran ou vidéoprojecteur disponible" },
    { key: "wifi", label: "Connexion internet (wifi) vérifiée" },
    { key: "donnees", label: "Données de base saisies (chantiers, équipes) pour la démonstration" },
    { key: "appli", label: "Application installée par les participants (confirmé par le client)" },
    { key: "kit", label: "Kit imprimé (programme, présence, identifiants, mémos)" },
  ],
  distance: [
    { key: "lien-teste", label: "Lien de visio testé" },
    { key: "partage", label: "Partage d'écran vérifié" },
    { key: "donnees", label: "Données de base saisies (chantiers, équipes) pour la démonstration" },
    { key: "appli", label: "Application installée par les participants (confirmé par le client)" },
  ],
};

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export function dayChecklist(args: {
  day: PlanDay & { trainerName?: string | null; emails?: EmailRow[] | null; checklist?: StoredChecklist | null };
  sessions: PlanSession[];
  contacts: (PlanContact & { timPassword?: string | null })[];
}): ChecklistItem[] {
  const { day, contacts } = args;
  const sessions = args.sessions.filter((s) => s.status !== "annulee");
  const mode = day.mode === "distance" ? "distance" : "sur-place";
  const byId = new Map(contacts.map((c) => [String(c.id), c]));
  const peopleOf = (pred: (s: PlanSession) => boolean) => {
    const ids = new Set(sessions.filter(pred).flatMap((s) => (s.participants ?? []).map(String)));
    return [...ids].map((id) => byId.get(id)).filter(Boolean) as (PlanContact & { timPassword?: string | null })[];
  };
  const everyone = peopleOf(() => true);
  const noPassword = everyone.filter((c) => !c.timPassword);
  const noEmail = everyone.filter((c) => !c.email);
  const emptySessions = sessions.filter((s) => !(s.participants ?? []).length);
  const rows = day.emails ?? [];
  const mailState = (key: string) => {
    const r = rows.find((e) => e.key === key);
    if (r?.cancelledAt) return { done: true, hint: "annulé (vu autrement)" };
    if (r?.sentAt) return { done: true, hint: "parti" };
    return { done: false, hint: "pas encore parti" };
  };

  const constats: ChecklistItem[] = [
    { key: "date", label: "Date fixée", kind: "constat", done: Boolean(day.date) },
    mode === "distance"
      ? { key: "lieu", label: "Lien de visio renseigné", kind: "constat", done: Boolean(day.link?.trim()) }
      : { key: "lieu", label: "Adresse renseignée", kind: "constat", done: Boolean(day.location?.trim()) },
    {
      key: "formateur",
      label: "Formateur désigné",
      kind: "constat",
      done: day.trainer != null,
      hint: day.trainerName ?? undefined,
    },
    {
      key: "participants",
      label: "Participants désignés",
      kind: "constat",
      done: sessions.length > 0 && emptySessions.length === 0,
      hint: emptySessions.length ? plural(emptySessions.length, "créneau sans participant", "créneaux sans participant") : undefined,
    },
    {
      key: "mots-de-passe",
      label: "Mots de passe générés pour les participants",
      kind: "constat",
      done: everyone.length > 0 && noPassword.length === 0,
      hint: noPassword.length ? `manquant : ${noPassword.map((c) => [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email).join(", ")}` : undefined,
    },
    {
      key: "emails",
      label: "Adresse e-mail pour chaque participant",
      kind: "constat",
      done: everyone.length > 0 && noEmail.length === 0,
      hint: noEmail.length ? plural(noEmail.length, "personne non convocable", "personnes non convocables") : undefined,
    },
    { key: "convocation", label: "Convocations envoyées", kind: "constat", ...mailState("convocation") },
    { key: "recap-referent", label: "Organisation envoyée au référent", kind: "constat", ...mailState("recap-referent") },
  ];
  const stored = day.checklist ?? {};
  const doneMap = stored.done ?? {};
  const gestures = [
    ...DEFAULT_GESTURES[mode],
    ...(stored.custom ?? []).map((c) => ({ ...c, custom: true })),
  ];
  const manual: ChecklistItem[] = gestures.map((g) => {
    const d = doneMap[g.key];
    return {
      key: g.key,
      label: g.label,
      kind: "geste",
      done: Boolean(d),
      hint: d ? `coché${d.by ? ` par ${d.by}` : ""}` : undefined,
      custom: "custom" in g ? Boolean(g.custom) : undefined,
    };
  });
  return [...constats, ...manual];
}

/** « 7/12 » — pour l'encart de la fiche et l'en-tête de la journée. */
export const checklistProgress = (items: ChecklistItem[]) => ({
  done: items.filter((i) => i.done).length,
  total: items.length,
});

/** Clé d'un point ajouté à la main, unique dans la journée. */
export const customKey = (label: string, taken: string[]): string => {
  const base =
    "perso-" +
    (label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "point");
  let key = base;
  for (let n = 2; taken.includes(key); n++) key = `${base}-${n}`;
  return key;
};
