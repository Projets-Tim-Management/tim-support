/**
 * Plan de formation — règles PURES : ordre chronologique, étapes constatées,
 * points d'attention, formules prêtes à l'emploi.
 *
 * Partagé par l'éditeur du plan (admin) et l'encart de la fiche. Aucun import
 * serveur : testé seul (tests/training-plan.test.ts).
 */

import { PROFILS, profileRank, type ProfilKey } from "@/modules/partner/lib/pricing";

export type PlanDay = {
  id: number | string;
  date?: string | null;
  mode?: string | null;
  location?: string | null;
  link?: string | null;
  trainerType?: string | null;
  trainer?: number | string | null;
};

export type PlanSession = {
  id: number | string;
  day: number | string;
  startTime?: string | null;
  endTime?: string | null;
  profiles?: string[] | null;
  participants?: (number | string)[] | null;
  /** Présents, cochés à l'émargement. */
  attendance?: (number | string)[] | null;
  accessDelivery?: string | null;
  status?: string | null;
};

export type PlanContact = {
  id: number | string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  licenceProfile?: string | null;
};

const PROFILE_LABEL: Record<string, string> = Object.fromEntries(PROFILS.map((p) => [p.key, p.label]));
export const profileLabel = (key?: string | null): string => (key && PROFILE_LABEL[key]) || "Sans profil";

export const contactName = (c: PlanContact): string =>
  [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || c.email || "Contact sans nom";

const same = (a: unknown, b: unknown) => String(a) === String(b);
const isActive = (s: PlanSession) => s.status !== "annulee";

/** Jour civil d'une date stockée (« 2026-10-14T12:00:00.000Z » → « 2026-10-14 »). */
export const dayKey = (iso?: string | null): string | null => (iso ? iso.slice(0, 10) : null);

/** Journées datées d'abord, dans l'ordre ; les non datées ensuite, dans l'ordre de création. */
export function sortDays<T extends PlanDay>(days: T[]): T[] {
  return [...days].sort((a, b) => {
    const da = dayKey(a.date);
    const db = dayKey(b.date);
    if (da && db && da !== db) return da < db ? -1 : 1;
    if (da && !db) return -1;
    if (!da && db) return 1;
    return Number(a.id) - Number(b.id);
  });
}

/** Séances d'une journée, par heure de début (sans heure : à la fin). */
export function sessionsOfDay<T extends PlanSession>(sessions: T[], dayId: number | string): T[] {
  return sessions
    .filter((s) => same(s.day, dayId))
    .sort((a, b) => {
      if (a.startTime && b.startTime && a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1;
      if (a.startTime && !b.startTime) return -1;
      if (!a.startTime && b.startTime) return 1;
      return Number(a.id) - Number(b.id);
    });
}

// ─── Étapes de cadrage (constats, jamais cochées à la main) ─────────────────

export type PlanStep = { key: string; label: string; done: boolean; hint: string };

export function planSteps(days: PlanDay[], sessions: PlanSession[]): PlanStep[] {
  const active = sessions.filter(isActive);
  const usedDays = days.filter((d) => active.some((s) => same(s.day, d.id)));
  return [
    {
      key: "plan-formation",
      label: "Plan défini",
      done: active.length > 0,
      hint: "Au moins une séance prévue.",
    },
    {
      key: "participants",
      label: "Participants désignés",
      done: active.length > 0 && active.every((s) => (s.participants ?? []).length > 0),
      hint: "Chaque séance a au moins un participant.",
    },
    {
      key: "dates",
      label: "Dates fixées",
      done: usedDays.length > 0 && usedDays.every((d) => Boolean(d.date)),
      hint: "Toutes les journées qui ont une séance sont datées.",
    },
    {
      key: "realisees",
      label: "Séances réalisées",
      done: allSessionsDone(sessions),
      hint: "Chaque séance non annulée est émargée.",
    },
  ];
}

/**
 * Toutes les séances non annulées sont réalisées (émargées) — et il y en a au
 * moins une. C'est ce qui termine la formation.
 */
export const allSessionsDone = (sessions: PlanSession[]): boolean => {
  const active = sessions.filter(isActive);
  return active.length > 0 && active.every((s) => s.status === "realisee");
};

/** Jour civil de Paris d'un instant (« 2026-10-02 »). */
export const parisDay = (ms: number): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);

/**
 * Une séance s'émarge à partir de SON jour (jour civil de Paris), jamais avant :
 * l'émargement constate une présence, il ne l'annonce pas.
 */
export const canSignOn = (dayDate: string | null | undefined, nowMs: number): boolean =>
  Boolean(dayDate) && (dayKey(dayDate) as string) <= parisDay(nowMs);

// ─── Points d'attention ─────────────────────────────────────────────────────

export type PlanWarning = {
  level: "alerte" | "info";
  text: string;
  dayId?: number | string;
  sessionId?: number | string;
};

const minRank = (s: PlanSession) => Math.min(...(s.profiles ?? []).map((p) => profileRank(p)), PROFILS.length);

/**
 * Ce qui mérite un regard avant d'envoyer les convocations. Jamais bloquant :
 * TIM connaît le client mieux que la règle.
 *
 * L'ordre se juge sur les séances DATÉES seulement (journée datée) : entre deux
 * journées sans date, il n'y a pas encore d'ordre à contester.
 */
export function planWarnings(days: PlanDay[], sessions: PlanSession[], contacts: PlanContact[]): PlanWarning[] {
  const out: PlanWarning[] = [];
  const contactById = new Map(contacts.map((c) => [String(c.id), c]));

  for (const day of sortDays(days)) {
    const list = sessionsOfDay(sessions, day.id).filter(isActive);
    list.forEach((s, i) => {
      if (s.startTime && s.endTime && s.endTime <= s.startTime) {
        out.push({ level: "alerte", sessionId: s.id, dayId: day.id, text: "La séance finit avant de commencer." });
      }
      const prev = list[i - 1];
      if (prev?.endTime && s.startTime && s.startTime < prev.endTime) {
        out.push({
          level: "alerte",
          sessionId: s.id,
          dayId: day.id,
          text: `Chevauche la séance de ${prev.startTime ?? "?"}–${prev.endTime}.`,
        });
      }
      if (!(s.participants ?? []).length) {
        out.push({ level: "alerte", sessionId: s.id, dayId: day.id, text: "Aucun participant." });
      }
    });
    if (list.length && day.mode === "distance" && !day.link) {
      out.push({ level: "info", dayId: day.id, text: "Journée à distance sans lien de visio." });
    }
    if (list.length && day.mode === "sur-place" && !day.location) {
      out.push({ level: "info", dayId: day.id, text: "Journée sur place sans adresse." });
    }
  }

  // Ordre des profils : l'admin paramètre l'outil, les autres l'utilisent.
  const chrono = sortDays(days.filter((d) => d.date)).flatMap((d) => sessionsOfDay(sessions, d.id).filter(isActive));
  chrono.forEach((s, i) => {
    const earlier = chrono.slice(0, i).find((e) => minRank(e) > minRank(s));
    if (!earlier) return;
    const who = PROFILS[minRank(s)]?.label ?? "Ce groupe";
    const before = PROFILS[minRank(earlier)]?.label ?? "un autre groupe";
    out.push({
      level: "info",
      sessionId: s.id,
      text: `${who} formé après ${before.toLowerCase()} : d'habitude, on forme d'abord ceux qui paramètrent.`,
    });
  });

  // Une même personne attendue à deux séances qui se chevauchent le même jour.
  for (const day of days) {
    const list = sessionsOfDay(sessions, day.id).filter((s) => isActive(s) && s.startTime && s.endTime);
    list.forEach((a, i) => {
      for (const b of list.slice(i + 1)) {
        if (!(a.startTime! < b.endTime! && b.startTime! < a.endTime!)) continue;
        const both = (a.participants ?? []).filter((p) => (b.participants ?? []).some((q) => same(p, q)));
        for (const pid of both) {
          const c = contactById.get(String(pid));
          out.push({
            level: "alerte",
            sessionId: b.id,
            dayId: day.id,
            text: `${c ? contactName(c) : "Un participant"} figure dans deux séances en même temps.`,
          });
        }
      }
    });
  }

  // Sans adresse e-mail, la convocation ne pourra pas partir.
  const seen = new Set<string>();
  for (const s of sessions.filter(isActive)) {
    for (const pid of s.participants ?? []) {
      const c = contactById.get(String(pid));
      if (c && !c.email && !seen.has(String(pid))) {
        seen.add(String(pid));
        out.push({ level: "info", sessionId: s.id, text: `${contactName(c)} n'a pas d'adresse e-mail : pas de convocation possible.` });
      }
    }
  }
  return out;
}

// ─── Formules prêtes à l'emploi ─────────────────────────────────────────────

export type Formula = { key: string; label: string; detail: string; groups: ProfilKey[][] };

export const FORMULAS: Formula[] = [
  { key: "admin", label: "Admin seul", detail: "Une séance pour l'administrateur.", groups: [["admin"]] },
  {
    key: "admin-cdt-puis-cdc",
    label: "Admin + conducteurs, puis chefs de chantier",
    detail: "Le matin l'admin et les conducteurs ensemble, l'après-midi les chefs de chantier.",
    groups: [["admin", "conducteur"], ["chefChantier"]],
  },
  {
    key: "par-profil",
    label: "Un groupe par profil",
    detail: "Chaque profil a sa séance, de l'admin aux compagnons — deux séances par journée.",
    groups: PROFILS.map((p) => [p.key]),
  },
];

/** Créneaux d'une journée type : matin, puis après-midi. */
export const DAY_SLOTS = [
  { startTime: "09:00", endTime: "12:00" },
  { startTime: "14:00", endTime: "17:00" },
] as const;

export type DraftSession = { profiles: ProfilKey[]; participants: (number | string)[]; startTime: string; endTime: string };

/**
 * Plan proposé par une formule, d'après les contacts du client.
 *
 * Un groupe sans aucun contact de ses profils est écarté (pas de séance pour
 * des chefs d'équipe que l'entreprise n'a pas). Si le client n'a encore aucun
 * contact profilé, on garde la formule telle quelle : les participants se
 * choisiront après. Deux séances par journée, matin puis après-midi.
 */
export function draftFromFormula(formula: Formula, contacts: PlanContact[]): DraftSession[][] {
  const withProfile = contacts.filter((c) => c.licenceProfile);
  const members = (profiles: ProfilKey[]) =>
    withProfile.filter((c) => profiles.includes(c.licenceProfile as ProfilKey)).map((c) => c.id);
  const kept = withProfile.length ? formula.groups.filter((g) => members(g).length > 0) : formula.groups;
  const days: DraftSession[][] = [];
  kept.forEach((profiles, i) => {
    if (i % DAY_SLOTS.length === 0) days.push([]);
    days[days.length - 1].push({ profiles, participants: members(profiles), ...DAY_SLOTS[i % DAY_SLOTS.length] });
  });
  return days;
}

/** Contacts dont le profil est formé dans la séance (les « attendus naturels »). */
export const matchingContacts = (contacts: PlanContact[], profiles: string[]): PlanContact[] =>
  contacts
    .filter((c) => c.licenceProfile && profiles.includes(c.licenceProfile))
    .sort((a, b) => profileRank(a.licenceProfile) - profileRank(b.licenceProfile) || contactName(a).localeCompare(contactName(b)));

// ─── Groupe d'une séance, déduit de ses participants ────────────────────────

/**
 * Les profils formés dans une séance = ceux de ses participants, dans l'ordre
 * hiérarchique. On choisit des PERSONNES ; le groupe en découle. Sans
 * participant profilé, on garde les profils d'avant (une séance en forme au
 * moins un — champ obligatoire).
 */
export function profilesOf(
  participants: (number | string)[],
  contacts: PlanContact[],
  fallback: string[] = [],
): string[] {
  const ids = new Set(participants.map(String));
  const found = new Set(
    contacts.filter((c) => ids.has(String(c.id)) && c.licenceProfile).map((c) => c.licenceProfile as string),
  );
  const ordered = PROFILS.map((p) => p.key).filter((k) => found.has(k));
  return ordered.length ? ordered : fallback;
}

/** « Admin + Conducteur de travaux » — le nom d'usage d'une séance. */
export const sessionTitle = (profiles?: string[] | null): string =>
  (profiles ?? []).length ? (profiles ?? []).map((p) => profileLabel(p)).join(" + ") : "Groupe à composer";

/** Séances non annulées, dans l'ordre du déroulé (journées puis horaires). */
export function chronoSessions<T extends PlanSession>(days: PlanDay[], sessions: T[]): { session: T; dayIndex: number }[] {
  return sortDays(days).flatMap((d, i) =>
    sessionsOfDay(sessions, d.id)
      .filter(isActive)
      .map((session) => ({ session, dayIndex: i + 1 })),
  );
}
