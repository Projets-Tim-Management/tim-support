import { describe, expect, it } from "vitest";
import { bookingModeOf, generateSlots, resolveRules } from "@/modules/marketing/lib/scheduling";
import { PORTAL_SECTIONS, validateRow } from "@/modules/marketing/lib/portal-sections";
import { generatePassword } from "@/modules/marketing/lib/credentials";
import { buildTimAccessEmail } from "@/modules/marketing/lib/emails";
import {
  NEVER_AUTO_VALIDATE,
  PHASE_DE_TEST_EMAILS,
  PHASE_DE_TEST_STEPS,
  SYSTEM_STEPS,
  canAutoValidate,
  computeEmailSchedule,
  stepDueDate,
  isAdminStep,
  isManualStep,
  isSessionBeforeStart,
  isStepDone,
  isStepPending,
  isSystemStep,
  mergeRunSteps,
  STEP_VALIDATION_EFFECT,
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
    expect(SYSTEM_STEPS["validation-admin"]).toBeUndefined();
  });
});

describe("qui coche quoi : constat système contre déclaration humaine", () => {
  it("une étape constatée par le système ne se coche pas à la main", () => {
    for (const key of ["compte-espace-client", "provisionnement", "signature", "dossier-demarrage"]) {
      expect(isSystemStep(key)).toBe(true);
      expect(isManualStep({ key })).toBe(false);
    }
  });

  it("les étapes réalisées par un humain gardent leur validation", () => {
    for (const key of ["validation-admin", "prise-en-main", "releve-j2", "bilan", "devis", "demande-contrat", "contrat", "mise-en-production"]) {
      expect(isSystemStep(key)).toBe(false);
      expect(isManualStep({ key })).toBe(true);
    }
  });

  it("la table de code prime sur le drapeau recopié dans un parcours ancien", () => {
    // Parcours lancé avant la règle : sa copie d'étape dit « manuelle ».
    expect(canAutoValidate({ key: "provisionnement", autoValidate: false })).toBe(true);
    // Et inversement : le Go/No-Go ne s'automatise pas, quoi que dise la copie.
    expect(canAutoValidate({ key: "validation-admin", autoValidate: true })).toBe(false);
  });

  it("chaque étape constatée dit ce qu'on doit faire pour qu'elle se coche", () => {
    for (const [key, def] of Object.entries(SYSTEM_STEPS)) {
      expect(def.trigger, key).toBeTruthy();
      // « demande » est le seul fait qu'on ne refait pas : il naît avec le parcours.
      if (key !== "demande") expect(def.action ?? def.wait, key).toBeTruthy();
    }
  });

  it("toute étape constatée l'est par un fait que le modèle déclare auto", () => {
    for (const key of Object.keys(SYSTEM_STEPS)) {
      const step = PHASE_DE_TEST_STEPS.find((s) => s.key === key);
      expect(step?.autoValidate, key).toBe(true);
    }
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

describe("mots de passe des accès TIM", () => {
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

describe("validation d'une ligne du dossier de démarrage", () => {
  const admin = PORTAL_SECTIONS.find((s) => s.key === "administrateur")!;

  it("une adresse mal formée est refusée, une bonne passe", () => {
    const base = { firstName: "Louise", lastName: "Martin" };
    expect(validateRow(admin, { ...base, email: "louise(at)souvet.fr" }).email).toBeTruthy();
    expect(validateRow(admin, { ...base, email: "louise@souvet.fr" }).email).toBeUndefined();
  });

  it("un téléphone est contrôlé comme dans le back-office", () => {
    const base = { firstName: "Louise", lastName: "Martin", email: "louise@souvet.fr" };
    expect(validateRow(admin, { ...base, phone: "06 12 34 56 78" }).phone).toBeUndefined();
    expect(validateRow(admin, { ...base, phone: "+33 6 12 34 56 78" }).phone).toBeUndefined();
    expect(validateRow(admin, { ...base, phone: "appelez-moi" }).phone).toBeTruthy();
    // Vide reste vide : le téléphone n'est pas obligatoire ici.
    expect(validateRow(admin, base).phone).toBeUndefined();
  });

  it("un champ vide obligatoire est signalé, un facultatif non", () => {
    const errors = validateRow(admin, {});
    expect(errors.firstName).toBeTruthy();
    expect(errors.email).toBeTruthy();
    expect(errors.phone).toBeUndefined();
  });
});

describe("l'étape « Dossier vérifié par TIM »", () => {
  const step = PHASE_DE_TEST_STEPS.find((s) => s.key === "validation-dossier")!;

  it("existe, appartient à TIM, et tombe entre le dossier et le provisionnement", () => {
    expect(step.actor).toBe("admin");
    const at = (key: string) => PHASE_DE_TEST_STEPS.find((s) => s.key === key)!.offsetDays!;
    expect(step.offsetDays!).toBeGreaterThan(at("dossier-demarrage"));
    expect(step.offsetDays!).toBeLessThan(at("provisionnement"));
  });

  it("garde son bouton : ce n'est pas un constat du système", () => {
    // `autoValidate` lui permet d'être cochée si l'état est posé depuis la fiche,
    // mais elle n'est PAS dans SYSTEM_STEPS : la valider reste un geste.
    expect(isSystemStep("validation-dossier")).toBe(false);
    expect(isManualStep(step)).toBe(false); // autoValidate → armable
    expect(canAutoValidate(step)).toBe(true);
  });

  it("annonce ce qu'elle déclenche : le verrouillage", () => {
    expect(STEP_VALIDATION_EFFECT["validation-dossier"]).toMatch(/verrouille/i);
  });
});

describe("un parcours en cours reçoit les étapes ajoutées au modèle", () => {
  // La VRAIE fonction, celle que le parcours appelle : une logique recopiée ici
  // resterait verte pendant que le code se casse à côté.

  it("insère la nouvelle étape À SA PLACE, sans toucher aux états acquis", () => {
    const out = mergeRunSteps(
      [{ key: "a" }, { key: "neuve" }, { key: "b" }],
      [
        { key: "a", state: "fait" },
        { key: "b", state: "auto" },
      ],
    )!;
    expect(out.map((s) => s.key)).toEqual(["a", "neuve", "b"]);
    expect(out.map((s) => s.state)).toEqual(["fait", "a-faire", "auto"]);
  });

  it("ne perd pas une étape retirée du modèle SI elle porte un avancement", () => {
    // Le modèle apporte une étape neuve : la fusion a donc bien lieu, et c'est
    // le seul cas où l'oubli serait possible. Sans cette étape neuve la fonction
    // renverrait `null` — « rien à réécrire » — et l'orpheline survivrait sans
    // rien prouver.
    const out = mergeRunSteps(
      [{ key: "a" }, { key: "neuve" }],
      [
        { key: "a", state: "fait" },
        { key: "ancienne", state: "fait" },
      ],
    )!;
    expect(out.map((s) => s.key)).toEqual(["a", "neuve", "ancienne"]);
  });

  it("mais retire une étape supprimée du modèle qui n'a jamais été touchée", () => {
    // Une case encore « à faire » n'est qu'une case vide : la garder n'encombre
    // que l'écran et réclame un clic pour rien.
    const out = mergeRunSteps(
      [{ key: "a" }],
      [
        { key: "a", state: "fait" },
        { key: "abandonnee", state: "a-faire" },
      ],
    )!;
    expect(out.map((s) => s.key)).toEqual(["a"]);
  });

  it("garde une étape retirée qui porte une NOTE, même jamais cochée", () => {
    // « à faire » + une note = quelqu'un a écrit quelque chose. La supprimer
    // effacerait un mot laissé pour l'équipe.
    const out = mergeRunSteps(
      [{ key: "a" }, { key: "neuve" }],
      [
        { key: "a", state: "fait" },
        { key: "abandonnee", state: "a-faire", note: "client injoignable" },
      ],
    )!;
    expect(out.map((s) => s.key)).toEqual(["a", "neuve", "abandonnee"]);
  });

  it("rafraîchit le DÉTAIL depuis le modèle, sans toucher à l'avancement", () => {
    // Le détail décrit le fonctionnement du moment ; figé, il envoie chercher
    // une case qui n'existe plus.
    const out = mergeRunSteps(
      [{ key: "a", detail: "le geste a déménagé" }],
      [{ key: "a", state: "fait", doneAt: "2026-08-01", detail: "ancien texte" }],
    )!;
    expect(out[0].detail).toBe("le geste a déménagé");
    expect(out[0].state).toBe("fait");
    expect(out[0].doneAt).toBe("2026-08-01");
  });

  it("ne renvoie RIEN à réécrire quand le parcours est déjà conforme", () => {
    // Sans ce court-circuit, chaque enregistrement réécrirait la liste entière.
    expect(
      mergeRunSteps([{ key: "a", detail: "d" }], [{ key: "a", state: "fait", detail: "d" }]),
    ).toBeNull();
  });
});

describe("le MODÈLE en base suit le code, pas seulement les parcours", () => {
  // Le piège du 24/08/2026 : la mise à niveau du modèle ne rafraîchissait que
  // le `detail` des étapes déjà présentes. Une étape supprimée du code y restait
  // pour toujours, une étape ajoutée n'y entrait jamais — et les parcours, qui
  // se réconcilient avec CE modèle, recopiaient fidèlement l'erreur. Le site
  // affichait donc une étape que plus aucune ligne de code ne pilotait.

  it("retire du modèle une étape que le code ne connaît plus", () => {
    const enBase = [
      { key: "demande", detail: "d" },
      { key: "validation-client", label: "Validation du client (démarrage du test)" },
    ];
    const out = mergeRunSteps([{ key: "demande", detail: "d" }], enBase)!;
    expect(out.map((s) => s.key)).toEqual(["demande"]);
  });

  it("insère dans le modèle une étape ajoutée au code, à sa place", () => {
    const out = mergeRunSteps(
      [{ key: "dossier-demarrage" }, { key: "validation-dossier" }, { key: "provisionnement" }],
      [{ key: "dossier-demarrage" }, { key: "provisionnement" }],
    )!;
    expect(out.map((s) => s.key)).toEqual([
      "dossier-demarrage",
      "validation-dossier",
      "provisionnement",
    ]);
  });

  it("le modèle livré avec le code ne contient plus l'étape supprimée", () => {
    expect(PHASE_DE_TEST_STEPS.some((s) => s.key === "validation-client")).toBe(false);
    expect(PHASE_DE_TEST_STEPS.some((s) => s.key === "validation-dossier")).toBe(true);
  });
});

describe("rappel « c'est demain », la veille du créneau à 17 h", () => {
  const mail = PHASE_DE_TEST_EMAILS.find((e) => e.key === "rappel-creneau")!;

  it("s'ancre sur le CRÉNEAU et non sur le démarrage du test", () => {
    // La distinction est tout l'objet de cet envoi : le client choisit son
    // heure, souvent une semaine avant le lundi de démarrage. Un rappel ancré
    // sur « debut » tomberait n'importe quand par rapport au rendez-vous.
    expect(mail.anchor).toBe("session");
    expect(mail.offsetDays).toBe(-1);
    expect(mail.sendHour).toBe("17:00");
    expect(mail.audience).toBe("client");
  });

  it("tombe la veille du créneau, quelle que soit la date de démarrage", () => {
    const due = stepDueDate(mail, "2026-09-07", "2026-10-05", "2026-08-31T14:00:00.000Z");
    expect(due?.slice(0, 10)).toBe("2026-08-30");
  });

  it("n'a AUCUNE date tant qu'aucun créneau n'est réservé", () => {
    // Pas de date = pas d'envoi. C'est ce qui évite un « c'est demain » adressé
    // à quelqu'un qui n'a jamais pris de rendez-vous.
    expect(stepDueDate(mail, "2026-09-07", "2026-10-05", null)).toBeNull();
    const [planned] = computeEmailSchedule([{ ...mail, overridden: false, scheduledAt: null }], "2026-09-07", "2026-10-05", null);
    expect(planned.scheduledAt).toBeNull();
  });

  it("est programmé à 17 h de Paris le jour où le créneau est posé", () => {
    const [planned] = computeEmailSchedule(
      [{ ...mail, overridden: false, scheduledAt: null }],
      "2026-09-07",
      "2026-10-05",
      "2026-08-31T09:30:00.000Z",
    );
    // Fin août, Paris est à UTC+2 : 17 h locales = 15 h UTC.
    expect(planned.scheduledAt).toBe("2026-08-30T15:00:00.000Z");
  });

  it("une date reprise à la main n'est pas écrasée par le calcul", () => {
    const [planned] = computeEmailSchedule(
      [{ ...mail, overridden: true, scheduledAt: "2026-08-29T10:00:00.000Z" }],
      "2026-09-07",
      "2026-10-05",
      "2026-08-31T09:30:00.000Z",
    );
    expect(planned.scheduledAt).toBe("2026-08-29T10:00:00.000Z");
  });
});

describe("e-mail « vos accès TIM » envoyé à une personne", () => {
  const base = { login: "jean@exemple.fr", password: "094220", clientName: "SOUVET VMB" };

  it("porte l'adresse du logiciel, quel que soit le profil", () => {
    const mail = buildTimAccessEmail({ ...base, profileKey: "admin" });
    expect(mail.text).toContain("https://app.tim-management.co/");
    expect(mail.html).toContain("https://app.tim-management.co/");
  });

  it("propose l'application mobile à ceux qui sont sur le terrain", () => {
    // Le pointage se saisit au pied du chantier, sur un téléphone.
    for (const profileKey of ["conducteur", "chefChantier", "chefEquipe", "compagnon"]) {
      const mail = buildTimAccessEmail({ ...base, profileKey });
      expect(mail.text, profileKey).toContain("play.google.com");
      expect(mail.text, profileKey).toContain("apps.apple.com");
      expect(mail.html, profileKey).toContain("Disponible sur Google Play");
    }
  });

  it("ne la propose PAS à l'administrateur : il paramètre, il ne pointe pas", () => {
    const mail = buildTimAccessEmail({ ...base, profileKey: "admin" });
    expect(mail.text).not.toContain("play.google.com");
    expect(mail.html).not.toContain("App Store");
  });

  it("contient l'identifiant et le mot de passe, dans les deux versions", () => {
    const mail = buildTimAccessEmail({ ...base, firstName: "Jean", profileKey: "compagnon" });
    for (const version of [mail.text, mail.html]) {
      expect(version).toContain("jean@exemple.fr");
      expect(version).toContain("094220");
    }
    expect(mail.text).toContain("Bonjour Jean,");
  });
});
