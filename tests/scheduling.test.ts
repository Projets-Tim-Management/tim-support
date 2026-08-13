import { describe, expect, it } from "vitest";
import { bookingModeOf, generateSlots, resolveRules } from "@/modules/marketing/lib/scheduling";
import { generatePassword, suggestUsername } from "@/modules/marketing/lib/credentials";
import {
  AUTO_TRIGGERS,
  NEVER_AUTO_VALIDATE,
  PHASE_DE_TEST_EMAILS,
  PHASE_DE_TEST_STEPS,
  computeEmailSchedule,
  isAdminStep,
  isSessionBeforeStart,
  isStepDone,
  isStepPending,
} from "@/modules/marketing/lib/journey";

const paris = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "short", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

describe("créneaux de prise en main", () => {
  const now = Date.parse("2026-08-07T09:00:00Z"); // vendredi

  it("respecte le délai minimum et les jours travaillés", () => {
    const slots = generateSlots({ rules: null, nowMs: now });
    expect(slots.length).toBeGreaterThan(0);
    // Aucun créneau avant 24 h.
    expect(Math.min(...slots.map((s) => Date.parse(s)))).toBeGreaterThanOrEqual(now + 24 * 3600_000);
    // Aucun samedi/dimanche (défaut lun→ven).
    for (const s of slots) {
      const d = new Date(s).toLocaleDateString("en-US", { timeZone: "Europe/Paris", weekday: "short" });
      expect(["Sat", "Sun"]).not.toContain(d);
    }
  });

  it("cale les heures sur PARIS, pas sur UTC (été = UTC+2)", () => {
    const slots = generateSlots({ rules: null, nowMs: now });
    expect(paris(slots[0])).toContain("09:00");
    expect(slots[0]).toContain("T07:00"); // 09:00 Paris = 07:00 UTC en août
  });

  it("cale aussi correctement en heure d'HIVER (UTC+1)", () => {
    const winter = Date.parse("2026-11-27T09:00:00Z"); // vendredi de novembre
    const slots = generateSlots({ rules: null, nowMs: winter });
    expect(paris(slots[0])).toContain("09:00");
    expect(slots[0]).toContain("T08:00"); // 09:00 Paris = 08:00 UTC en novembre
  });

  it("retire les créneaux déjà réservés", () => {
    const all = generateSlots({ rules: null, nowMs: now });
    const rest = generateSlots({ rules: null, nowMs: now, taken: [all[0], all[3]] });
    expect(rest).not.toContain(all[0]);
    expect(rest).not.toContain(all[3]);
    expect(rest.length).toBe(all.length - 2);
  });

  it("ne propose rien après le démarrage du test", () => {
    const until = "2026-08-17T00:00:00.000Z";
    const slots = generateSlots({ rules: null, nowMs: now, until });
    expect(Math.max(...slots.map((s) => Date.parse(s)))).toBeLessThanOrEqual(Date.parse(until));
  });

  it("ne produit rien si la fin précède le début", () => {
    expect(generateSlots({ rules: { startTime: "18:00", endTime: "09:00" }, nowMs: now })).toEqual([]);
  });

  it("espace les créneaux de durée + battement", () => {
    const slots = generateSlots({ rules: { durationMin: 45, bufferMin: 15 }, nowMs: now });
    const sameDay = slots.filter((s) => s.slice(0, 10) === slots[0].slice(0, 10));
    expect(Date.parse(sameDay[1]) - Date.parse(sameDay[0])).toBe(60 * 60_000);
  });

  it("complète les règles absentes par les défauts", () => {
    expect(resolveRules(null).durationMin).toBe(45);
    expect(resolveRules({ durationMin: 0 }).durationMin).toBe(45);
    expect(resolveRules({ weekdays: [] }).weekdays).toHaveLength(5);
  });
});

describe("mode de réservation", () => {
  it("propose les créneaux TIM par défaut", () => {
    expect(bookingModeOf(null).mode).toBe("creneaux");
    expect(bookingModeOf({ enabled: true }).mode).toBe("creneaux");
  });

  it("renvoie vers l'outil du partenaire en mode lien", () => {
    const r = bookingModeOf({ mode: "lien", bookingUrl: "https://calendly.com/tim/45min" });
    expect(r.mode).toBe("lien");
    expect(r.bookingUrl).toBe("https://calendly.com/tim/45min");
  });

  it("retombe sur « aucun » si le lien manque — pas de bouton mort", () => {
    expect(bookingModeOf({ mode: "lien" }).mode).toBe("aucun");
    expect(bookingModeOf({ mode: "lien", bookingUrl: "   " }).mode).toBe("aucun");
  });

  it("la désactivation prime sur le mode", () => {
    expect(bookingModeOf({ enabled: false, mode: "lien", bookingUrl: "https://x.fr" }).mode).toBe("aucun");
  });
});

describe("validation automatique des étapes", () => {
  const now = Date.parse("2026-08-11T10:00:00Z");
  const inTwoHours = new Date(now + 2 * 3600_000).toISOString();
  const twoHoursAgo = new Date(now - 2 * 3600_000).toISOString();

  it("une étape « auto » non échue n'est pas acquise", () => {
    const step = { state: "auto", autoAt: inTwoHours };
    expect(isStepDone(step, now)).toBe(false);
    expect(isStepPending(step, now)).toBe(true);
  });

  it("une étape « auto » échue compte comme faite, sans réenregistrement", () => {
    const step = { state: "auto", autoAt: twoHoursAgo };
    expect(isStepDone(step, now)).toBe(true);
    expect(isStepPending(step, now)).toBe(false);
  });

  it("une validation manuelle reste acquise quoi qu'il arrive", () => {
    expect(isStepDone({ state: "fait" }, now)).toBe(true);
    expect(isStepDone({ state: "fait", autoAt: inTwoHours }, now)).toBe(true);
  });

  it("une étape à faire, ou « auto » sans échéance, n'est jamais acquise", () => {
    expect(isStepDone({ state: "a-faire" }, now)).toBe(false);
    expect(isStepDone({ state: "auto" }, now)).toBe(false);
    expect(isStepDone({ state: "auto", autoAt: "pas-une-date" }, now)).toBe(false);
  });
});

describe("calendrier d'envoi modifiable", () => {
  const start = "2026-08-24T00:00:00.000Z";
  const end = "2026-09-21T00:00:00.000Z";
  // Typé explicitement : sans `scheduledAt` dans la forme d'entrée, TypeScript
  // infère un type sans ce champ et la sortie devient inspectable à moitié.
  type Mail = {
    key: string;
    anchor: string;
    offsetDays?: number;
    scheduledAt?: string | null;
    overridden?: boolean;
  };
  const mails = (): Mail[] => [
    { key: "prise-en-main", anchor: "debut", offsetDays: -7 },
    { key: "fin-proche", anchor: "fin", offsetDays: -5 },
    { key: "code", anchor: "aucun" },
  ];

  it("calcule les dates depuis le calendrier du parcours", () => {
    const out = computeEmailSchedule(mails(), start, end);
    expect(out[0].scheduledAt).toBe("2026-08-17T06:00:00.000Z"); // 08:00 Paris, en août
    expect(out[1].scheduledAt).toBe("2026-09-16T06:00:00.000Z");
    // Un envoi sur événement n'a pas de date.
    expect(out[2].scheduledAt).toBeNull();
  });

  it("ne touche jamais à une date fixée à la main", () => {
    const fixed = "2026-08-19T09:30:00.000Z";
    const out = computeEmailSchedule(
      [{ key: "prise-en-main", anchor: "debut", offsetDays: -7, scheduledAt: fixed, overridden: true }],
      start,
      end,
    );
    expect(out[0].scheduledAt).toBe(fixed);
  });

  it("garde une date vidée à la main (= ne pas envoyer)", () => {
    const out = computeEmailSchedule(
      [{ key: "fin-proche", anchor: "fin", offsetDays: -5, scheduledAt: null, overridden: true }],
      start,
      end,
    );
    expect(out[0].scheduledAt).toBeNull();
  });

  it("suit à nouveau le calendrier une fois la reprise annulée", () => {
    const out = computeEmailSchedule(
      [{ key: "fin-proche", anchor: "fin", offsetDays: -5, scheduledAt: null, overridden: false }],
      start,
      end,
    );
    expect(out[0].scheduledAt).toBe("2026-09-16T06:00:00.000Z");
  });

  it("décaler la fin du test déplace les envois non fixés, pas les autres", () => {
    const fixed = "2026-08-19T09:30:00.000Z";
    const later = "2026-10-05T00:00:00.000Z";
    const out = computeEmailSchedule(
      [
        { key: "prise-en-main", anchor: "debut", offsetDays: -7, scheduledAt: fixed, overridden: true },
        { key: "fin-proche", anchor: "fin", offsetDays: -5 },
      ],
      start,
      later,
    );
    expect(out[0].scheduledAt).toBe(fixed);
    expect(out[1].scheduledAt).toBe("2026-09-30T06:00:00.000Z");
  });
});

describe("étapes réservées à TIM", () => {
  it("identifie les étapes dont TIM est l'acteur", () => {
    expect(isAdminStep({ actor: "admin" })).toBe(true);
    expect(isAdminStep({ actor: "partenaire" })).toBe(false);
    expect(isAdminStep({ actor: "client" })).toBe(false);
    expect(isAdminStep({})).toBe(false);
  });

  it("le Go / No-Go ne se valide jamais tout seul", () => {
    expect(NEVER_AUTO_VALIDATE.has("validation-admin")).toBe(true);
    // Les autres étapes observables restent automatisables.
    expect(NEVER_AUTO_VALIDATE.has("demande")).toBe(false);
    expect(NEVER_AUTO_VALIDATE.has("dossier-demarrage")).toBe(false);
  });

  it("le modèle livré ne marque pas le Go / No-Go en auto-validation", () => {
    const step = PHASE_DE_TEST_STEPS.find((s) => s.key === "validation-admin");
    expect(step?.autoValidate).toBeFalsy();
    expect(step?.actor).toBe("admin");
  });

  it("aucun déclencheur automatique n'est déclaré pour le Go / No-Go", () => {
    expect(AUTO_TRIGGERS["validation-admin"]).toBeUndefined();
  });
});

describe("Go / No-Go : la règle s'applique aux parcours déjà armés", () => {
  const now = Date.parse("2026-08-12T12:00:00Z");
  const expired = new Date(now - 3600_000).toISOString();

  it("une étape Go/No-Go armée AVANT la règle ne s'acquiert pas", () => {
    const step = { key: "validation-admin", state: "auto", autoAt: expired };
    expect(isStepDone(step, now)).toBe(false);
    // Elle n'est pas non plus « en attente » : elle attend une décision humaine.
    expect(isStepPending(step, now)).toBe(false);
  });

  it("une validation manuelle du Go/No-Go reste acquise", () => {
    expect(isStepDone({ key: "validation-admin", state: "fait" }, now)).toBe(true);
  });

  it("les autres étapes ne sont pas affectées", () => {
    expect(isStepDone({ key: "demande", state: "auto", autoAt: expired }, now)).toBe(true);
  });
});

describe("prise en main : pré-formation avant le démarrage", () => {
  const start = "2026-08-31T00:00:00.000Z"; // lundi de démarrage

  it("accepte un créneau situé avant le démarrage", () => {
    expect(isSessionBeforeStart("2026-08-28T14:00:00.000Z", start)).toBe(true);
    expect(isSessionBeforeStart("2026-08-24T09:00:00.000Z", start)).toBe(true);
  });

  it("refuse le jour même du démarrage — la formation doit précéder l'usage", () => {
    expect(isSessionBeforeStart("2026-08-31T09:00:00.000Z", start)).toBe(false);
  });

  it("refuse un créneau pendant le test", () => {
    expect(isSessionBeforeStart("2026-09-03T09:00:00.000Z", start)).toBe(false);
  });

  it("ne bloque rien tant qu'une des deux dates manque", () => {
    expect(isSessionBeforeStart(null, start)).toBe(true);
    expect(isSessionBeforeStart("2026-09-03T09:00:00.000Z", null)).toBe(true);
    expect(isSessionBeforeStart("pas-une-date", start)).toBe(true);
  });

  it("les créneaux proposés au client s'arrêtent au démarrage", () => {
    const slots = generateSlots({
      rules: null,
      nowMs: Date.parse("2026-08-20T09:00:00Z"),
      until: start,
    });
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) expect(Date.parse(s)).toBeLessThan(Date.parse(start));
  });
});

describe("accès de test générés depuis le dossier", () => {
  it("propose prenom.nom, sans accent ni ponctuation", () => {
    expect(suggestUsername("Jean-Éric", "Dupré")).toBe("jeaneric.dupre");
    expect(suggestUsername("Léa", "O'Brien")).toBe("lea.obrien");
  });

  it("suffixe un identifiant déjà pris au lieu d'écraser", () => {
    const taken = new Set(["jean.martin"]);
    expect(suggestUsername("Jean", "Martin", taken)).toBe("jean.martin2");
    taken.add("jean.martin2");
    expect(suggestUsername("Jean", "Martin", taken)).toBe("jean.martin3");
  });

  it("retombe sur un identifiant utilisable si le nom manque", () => {
    expect(suggestUsername(null, null)).toBe("utilisateur");
  });

  it("produit un code à 6 chiffres, sans aucune lettre", () => {
    for (let i = 0; i < 200; i += 1) {
      const pwd = generatePassword();
      expect(pwd).toMatch(/^\d{6}$/);
      expect(pwd).not.toMatch(/[a-z]/i);
      expect(pwd).toHaveLength(6);
    }
  });

  it("conserve les zéros de tête : c'est une suite de caractères, pas un nombre", () => {
    const many = Array.from({ length: 3000 }, () => generatePassword());
    expect(many.some((p) => p.startsWith("0"))).toBe(true);
    expect(many.every((p) => p.length === 6)).toBe(true);
  });

  it("ne répète pas le même code sur un tirage courant", () => {
    const set = new Set(Array.from({ length: 200 }, () => generatePassword()));
    expect(set.size).toBeGreaterThan(190);
  });
});

describe("heure d'envoi des e-mails", () => {
  const start = "2026-08-31T00:00:00.000Z"; // lundi de démarrage
  // Typé explicitement : sans `scheduledAt` en entrée, TypeScript infère un
  // type sans ce champ et la sortie n'est inspectable qu'à moitié.
  type Mail = {
    key: string;
    anchor: string;
    offsetDays?: number;
    sendHour?: string;
    scheduledAt?: string | null;
  };

  it("place l'envoi à 8 h de Paris, pas à minuit", () => {
    const [mail] = computeEmailSchedule(
      [{ key: "acces-prets", anchor: "debut", offsetDays: 0, sendHour: "08:00" }] as Mail[],
      start,
      null,
    );
    // 08:00 Paris = 06:00 UTC en heure d'été.
    expect(mail.scheduledAt).toBe("2026-08-31T06:00:00.000Z");
  });

  it("tient compte du changement d'heure", () => {
    const winter = "2026-11-30T00:00:00.000Z"; // lundi de novembre
    const [mail] = computeEmailSchedule(
      [{ key: "acces-prets", anchor: "debut", offsetDays: 0, sendHour: "08:00" }] as Mail[],
      winter,
      null,
    );
    // 08:00 Paris = 07:00 UTC en heure d'hiver.
    expect(mail.scheduledAt).toBe("2026-11-30T07:00:00.000Z");
  });

  it("applique 8 h par défaut quand l'heure n'est pas précisée", () => {
    const [mail] = computeEmailSchedule(
      [{ key: "x", anchor: "debut", offsetDays: 0 }] as Mail[],
      start,
      null,
    );
    expect(mail.scheduledAt).toBe("2026-08-31T06:00:00.000Z");
  });

  it("les accès partent bien le jour du démarrage", () => {
    const def = PHASE_DE_TEST_EMAILS.find((e) => e.key === "acces-prets");
    expect(def?.anchor).toBe("debut");
    expect(def?.offsetDays).toBe(0);
    expect(def?.sendHour).toBe("08:00");
  });
});
