import { describe, expect, it } from "vitest";

import {
  computedSchedule,
  decideTrainingEmail,
  scheduleDayEmails,
  type DayEmailRow,
  type DueFacts,
} from "@/modules/training/lib/email-schedule";

const DAY = "2026-10-20T12:00:00.000Z"; // mardi 20 octobre
const facts = (extra: Partial<DueFacts> = {}): DueFacts => ({
  dayDate: DAY,
  trainingClosed: false,
  attendanceTaken: false,
  recipients: ["a@x.fr", "b@x.fr"],
  ...extra,
});

describe("dates des envois", () => {
  it("journée lointaine : J−7 à 9 h, la veille à 8 h et 17 h, le lendemain à 10 h (heure de Paris)", () => {
    const s = computedSchedule(DAY, new Date("2026-10-01T10:00:00Z"));
    expect(s.convocation).toBe("2026-10-13T07:00:00.000Z");
    expect(s["recap-referent"]).toBe("2026-10-13T07:00:00.000Z");
    expect(s["brief-formateur"]).toBe("2026-10-19T06:00:00.000Z");
    expect(s["rappel-veille"]).toBe("2026-10-19T15:00:00.000Z");
    expect(s["apres-formation"]).toBe("2026-10-21T08:00:00.000Z");
  });

  it("journée dans 3 jours : la convocation se resserre, rien ne tombe dans le passé", () => {
    const s = computedSchedule(DAY, new Date("2026-10-17T10:00:00Z"));
    // −7 sur 3 jours disponibles → −3.
    expect(s.convocation).toBe("2026-10-17T07:00:00.000Z");
    expect(s["rappel-veille"]).toBe("2026-10-19T15:00:00.000Z");
  });

  it("journée demain : convocation et brief la veille, après-formation inchangé", () => {
    const s = computedSchedule(DAY, new Date("2026-10-19T10:00:00Z"));
    expect(s.convocation).toBe("2026-10-19T07:00:00.000Z");
    expect(s["apres-formation"]).toBe("2026-10-21T08:00:00.000Z");
  });

  it("garde les envois partis et les dates réglées à la main ; journée sans date = rien de daté", () => {
    const rows: DayEmailRow[] = [
      { key: "convocation", sentAt: "2026-10-10T07:00:00.000Z", scheduledAt: "2026-10-10T07:00:00.000Z" },
      { key: "rappel-veille", overridden: true, scheduledAt: null },
    ];
    const next = scheduleDayEmails(DAY, rows, new Date("2026-10-01T10:00:00Z"));
    expect(next.map((r) => r.key)).toEqual(["convocation", "recap-referent", "brief-formateur", "rappel-veille", "apres-formation"]);
    expect(next[0].scheduledAt).toBe("2026-10-10T07:00:00.000Z");
    expect(next[3].scheduledAt).toBeNull();
    expect(scheduleDayEmails(null, [], new Date()).every((r) => r.scheduledAt === null)).toBe(true);
  });
});

describe("faut-il envoyer ?", () => {
  const row = (key: string, extra: Partial<DayEmailRow> = {}): DayEmailRow => ({
    key,
    scheduledAt: computedSchedule(DAY, new Date("2026-10-01T10:00:00Z"))[key],
    ...extra,
  });
  const at = (iso: string) => Date.parse(iso);

  it("à l'heure dite : envoi à tous les participants", () => {
    expect(decideTrainingEmail(row("convocation"), facts(), at("2026-10-13T07:05:00Z"))).toEqual({
      reason: "envoyer",
      to: ["a@x.fr", "b@x.fr"],
    });
  });

  it("avant l'heure : à venir", () => {
    expect(decideTrainingEmail(row("convocation"), facts(), at("2026-10-12T07:00:00Z")).reason).toBe("a-venir");
  });

  it("une personne ajoutée après la convocation la reçoit à son tour, pas les autres", () => {
    const sent = row("convocation", {
      sentAt: "2026-10-13T07:00:00.000Z",
      recipients: [{ email: "A@x.fr", sentAt: "2026-10-13T07:00:00.000Z" }],
    });
    expect(decideTrainingEmail(sent, facts(), at("2026-10-15T09:00:00Z"))).toEqual({ reason: "envoyer", to: ["b@x.fr"] });
  });

  it("le jour J, plus de convocation", () => {
    expect(decideTrainingEmail(row("convocation"), facts(), at("2026-10-20T06:00:00Z")).reason).toBe("journee-passee");
  });

  it("rappel inutile quand la convocation vient de partir (formation fixée la veille)", () => {
    const late = computedSchedule(DAY, new Date("2026-10-19T10:00:00Z"));
    const decision = decideTrainingEmail(
      { key: "rappel-veille", scheduledAt: late["rappel-veille"] },
      facts({ convocationAt: late.convocation }),
      at("2026-10-19T15:10:00Z"),
    );
    expect(decision.reason).toBe("convocation-recente");
  });

  it("rappel envoyé quand la convocation date d'une semaine", () => {
    const decision = decideTrainingEmail(row("rappel-veille"), facts({ convocationAt: "2026-10-13T07:00:00.000Z" }), at("2026-10-19T15:10:00Z"));
    expect(decision.reason).toBe("envoyer");
  });

  it("après-formation : attend l'émargement, puis part aux présents", () => {
    const r = row("apres-formation");
    expect(decideTrainingEmail(r, facts(), at("2026-10-21T08:30:00Z")).reason).toBe("attente-emargement");
    expect(decideTrainingEmail(r, facts({ attendanceTaken: true, recipients: ["a@x.fr"] }), at("2026-10-21T08:30:00Z"))).toEqual({
      reason: "envoyer",
      to: ["a@x.fr"],
    });
  });

  it("formation close, date retirée, journée sans date, personne à qui écrire", () => {
    const t = at("2026-10-13T07:05:00Z");
    expect(decideTrainingEmail(row("convocation"), facts({ trainingClosed: true }), t).reason).toBe("formation-close");
    expect(decideTrainingEmail(row("convocation", { scheduledAt: null }), facts(), t).reason).toBe("pas-de-date");
    expect(decideTrainingEmail(row("convocation"), facts({ dayDate: null }), t).reason).toBe("journee-sans-date");
    expect(decideTrainingEmail(row("convocation"), facts({ recipients: [] }), t).reason).toBe("aucun-destinataire");
  });

  it("le référent ne reçoit son message qu'une fois, même s'il change", () => {
    const sent = row("recap-referent", { sentAt: "2026-10-13T07:00:00.000Z", recipients: [{ email: "old@x.fr" }] });
    expect(decideTrainingEmail(sent, facts({ recipients: ["new@x.fr"] }), at("2026-10-14T07:00:00Z")).reason).toBe("deja-envoye");
  });
});

describe("textes des e-mails", async () => {
  const { TRAINING_EMAIL_BUILDERS } = await import("@/modules/training/lib/emails");
  const ctx = {
    clientName: "SOUVET VMB",
    dayDate: "2026-10-20T12:00:00.000Z",
    mode: "sur-place" as const,
    location: "8 Rue de la République 69001 Lyon",
    locationDetails: "Bâtiment B, salle Rhône",
    trainerName: "Charlie Piancatelli",
    firstName: "Thomas",
    slots: [
      {
        start: "09:00",
        end: "10:30",
        title: "Conducteur de travaux",
        participants: [{ name: "Thomas P.", hasEmail: true }, { name: "Marc S.", hasEmail: false }],
        accessDelivery: "formateur" as const,
      },
    ],
    clientId: 12,
  };

  it("convocation : salutation, date, créneau, lieu et complément, remise des accès", () => {
    const m = TRAINING_EMAIL_BUILDERS.convocation(ctx);
    expect(m.subject).toBe("Votre formation TIM le mardi 20 octobre");
    expect(m.text).toContain("Bonjour Thomas,");
    expect(m.text).toContain("9 h – 10 h 30 — Conducteur de travaux");
    expect(m.text).toContain("Lieu : 8 Rue de la République 69001 Lyon");
    expect(m.text).toContain("Bâtiment B, salle Rhône");
    expect(m.text).toContain("remis au début de la séance");
    // Un participant ne voit pas la liste des autres.
    expect(m.text).not.toContain("Marc S.");
  });

  it("organisation au référent : les participants, et qui n'a pas pu être convoqué", () => {
    const m = TRAINING_EMAIL_BUILDERS["recap-referent"](ctx);
    expect(m.text).toContain("Thomas P., Marc S.");
    expect(m.text).toContain("non convoqués : Marc S.");
  });

  it("à distance : le lien et les consignes à la place du lieu", () => {
    const m = TRAINING_EMAIL_BUILDERS["rappel-veille"]({ ...ctx, mode: "distance", link: "https://meet.google.com/abc", locationDetails: "Code 1234" });
    expect(m.text).toContain("En visio : https://meet.google.com/abc");
    expect(m.text).toContain("Code 1234");
    expect(m.text).not.toContain("Lieu :");
  });

  it("textes repris : variables remplacées, HTML saisi neutralisé", () => {
    const m = TRAINING_EMAIL_BUILDERS.convocation({
      ...ctx,
      texts: { subject: "Formation {{entreprise}} — {{date}}", intro: "Bonjour <b>{{prenom}}</b>, avec **{{formateur}}**." },
    });
    expect(m.subject).toBe("Formation SOUVET VMB — mardi 20 octobre");
    expect(m.html).toContain("&lt;b&gt;Thomas&lt;/b&gt;");
    expect(m.html).toContain("<strong>Charlie Piancatelli</strong>");
  });

  it("brief du formateur : participants, sans e-mail signalé, lien vers la fiche", () => {
    const m = TRAINING_EMAIL_BUILDERS["brief-formateur"](ctx);
    expect(m.subject).toBe("Demain : formation chez SOUVET VMB");
    expect(m.text).toContain("à remettre par vous");
    expect(m.html).toContain("Marc S. (sans e-mail)");
    expect(m.text).toContain("/admin/collections/partner-clients/12");
  });
});

describe("journée redatée et rappel par personne", () => {
  it("redatée : le cycle repart, la convocation repartira avec la bonne date", () => {
    const rows: DayEmailRow[] = [
      { key: "convocation", sentAt: "2026-10-01T07:00:00.000Z", recipients: [{ email: "a@x.fr" }], scheduledAt: "2026-10-01T07:00:00.000Z" },
      { key: "rappel-veille", overridden: true, scheduledAt: null },
    ];
    const next = scheduleDayEmails(DAY, rows, new Date("2026-10-02T10:00:00Z"), true);
    expect(next[0]).toMatchObject({ key: "convocation", sentAt: null, recipients: [], overridden: false });
    expect(next[0].scheduledAt).toBe("2026-10-13T07:00:00.000Z");
    expect(next.find((r) => r.key === "rappel-veille")?.scheduledAt).toBe("2026-10-19T15:00:00.000Z");
  });

  it("rappel : épargne la personne convoquée la veille, pas les autres", () => {
    const rappel = { key: "rappel-veille", scheduledAt: "2026-10-19T15:00:00.000Z" };
    const decision = decideTrainingEmail(
      rappel,
      facts({ convokedAt: { "a@x.fr": "2026-10-13T07:00:00.000Z", "b@x.fr": "2026-10-19T09:00:00.000Z" } }),
      Date.parse("2026-10-19T15:10:00Z"),
    );
    expect(decision).toEqual({ reason: "envoyer", to: ["a@x.fr"] });
  });

  it("rappel : sans objet si tout le monde vient d'être convoqué", () => {
    const decision = decideTrainingEmail(
      { key: "rappel-veille", scheduledAt: "2026-10-19T15:00:00.000Z" },
      facts({ convokedAt: { "a@x.fr": "2026-10-19T09:00:00.000Z", "b@x.fr": "2026-10-19T09:00:00.000Z" } }),
      Date.parse("2026-10-19T15:10:00Z"),
    );
    expect(decision.reason).toBe("convocation-recente");
  });
});

describe("envoi annulé à la main", () => {
  it("annulé : ne part pas, même pour une personne ajoutée après coup", () => {
    const r = { key: "convocation", scheduledAt: "2026-10-13T07:00:00.000Z", cancelledAt: "2026-10-10T09:00:00.000Z", cancelReason: "telephone" };
    expect(decideTrainingEmail(r, facts(), Date.parse("2026-10-13T07:05:00Z")).reason).toBe("annule");
  });

  it("l'annulation survit au redatage de la journée", () => {
    const rows: DayEmailRow[] = [{ key: "rappel-veille", cancelledAt: "2026-10-10T09:00:00.000Z", cancelReason: "sur-place", cancelNote: "Vu avec M. Souvet" }];
    const next = scheduleDayEmails(DAY, rows, new Date("2026-10-02T10:00:00Z"), true);
    expect(next.find((r) => r.key === "rappel-veille")).toMatchObject({ cancelReason: "sur-place", cancelNote: "Vu avec M. Souvet" });
  });

  it("motifs lisibles", async () => {
    const { cancelReasonLabel } = await import("@/modules/training/lib/email-schedule");
    expect(cancelReasonLabel("telephone")).toBe("Vu par téléphone");
    expect(cancelReasonLabel("inconnu")).toBe("Annulé");
  });
});
