import { describe, expect, it } from "vitest";

import {
  buildPartnerStepEmail,
  decidePartnerStep,
  isPartnerStepHour,
  partnerStepsDue,
  partnerStepsOnAgenda,
  type PartnerStep,
} from "@/modules/marketing/lib/partner-steps";

/**
 * L'alerte qui manquait : une étape du parcours attend le partenaire, et
 * personne ne le lui disait. Elle se découvrait en ouvrant la fiche, par
 * hasard — constaté le 09/09/2026 sur « Relevé d'usage J+2 ».
 *
 * Ce qui se vérifie ici tient en deux points : on n'alerte QUE sur ce qui
 * attend vraiment quelqu'un, et on n'alerte QU'UNE FOIS — le cron passe toutes
 * les heures, et une alerte répétée s'apprend à ne plus être lue.
 */

const RUN = {
  startDate: "2026-09-07T00:00:00.000Z",
  endDate: "2026-10-05T00:00:00.000Z",
  steps: [
    { key: "releve-j2", label: "Relevé d'usage J+2", actor: "partenaire", state: "a-faire", anchor: "debut", offsetDays: 2, detail: "Le partenaire se connecte au compte du client." },
    { key: "conseil", label: "Conseil d'usage", actor: "admin", state: "a-faire", anchor: "debut", offsetDays: 1, autoValidate: true },
    { key: "remise-acces", label: "Accès distribués", actor: "client", state: "a-faire", anchor: "debut", offsetDays: 1 },
    { key: "releve-j7", label: "Relevé d'usage J+7", actor: "partenaire", state: "a-faire", anchor: "debut", offsetDays: 7 },
  ] as PartnerStep[],
};

/** 9 septembre 2026, 8 h à Paris — J+2 est échu, J+7 non. */
const LE_9 = Date.parse("2026-09-09T06:00:00.000Z");

describe("décider d'alerter le partenaire", () => {
  const ctx = { startDate: RUN.startDate, endDate: RUN.endDate, nowMs: LE_9 };

  it("alerte sur une étape du partenaire dont l'échéance est passée", () => {
    const d = decidePartnerStep(RUN.steps[0], ctx);
    expect(d.notify).toBe(true);
  });

  it("n'alerte pas sur ce qui n'attend pas le partenaire", () => {
    // Le client et TIM ont leurs propres rappels : une alerte de plus ferait
    // croire au partenaire qu'il doit agir à leur place.
    expect(decidePartnerStep(RUN.steps[1], ctx)).toMatchObject({ notify: false });
    expect(decidePartnerStep(RUN.steps[2], ctx)).toMatchObject({
      notify: false,
      reason: "not_partner",
    });
  });

  it("n'alerte pas avant l'échéance", () => {
    expect(decidePartnerStep(RUN.steps[3], ctx)).toMatchObject({
      notify: false,
      reason: "not_due",
    });
  });

  it("n'alerte pas sur une étape faite, bloquée, ou à validation automatique", () => {
    const base = RUN.steps[0];
    expect(decidePartnerStep({ ...base, state: "fait" }, ctx)).toMatchObject({
      notify: false,
      reason: "already_done",
    });
    // Bloquée : quelqu'un a constaté que ça ne peut pas se faire. Réclamer
    // l'action contredirait ce constat.
    expect(decidePartnerStep({ ...base, state: "bloque" }, ctx)).toMatchObject({
      notify: false,
      reason: "blocked",
    });
    expect(decidePartnerStep({ ...base, autoValidate: true }, ctx)).toMatchObject({
      notify: false,
      reason: "auto",
    });
  });

  /** Le garde-fou du doublon : le cron passe toutes les heures. */
  it("n'alerte qu'une fois : une étape déjà annoncée ne repart pas", () => {
    expect(
      decidePartnerStep({ ...RUN.steps[0], notifiedAt: "2026-09-09T06:00:00.000Z" }, ctx),
    ).toMatchObject({ notify: false, reason: "already_notified" });
  });

  it("n'alerte pas sans échéance calculable", () => {
    expect(decidePartnerStep({ ...RUN.steps[0], anchor: "aucun" }, ctx)).toMatchObject({
      notify: false,
      reason: "no_date",
    });
    // Ancrée sur un créneau non réservé : rien à quoi s'accrocher.
    expect(
      decidePartnerStep({ ...RUN.steps[0], anchor: "session" }, { ...ctx, sessionAt: null }),
    ).toMatchObject({ notify: false, reason: "no_date" });
  });

  it("compte le retard, qui est ce qui rend le message urgent", () => {
    const tard = decidePartnerStep(RUN.steps[0], {
      ...ctx,
      nowMs: Date.parse("2026-09-12T06:00:00.000Z"),
    });
    expect(tard).toMatchObject({ notify: true, lateDays: 3 });
  });
});

describe("les étapes dues d'un parcours", () => {
  it("ne retient que celles du partenaire, échues", () => {
    const due = partnerStepsDue(RUN, LE_9);
    expect(due.map((d) => d.step.key)).toEqual(["releve-j2"]);
  });

  it("les retient toutes quand plusieurs sont en retard — un seul appel", () => {
    const due = partnerStepsDue(RUN, Date.parse("2026-09-20T06:00:00.000Z"));
    expect(due.map((d) => d.step.key)).toEqual(["releve-j2", "releve-j7"]);
  });
});

describe("les étapes du partenaire sur un agenda", () => {
  /**
   * L'alerte part une fois ; l'agenda, lui, doit montrer l'étape tant qu'elle
   * n'est pas faite — et la semaine qui vient. Constaté le 16/09/2026 : le
   * relevé J+2 d'Instalclim, dû le jour même, n'était ni « aujourd'hui » ni
   * « en retard » sur le tableau de bord.
   */
  it("retient les étapes du partenaire, échues OU à venir, avec leur date", () => {
    const sur = partnerStepsOnAgenda(RUN);
    expect(sur.map((s) => s.step.key)).toEqual(["releve-j2", "releve-j7"]);
    expect(sur[0].due).toBe("2026-09-09T00:00:00.000Z");
    expect(sur[1].due).toBe("2026-09-14T00:00:00.000Z");
    expect(sur.every((s) => !s.done)).toBe(true);
  });

  it("garde une étape faite, marquée — l'agenda la barre, il ne l'efface pas", () => {
    const run = {
      ...RUN,
      steps: [{ ...RUN.steps[0], state: "fait" }, RUN.steps[3]],
    };
    expect(partnerStepsOnAgenda(run).map((s) => [s.step.key, s.done])).toEqual([
      ["releve-j2", true],
      ["releve-j7", false],
    ]);
  });

  it("ignore l'alerte déjà envoyée : avoir été prévenu n'a jamais fait l'action", () => {
    const run = { ...RUN, steps: [{ ...RUN.steps[0], notifiedAt: "2026-09-09T06:00:00.000Z" }] };
    expect(partnerStepsOnAgenda(run).map((s) => s.step.key)).toEqual(["releve-j2"]);
  });

  it("écarte ce qui est bloqué, automatique, ou s'acquiert tout seul", () => {
    const run = {
      ...RUN,
      sessionAt: "2026-09-08T08:00:00.000Z",
      steps: [
        { ...RUN.steps[0], state: "bloque" },
        { ...RUN.steps[3], state: "auto", autoAt: "2026-09-15T00:00:00.000Z" },
        { key: "prise-en-main", label: "Session réalisée", actor: "partenaire", state: "a-faire", anchor: "session", offsetDays: 0 },
        { key: "bilan-tenu", label: "Bilan", actor: "partenaire", state: "a-faire", anchor: "bilan", offsetDays: 0 },
      ] as PartnerStep[],
    };
    // Sans date de bilan, l'étape « bilan » n'a rien à quoi s'accrocher.
    expect(partnerStepsOnAgenda(run)).toEqual([]);
    // Avec, elle prend sa place.
    expect(
      partnerStepsOnAgenda({ ...run, reviewAt: "2026-10-01T09:00:00.000Z" }).map((s) => s.step.key),
    ).toEqual(["bilan-tenu"]);
  });
});

describe("l'heure d'envoi", () => {
  it("est 8 h à Paris, et pas une autre", () => {
    // Septembre : Paris = UTC+2.
    expect(isPartnerStepHour(Date.parse("2026-09-09T06:00:00.000Z"))).toBe(true);
    // 1 h du matin — l'heure du premier passage après minuit, celle qu'il
    // fallait éviter.
    expect(isPartnerStepHour(Date.parse("2026-09-08T23:00:00.000Z"))).toBe(false);
    expect(isPartnerStepHour(Date.parse("2026-09-09T12:00:00.000Z"))).toBe(false);
  });
});

describe("le message envoyé au partenaire", () => {
  const due = partnerStepsDue(RUN, LE_9);
  const mail = buildPartnerStepEmail({
    runId: 42,
    clientId: 7,
    clientName: "NATURA CREATION",
    steps: due,
    contact: { name: "Marie Dubois", role: "Directrice", phone: "+33 6 12 34 56 78", email: "marie@natura.fr" },
    endDate: RUN.endDate,
    nowMs: LE_9,
  });

  it("nomme le client dans son objet : c'est ce qu'on lit avant d'ouvrir", () => {
    expect(mail.subject).toContain("NATURA CREATION");
    expect(mail.subject).toContain("Relevé d'usage J+2");
  });

  it("donne QUI appeler et à quel numéro — sinon il faut ouvrir la fiche", () => {
    expect(mail.html).toContain("Marie Dubois");
    expect(mail.html).toContain("+33 6 12 34 56 78");
    expect(mail.text).toContain("+33 6 12 34 56 78");
  });

  it("dit ce qu'il y a à faire, pas seulement l'intitulé", () => {
    expect(mail.html).toContain("se connecte au compte du client");
    expect(mail.text).toContain("se connecte au compte du client");
  });

  it("mène droit au parcours pour valider l'étape", () => {
    expect(mail.html).toContain("/admin/collections/journey-runs/42");
    expect(mail.text).toContain("/admin/collections/journey-runs/42");
    expect(mail.html).toContain("/admin/collections/partner-clients/7");
  });

  /**
   * ⚠️ Le banc tourne en UTC, comme les fonctions Vercel (tests/setup-tz.ts).
   *
   * Sans fuseau explicite, une échéance stockée en fin de journée s'annonçait la
   * VEILLE — « prévue le 8 septembre » pour une étape due le 9. Le partenaire
   * appelle alors en croyant être en retard, ou range l'alerte comme périmée.
   */
  it("date l'échéance à l'heure de PARIS, pas à celle du serveur", () => {
    const mail = buildPartnerStepEmail({
      runId: 1,
      clientName: "NATURA",
      steps: [
        {
          step: { label: "Relevé", detail: null },
          due: "2026-09-08T22:30:00.000Z",
          lateDays: 3,
        },
      ],
      nowMs: Date.parse("2026-09-12T06:00:00.000Z"),
    });
    expect(mail.text).toContain("9 septembre");
    expect(mail.text).not.toContain("8 septembre");
  });

  it("annonce le retard quand il y en a, et pas quand il n'y en a pas", () => {
    expect(mail.text).toContain("aujourd'hui");
    const tard = buildPartnerStepEmail({
      runId: 42,
      clientName: "NATURA CREATION",
      steps: partnerStepsDue(RUN, Date.parse("2026-09-12T06:00:00.000Z")),
      nowMs: Date.parse("2026-09-12T06:00:00.000Z"),
    });
    expect(tard.text).toMatch(/en retard de 3 jours/);
  });

  it("groupe les étapes d'un même client en UN message", () => {
    const deux = buildPartnerStepEmail({
      runId: 42,
      clientName: "NATURA CREATION",
      steps: partnerStepsDue(RUN, Date.parse("2026-09-20T06:00:00.000Z")),
      nowMs: Date.parse("2026-09-20T06:00:00.000Z"),
    });
    expect(deux.subject).toContain("2 actions");
    expect(deux.text).toContain("Relevé d'usage J+2");
    expect(deux.text).toContain("Relevé d'usage J+7");
  });

  it("tient debout sans contact ni nom de client", () => {
    const brut = buildPartnerStepEmail({ runId: 1, steps: due, nowMs: LE_9 });
    expect(brut.text).not.toMatch(/undefined|\bnull\b/);
    expect(brut.html).not.toMatch(/undefined|\bnull\b/);
  });
});
