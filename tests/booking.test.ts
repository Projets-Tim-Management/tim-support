import { describe, expect, it } from "vitest";

import { calendarLinks, confirmationMail, hostMail, icsFile, whereFr, type MailView } from "@/modules/booking/lib/emails";
import { canChange, checkInput, formQuestions, taskContent, toBookingType } from "@/modules/booking/lib/engine";
import { prefillFromQuery, signSubmission, verifySubmissionRef } from "@/modules/booking/lib/prefill";
import { dueReminders } from "@/modules/booking/lib/reminders";
import { computeSlots, openSlots, pickHost, type HostLoad } from "@/modules/booking/lib/slots";

/**
 * Les rendez-vous en ligne (comme Calendly) : les créneaux, le choix de qui reçoit, la saisie, les e-mails, les
 * rappels, le déplacement et l'annulation, et la règle : un problème se note, une réservation ne se perd pas.
 */

// Lundi 16 novembre 2026, 8 h à Paris (7 h UTC).
const NOW = Date.parse("2026-11-16T07:00:00Z");
const WEEK = { "1": [{ start: "09:00", end: "12:00" }], "2": [{ start: "09:00", end: "10:00" }] };
const host = (id: string, busy: HostLoad["busy"] = [], sameType: HostLoad["sameType"] = []): HostLoad => ({ id, busy, sameType });

describe("les créneaux d'un type de rendez-vous", () => {
  const rules = { hours: WEEK, durationMin: 30, incrementMin: 30, minNoticeHours: 0, horizonDays: 1 };

  it("un départ toutes les N minutes dans les horaires, en heure de Paris, sans déborder de la plage", () => {
    const slots = computeSlots(rules, [host("1")], NOW).map((s) => s.at);
    expect(slots.slice(0, 3)).toEqual(["2026-11-16T08:00:00.000Z", "2026-11-16T08:30:00.000Z", "2026-11-16T09:00:00.000Z"]);
    expect(slots).toContain("2026-11-16T10:30:00.000Z"); // 11 h 30 – 12 h
    expect(slots).not.toContain("2026-11-16T11:00:00.000Z"); // 12 h : hors plage
    expect(slots.filter((s) => s.startsWith("2026-11-17"))).toEqual(["2026-11-17T08:00:00.000Z", "2026-11-17T08:30:00.000Z"]);
  });

  it("le délai minimum, les pauses avant et après autour d'une occupation", () => {
    expect(computeSlots({ ...rules, minNoticeHours: 2 }, [host("1")], NOW)[0].at).toBe("2026-11-16T09:00:00.000Z");
    const busy = [{ start: "2026-11-16T09:00:00Z", end: "2026-11-16T09:30:00Z" }]; // 10 h – 10 h 30
    const free = computeSlots({ ...rules, bufferAfterMin: 15, bufferBeforeMin: 15, horizonDays: 0 }, [host("1", busy)], NOW).map((s) => s.at);
    expect(free).toEqual(["2026-11-16T08:00:00.000Z", "2026-11-16T10:00:00.000Z", "2026-11-16T10:30:00.000Z"]);
  });

  it("plusieurs membres : un créneau est proposé dès que l'un est libre, avec qui l'est ; le maximum par jour compte", () => {
    const a = host("a", [{ start: "2026-11-16T08:00:00Z", end: "2026-11-16T09:00:00Z" }]);
    const b = host("b", [], [{ start: "2026-11-16T10:00:00Z" }]);
    const slots = computeSlots({ ...rules, horizonDays: 0, maxPerDay: 1 }, [a, b], NOW);
    expect(slots.find((s) => s.at === "2026-11-16T08:00:00.000Z")).toBeUndefined(); // a occupé, b déjà à son maximum
    expect(slots.find((s) => s.at === "2026-11-16T09:00:00.000Z")?.hosts).toEqual(["a"]);
  });

  it("qui reçoit : le premier libre dans l'ordre, ou celui qui en a le moins", () => {
    const loads = [host("a", [], [{ start: "2026-11-10T09:00:00Z" }, { start: "2026-11-12T09:00:00Z" }]), host("b", [], [{ start: "2026-11-11T09:00:00Z" }])];
    expect(pickHost(["b", "a"], ["a", "b"], loads, "2026-11-16T09:00:00Z", "disponibilite")).toBe("a");
    expect(pickHost(["a", "b"], ["a", "b"], loads, "2026-11-16T09:00:00Z", "equilibre")).toBe("b");
    expect(pickHost([], ["a"], loads, "2026-11-16T09:00:00Z", "equilibre")).toBeNull();
  });
});

const TYPE = toBookingType({
  id: 3,
  slug: "demo",
  name: "Démo de TIM",
  durationMin: 30,
  locations: ["meet", "telephone"],
  hosts: [{ id: 6, name: "Charlie Piancatelli", email: "c@tim.test", partner: 6 }],
  phoneRequired: true,
  questions: [{ key: "effectif", label: "Effectif", type: "choix", options: "1-5\n6-20\n21-50", required: true, crmField: "collaborateurs" }],
  reminders: [{ minutesBefore: 1440 }, { minutesBefore: 60 }],
  changeUntilHours: 2,
});

describe("la saisie du prospect", () => {
  const ok = { location: "meet", firstName: " Jean ", lastName: "Dupont", email: "Jean@Dupont-BTP.fr", phone: "06 12 34 56 78", company: "Dupont BTP", answers: { effectif: "6-20" } };
  it("propre : espaces, e-mail en minuscules, téléphone normalisé, réponses gardées", () => {
    const r = checkInput(TYPE, ok);
    expect(r).toMatchObject({ ok: true, person: { firstName: "Jean", email: "jean@dupont-btp.fr", company: "Dupont BTP" }, answers: { effectif: "6-20" } });
  });
  it("refuse ce qui manque, en disant quel champ", () => {
    expect(checkInput(TYPE, { ...ok, phone: "" })).toMatchObject({ ok: false, field: "phone" });
    expect(checkInput(TYPE, { ...ok, email: "pas-un-email" })).toMatchObject({ ok: false, field: "email" });
    expect(checkInput(TYPE, { ...ok, answers: {} })).toMatchObject({ ok: false, field: "q-effectif" });
    expect(checkInput(TYPE, { ...ok, answers: { effectif: "200" } })).toMatchObject({ ok: false, field: "q-effectif" });
  });
  it("visio ou téléphone : le prospect choisit ; au téléphone, son numéro est obligatoire", () => {
    expect(checkInput(TYPE, { ...ok, location: "" })).toMatchObject({ ok: false, field: "location" });
    expect(checkInput({ ...TYPE, phoneRequired: false }, { ...ok, location: "telephone", phone: "" })).toMatchObject({ ok: false, field: "phone" });
    expect(checkInput({ ...TYPE, phoneRequired: false }, { ...ok, location: "meet", phone: "" })).toMatchObject({ ok: true, location: "meet" });
  });
  it("venu du formulaire : rien à ressaisir, la demande complète — sa réponse est gardée même hors de la liste", () => {
    const r = checkInput(TYPE, { location: "telephone", answers: {} }, { person: { firstName: "Jean", lastName: "Dupont", email: "j@d.fr", phone: "0612345678", company: "Dupont BTP" }, answers: { effectif: "6 à 20 salariés" } });
    expect(r).toMatchObject({ ok: true, person: { firstName: "Jean", company: "Dupont BTP" }, answers: { effectif: "6 à 20 salariés" }, location: "telephone" });
  });
});

describe("la tâche du CRM porte les problèmes en tête", () => {
  const b = { firstName: "Jean", lastName: "Dupont", email: "j@d.fr", phone: "+33612345678", company: "Dupont BTP", start: "2026-11-17T09:00:00Z", answers: { effectif: "6-20" } };
  it("sans problème : la réunion, l'heure, qui reçoit, les réponses", () => {
    const t = taskContent(TYPE, b, "Charlie", []);
    expect(t.title).toBe("Démo en visio — Dupont BTP (Jean Dupont)");
    // Au téléphone : une prise de besoin, pas une démo.
    expect(taskContent(TYPE, { ...b, locationKind: "telephone" }, "Charlie", []).title).toBe("Appel découverte — Dupont BTP (Jean Dupont)");
    expect(t.highPriority).toBe(false);
    expect(t.content).toContain("Effectif : 6-20");
  });
  it("avec un agenda illisible : « ⚠️ À RAPPELER », en priorité haute — le rendez-vous reste enregistré", () => {
    const t = taskContent(TYPE, b, "Charlie", [{ kind: "agenda-evenement", message: "x", at: "" }]);
    expect(t.title.startsWith("⚠️")).toBe(true);
    expect(t.highPriority).toBe(true);
    expect(t.content.split("\n")[0]).toMatch(/^⚠️ À RAPPELER/);
  });
});

describe("déplacer ou annuler soi-même", () => {
  const b = { status: "confirme", start: "2026-11-17T09:00:00Z" };
  it("permis jusqu'à N heures avant, et seulement si le type le permet", () => {
    expect(canChange(TYPE, b, "deplacer", new Date("2026-11-16T09:00:00Z"))).toBeNull();
    expect(canChange(TYPE, b, "annuler", new Date("2026-11-17T08:00:00Z"))).toMatch(/trop tard/);
    expect(canChange({ ...TYPE, allowCancel: false }, b, "annuler", new Date(NOW))).toMatch(/ne s'annule pas/);
    expect(canChange(TYPE, { ...b, status: "annule" }, "deplacer", new Date(NOW))).toMatch(/plus actif/);
  });
});

describe("les rappels", () => {
  const start = "2026-11-17T09:00:00Z";
  it("chacun une fois, à son heure ; pas un « à demain » envoyé en retard", () => {
    expect(dueReminders(start, [1440, 60], [], new Date("2026-11-16T09:05:00Z"))).toEqual([1440]);
    expect(dueReminders(start, [1440, 60], [1440], new Date("2026-11-16T09:05:00Z"))).toEqual([]);
    expect(dueReminders(start, [1440, 60], [], new Date("2026-11-16T10:00:00Z"))).toEqual([]);
    expect(dueReminders(start, [1440, 60], [1440], new Date("2026-11-17T08:01:00Z"))).toEqual([60]);
  });
});

describe("les e-mails et l'agenda du prospect", () => {
  const v: MailView = { typeName: "Démo de TIM", durationMin: 30, start: "2026-11-17T09:00:00.000Z", end: "2026-11-17T09:30:00.000Z", locationKind: "meet", locationDetail: null, meetingUrl: "https://meet.google.com/abc", hostName: "Charlie", firstName: "Jean", lastName: "Dupont", email: "j@d.fr", phone: null, company: "Dupont BTP", answers: [], manageToken: "tok_abcdefghijklmnopqr", allowChange: true };
  it("la confirmation : l'heure de Paris, le lien de visio, « ajouter à mon agenda », le lien pour déplacer", () => {
    const m = confirmationMail(v);
    expect(m.subject).toContain("mardi 17 novembre à 10:00");
    expect(m.html).toContain("https://meet.google.com/abc");
    expect(m.html).toContain("calendar.google.com");
    expect(m.text).toContain("/rdv/gerer/tok_abcdefghijklmnopqr");
  });
  it("le fichier .ics et les liens d'agenda", () => {
    const ics = icsFile(v, whereFr(v), { method: "REQUEST", sequence: 0, organizerEmail: "c@tim.test" });
    expect(ics).toContain("DTSTART:20261117T090000Z");
    expect(ics).toContain("UID:rdv-tok_abcdefghijklmnopqr@tim-management.co");
    expect(calendarLinks(v, "x").google).toContain("dates=20261117T090000Z/20261117T093000Z");
  });
  it("l'avis à l'équipe : « ⚠️ » et « à rappeler » quand il reste un problème", () => {
    const m = hostMail(v, "nouveau", { problems: ["agenda non vérifié"], clientUrl: null, bookingUrl: "https://x" });
    expect(m.subject.startsWith("⚠️")).toBe(true);
    expect(m.text).toContain("À vérifier");
  });
});

describe("le rendez-vous qui suit une demande", () => {
  it("une référence signée : la bonne passe, une autre demande ou une signature trafiquée non", () => {
    const ref = signSubmission(42);
    expect(verifySubmissionRef(ref)).toBe("42");
    expect(verifySubmissionRef(ref.replace(/^42/, "43"))).toBeNull();
    expect(verifySubmissionRef("42")).toBeNull();
  });
  it("le pré-remplissage par l'adresse : les champs connus et les questions du type seulement", () => {
    expect(prefillFromQuery({ prenom: "Jean", email: "j@d.fr", effectif: "6-20", autre: "x" }, ["effectif"])).toEqual({ firstName: "Jean", lastName: undefined, email: "j@d.fr", phone: undefined, company: undefined, answers: { effectif: "6-20" } });
  });
});

describe("les questions reprises du formulaire de contact", () => {
  const form = {
    fields: [
      { name: "company_name", type: "text", label: "Société", required: true },
      { name: "collaborateurs", type: "select", label: "Combien de collaborateurs ?", required: true, options: [{ value: "1-10", label: "1 - 10" }, { value: "11-25", label: "11 - 25" }] },
      { name: "fonction", type: "select", label: "Fonction", required: false, options: [{ value: "dirigeant", label: "Dirigeant" }] },
      { name: "besoins", type: "multiselect", label: "Besoins", required: true, options: [{ value: "planning", label: "Planning" }, { value: "pointage", label: "Pointage" }] },
      { name: "nom", type: "text", label: "Nom", required: true },
      { name: "email", type: "email", label: "E-mail", required: true },
    ],
  };
  const T = { ...TYPE, fromForm: true, questions: formQuestions(form) };
  const base = { firstName: "Jean", lastName: "Dupont", email: "j@d.fr", phone: "0612345678", company: "Dupont BTP" };

  it("mêmes questions, mêmes tranches, mêmes choix — sans l'identité, demandée à part", () => {
    expect(T.questions.map((q) => [q.key, q.type, q.required])).toEqual([
      ["collaborateurs", "choix", true],
      ["fonction", "choix", false],
      ["besoins", "multi", true],
    ]);
    expect(T.questions[0].options[1]).toEqual({ value: "11-25", label: "11 - 25" });
    expect(T.questions[0].crmField).toBe("collaborateurs");
  });
  it("en visio, tout est obligatoire ; au téléphone, comme le formulaire", () => {
    const answers = { collaborateurs: "11-25", besoins: "planning,pointage" };
    expect(checkInput(T, { ...base, location: "meet", answers })).toMatchObject({ ok: false, field: "q-fonction" });
    expect(checkInput(T, { ...base, location: "telephone", answers })).toMatchObject({ ok: true, answers: { collaborateurs: "11-25", besoins: "planning,pointage" } });
    expect(checkInput(T, { ...base, location: "telephone", answers: { ...answers, besoins: "planning,inconnu" } })).toMatchObject({ ok: false, field: "q-besoins" });
  });
  it("venu du formulaire : rien n'est redemandé, même en visio (sa demande fait foi)", () => {
    const r = checkInput(T, { location: "meet", answers: {} }, { person: { firstName: "Jean", email: "j@d.fr", phone: "0612345678", company: "Dupont BTP" }, answers: { collaborateurs: "11-25", besoins: "planning" } });
    expect(r).toMatchObject({ ok: true, person: { firstName: "Jean", lastName: "—" }, answers: { collaborateurs: "11-25", besoins: "planning" } });
  });
});

describe("le formulaire simplifié (le bouton « Prendre rendez-vous » de la vitrine)", () => {
  const S = { ...TYPE, simpleForm: true, phoneRequired: false, questions: [] };
  it("un nom, un e-mail : prénom et nom séparés, la fiche prend le nom de la personne", () => {
    expect(checkInput(S, { location: "meet", name: "Jean Dupont", email: "j@d.fr" })).toMatchObject({ ok: true, person: { firstName: "Jean", lastName: "Dupont", company: "Jean Dupont", phone: null } });
    expect(checkInput(S, { location: "meet", name: "Jean", email: "j@d.fr" })).toMatchObject({ ok: true, person: { firstName: "Jean", lastName: "—", company: "Jean" } });
  });
  it("au téléphone, le numéro est demandé ; sans nom, le champ « nom » est signalé", () => {
    expect(checkInput(S, { location: "telephone", name: "Jean Dupont", email: "j@d.fr" })).toMatchObject({ ok: false, field: "phone" });
    expect(checkInput(S, { location: "meet", email: "j@d.fr" })).toMatchObject({ ok: false, field: "name" });
  });
});

describe("des créneaux qui ressemblent à un agenda demandé", () => {
  const rules = { hours: { "1": [{ start: "09:00", end: "18:00" }], "2": [{ start: "09:00", end: "18:00" }], "3": [{ start: "09:00", end: "18:00" }] }, durationMin: 30, incrementMin: 30, minNoticeHours: 0, horizonDays: 7 };
  it("rien le jour même : le premier créneau est demain", () => {
    const slots = computeSlots({ ...rules, noSameDay: true }, [host("1")], NOW);
    expect(slots[0].at.startsWith("2026-11-17")).toBe(true);
  });
  it("1 à 5 horaires par jour, toujours les mêmes, différents d'un type à l'autre", () => {
    const a = computeSlots({ ...rules, limitedSlots: true, seed: "demo" }, [host("1")], NOW);
    const perDay = new Map<string, number>();
    for (const s of a) perDay.set(s.at.slice(0, 10), (perDay.get(s.at.slice(0, 10)) ?? 0) + 1);
    expect([...perDay.values()].every((n) => n >= 1 && n <= 5)).toBe(true);
    expect(computeSlots({ ...rules, limitedSlots: true, seed: "demo" }, [host("1")], NOW)).toEqual(a);
    expect(computeSlots({ ...rules, limitedSlots: true, seed: "autre" }, [host("1")], NOW)).not.toEqual(a);
  });
  it("un créneau pris disparaît sans être remplacé", () => {
    const all = computeSlots({ ...rules, limitedSlots: true, seed: "demo" }, [host("1")], NOW);
    const taken = all[0];
    const after = computeSlots({ ...rules, limitedSlots: true, seed: "demo" }, [host("1", [{ start: taken.at, end: new Date(Date.parse(taken.at) + 30 * 60_000).toISOString() }])], NOW);
    expect(after.map((s) => s.at)).toEqual(all.slice(1).map((s) => s.at));
    expect(openSlots([], "x").size).toBe(0);
  });
  it("jamais deux horaires proposés à la suite : au moins la durée plus la pause entre deux", () => {
    const slots = computeSlots({ ...rules, limitedSlots: true, seed: "demo", bufferBeforeMin: 30, bufferAfterMin: 30 }, [host("1")], NOW);
    const byDay = new Map<string, number[]>();
    for (const s of slots) byDay.set(s.at.slice(0, 10), [...(byDay.get(s.at.slice(0, 10)) ?? []), Date.parse(s.at)]);
    for (const times of byDay.values()) for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(60 * 60_000);
  });
});

describe("« Comment nous avez-vous connus ? » en un clic", () => {
  it("l'accusé de réception porte les boutons, chacun avec la demande signée et sa réponse ; le rendez-vous remplace Calendly", async () => {
    const { leadConfirmationEmail } = await import("@/modules/forms/lib/lead-emails");
    const ref = signSubmission(42);
    const m = leadConfirmationEmail({ nom: "Jean Dupont", email: "j@d.fr", besoinValues: [], sourceRef: ref, bookingUrl: "https://support.test/rdv/demo?demande=x" } as never);
    expect(m.html).toContain(`/rdv/source?d=${encodeURIComponent(ref)}&amp;r=ia`);
    expect(m.html).toContain("ChatGPT / une IA");
    expect(m.html).toContain("https://support.test/rdv/demo?demande=x");
    expect(m.html).not.toContain("calendly.com");
  });
  it("sans référence, rien n'est ajouté (un e-mail d'avant)", async () => {
    const { leadConfirmationEmail } = await import("@/modules/forms/lib/lead-emails");
    expect(leadConfirmationEmail({ nom: "Jean", email: "j@d.fr", besoinValues: [] } as never).html).not.toContain("/rdv/source");
  });
});

describe("ce que les agents lisent des rendez-vous et des sources déclarées", () => {
  it("les rendez-vous, la part des demandes qui réservent, et les sources déclarées croisées avec la source calculée", async () => {
    const { buildInsights } = await import("@/modules/booking/lib/insights");
    const r = buildInsights({
      now: new Date("2026-11-16T12:00:00Z"),
      days: 30,
      bookings: [
        { start: "2026-11-18T09:00:00Z", status: "confirme", locationKind: "meet", type: { name: "Démo" }, submission: { id: 1, createdAt: "2026-11-16T09:00:00Z" }, company: "A" },
        { start: "2026-11-10T09:00:00Z", status: "absent", locationKind: "telephone", type: { name: "Démo" }, submission: null, company: "B", hasProblem: true },
      ],
      submissions: [{ id: 1 }, { id: 2 }],
      clients: [{ heardFrom: "ia", source: "seo" }, { heardFrom: "ia", source: "direct" }, { heardFrom: "recommandation", source: "direct" }],
    });
    expect(r.rendezVous).toMatchObject({ pris: 2, demoEnVisio: 1, decouverteParTelephone: 1, aVenir: 1, pasVenus: 1, avecUnProblemeATraiter: 1 });
    expect(r.demandesDuFormulaireQuiReservent).toEqual({ demandes: 2, avecRendezVous: 1, tauxPct: 50 });
    expect(r.delaiDemandeRendezVousJours).toBe(2);
    expect(r.sourcesDeclarees.repartition[0]).toEqual({ source: "ChatGPT / une IA", nombre: 2, pct: 66.7 });
    expect(r.prochainsRendezVous[0]).toMatchObject({ formule: "Démo en visio", societe: "A" });
  });
});

describe("relecture du 16/11/2026", () => {
  it("une revue réussie qui dit « je n'ai pas pu lire X » n'est pas un échec ; « <titre> : je n'ai pas pu … » l'est", async () => {
    const { isFailedReview } = await import("@/modules/ai-team/lib/stale");
    expect(isFailedReview("🎯 Objectifs de la semaine : je n'ai pas pu préparer vos objectifs (plafond).")).toBe(true);
    expect(isFailedReview("🎯 Objectifs de la semaine\n\nLa page /tarifs monte. Je n'ai pas pu lire la Search Console de /contact.")).toBe(false);
  });
  it("un lead sans réponse depuis plus d'une heure ouvrée devient un geste urgent, sur sa fiche ou sa demande", async () => {
    const { urgentLeadActions } = await import("@/modules/ai-team/lib/pipeline-agent");
    const a = urgentLeadActions([
      { id: "7", client: null, name: "Dupont BTP", hoursWaiting: 2.34, answered: false, firstResponseHours: null },
      { id: "8", client: "12", name: "Martin TP", hoursWaiting: 0.5, answered: false, firstResponseHours: null },
      { id: "9", client: "13", name: "Kern", hoursWaiting: 3, answered: true, firstResponseHours: 1 },
    ]);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ client: "demande-7", priority: "A" });
    expect(a[0].title).toMatch(/^🔴 Urgent — Répondre à Dupont BTP .* 2\.3 h ouvrées$/);
  });
});

describe("un problème se dit tel qu'il est", () => {
  it("côté CRM : la tâche manquante n'est pas une fiche manquante", async () => {
    const { problemText } = await import("@/modules/booking/lib/engine");
    expect(problemText({ kind: "crm", message: "Tâche non créée : refus" })).toMatch(/tâche « Réunion » non créée/);
    expect(problemText({ kind: "crm", message: "Erreur" })).toBe("fiche du prospect non créée");
  });
});
