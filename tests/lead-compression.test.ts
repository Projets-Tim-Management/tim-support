import { describe, expect, it } from "vitest";

import { decideEmail } from "@/modules/marketing/lib/due-emails";
import {
  compressLeadOffsets,
  computeEmailSchedule,
  leadDaysOf,
  prepDaysAvailable,
  stepDueDate,
} from "@/modules/marketing/lib/journey";

/**
 * Démarrage forcé plus tôt que le délai de préparation.
 *
 * Ce qui doit rester vrai quoi qu'il arrive : aucune étape d'avant-test datée
 * dans le passé (elle naîtrait en retard, et son e-mail serait abandonné), et
 * l'ordre des étapes conservé.
 */

const NOW = new Date("2026-08-26T09:00:00.000Z"); // mercredi
const steps = [
  { key: "devis", anchor: "debut", offsetDays: -14 },
  { key: "contrat", anchor: "debut", offsetDays: -10 },
  { key: "dossier", anchor: "debut", offsetDays: -7 },
  { key: "acces", anchor: "debut", offsetDays: -1 },
  { key: "bilan", anchor: "fin", offsetDays: -2 },
  { key: "suivi", anchor: "debut", offsetDays: 7 },
];

describe("jours de préparation disponibles", () => {
  it("compte les jours de calendrier jusqu'au démarrage", () => {
    expect(prepDaysAvailable("2026-09-07T00:00:00.000Z", NOW)).toBe(12);
    expect(prepDaysAvailable("2026-08-31T00:00:00.000Z", NOW)).toBe(5);
  });

  it("ne descend jamais sous zéro", () => {
    expect(prepDaysAvailable("2026-08-26T00:00:00.000Z", NOW)).toBe(0);
    expect(prepDaysAvailable("2026-08-10T00:00:00.000Z", NOW)).toBe(0);
  });
});

describe("resserrement des étapes d'avant-test", () => {
  it("ne touche à rien quand le délai est tenu", () => {
    // 14 jours requis, 26 disponibles.
    expect(compressLeadOffsets(steps, "2026-09-21T00:00:00.000Z", NOW)).toEqual(steps);
  });

  it("réduit proportionnellement quand on démarre plus tôt", () => {
    // 5 jours disponibles pour 14 requis : facteur 5/14.
    //   -14 → -5   ·   -10 → -3,6 → -3   ·   -7 → -2,5 → -2   ·   -1 → -1 (plancher)
    const out = compressLeadOffsets(steps, "2026-08-31T00:00:00.000Z", NOW);
    expect(out.map((s) => s.offsetDays)).toEqual([-5, -3, -2, -1, -2, 7]);
  });

  it("ne date AUCUNE étape avant aujourd'hui", () => {
    const start = "2026-08-31T00:00:00.000Z";
    for (const s of compressLeadOffsets(steps, start, NOW)) {
      if (s.anchor !== "debut" || (s.offsetDays ?? 0) >= 0) continue;
      const due = stepDueDate(s, start, null, null)!;
      expect(Date.parse(due)).toBeGreaterThanOrEqual(Date.parse("2026-08-26T00:00:00.000Z"));
    }
  });

  it("préserve l'ordre des étapes", () => {
    const out = compressLeadOffsets(steps, "2026-08-31T00:00:00.000Z", NOW)
      .filter((s) => s.anchor === "debut" && (s.offsetDays ?? 0) < 0)
      .map((s) => s.offsetDays as number);
    expect([...out].sort((a, b) => a - b)).toEqual(out);
  });

  it("laisse intact ce qui n'est pas de la préparation", () => {
    const out = compressLeadOffsets(steps, "2026-08-31T00:00:00.000Z", NOW);
    expect(out.find((s) => s.key === "bilan")?.offsetDays).toBe(-2); // ancré à la FIN
    expect(out.find((s) => s.key === "suivi")?.offsetDays).toBe(7); // pendant le test
  });

  it("ramène tout au jour du démarrage s'il ne reste aucun jour", () => {
    const out = compressLeadOffsets(steps, "2026-08-26T00:00:00.000Z", NOW);
    expect(out.filter((s) => s.anchor === "debut" && s.key !== "suivi").map((s) => s.offsetDays)).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it("garde le délai requis lisible depuis les étapes", () => {
    expect(leadDaysOf(steps)).toBe(14);
  });
});

describe("un resserrement ne doit jamais s'empiler sur un autre", () => {
  /**
   * Le hook repart des décalages du MODÈLE avant de resserrer. Sans cela, un
   * calendrier déjà réduit servirait de base au suivant : chaque changement de
   * date le refermerait un peu plus, jusqu'à tout coller au jour du démarrage.
   */
  const model = steps.map((s) => ({ ...s }));

  it("repousser la date restaure l'espacement d'origine", () => {
    const serre = compressLeadOffsets(model, "2026-08-31T00:00:00.000Z", NOW);
    expect(serre.map((s) => s.offsetDays)).toEqual([-5, -3, -2, -1, -2, 7]);

    // Recompresser LE RÉSULTAT sur une date lointaine ne restaure rien…
    const surSoi = compressLeadOffsets(serre, "2026-10-05T00:00:00.000Z", NOW);
    expect(surSoi.map((s) => s.offsetDays)).toEqual([-5, -3, -2, -1, -2, 7]);

    // …alors qu'en repartant du modèle, l'espacement d'origine revient.
    const surModele = compressLeadOffsets(model, "2026-10-05T00:00:00.000Z", NOW);
    expect(surModele.map((s) => s.offsetDays)).toEqual([-14, -10, -7, -1, -2, 7]);
  });

  it("deux resserrements successifs depuis le modèle donnent le même résultat", () => {
    const a = compressLeadOffsets(model, "2026-08-31T00:00:00.000Z", NOW);
    const b = compressLeadOffsets(model, "2026-08-31T00:00:00.000Z", NOW);
    expect(a).toEqual(b);
  });
});

describe("les e-mails suivent le calendrier resserré", () => {
  /**
   * La question qui compte : un envoi replacé par le resserrement part-il
   * vraiment ? Trois conditions doivent tenir ensemble — une date recalculée,
   * une date jamais dans le passé, et un retard inférieur au délai de grâce
   * au-delà duquel le cron abandonne (LATE_GRACE_HOURS).
   */
  type Mail = {
    key: string;
    anchor: string;
    offsetDays: number;
    sendHour: string;
    overridden: boolean;
    scheduledAt: string | null;
    sentAt?: string | null;
  };
  const mails: Mail[] = [
    { key: "devis", anchor: "debut", offsetDays: -14, sendHour: "08:00", overridden: false, scheduledAt: null },
    { key: "relance-dossier", anchor: "debut", offsetDays: -7, sendHour: "08:00", overridden: false, scheduledAt: null },
    { key: "acces", anchor: "debut", offsetDays: -1, sendHour: "08:00", overridden: false, scheduledAt: null },
  ];
  const START = "2026-08-31T00:00:00.000Z"; // 5 jours après NOW

  it("recalcule la date d'envoi à partir du décalage resserré", () => {
    const serres = compressLeadOffsets(mails, START, NOW);
    const planned = computeEmailSchedule(serres, START, null, null);
    expect(planned.map((m) => m.scheduledAt?.slice(0, 10))).toEqual([
      "2026-08-26", // -14 j → -5 j
      "2026-08-29", // -7 j  → -2 j  (la relance suit le mouvement)
      "2026-08-30", // -1 j  → -1 j  (plancher : la veille reste la veille)
    ]);
  });

  it("ne programme AUCUN envoi dans le passé", () => {
    const planned = computeEmailSchedule(compressLeadOffsets(mails, START, NOW), START, null, null);
    for (const m of planned) {
      expect(Date.parse(m.scheduledAt!)).toBeGreaterThanOrEqual(Date.parse("2026-08-26T00:00:00.000Z"));
    }
  });

  it("le cron accepte encore d'envoyer le message du jour même", () => {
    // Pire cas : l'envoi est daté d'aujourd'hui 08:00 et le cron passe le soir.
    const planned = computeEmailSchedule(compressLeadOffsets(mails, START, NOW), START, null, null);
    const soir = Date.parse("2026-08-26T20:00:00.000Z");
    for (const m of planned) {
      const d = decideEmail(m as never, "preparation", soir, () => true);
      expect(d.send || (d as { reason: string }).reason === "not_due").toBe(true);
    }
  });

  it("une relance déjà partie n'est pas renvoyée par le resserrement", () => {
    const dejaPartie = [{ ...mails[1], sentAt: "2026-08-25T08:00:00.000Z" }];
    const planned = computeEmailSchedule(compressLeadOffsets(dejaPartie, START, NOW), START, null, null);
    expect(decideEmail(planned[0] as never, "preparation", Date.now(), () => true)).toEqual({
      send: false,
      reason: "already_sent",
    });
  });

  it("une date reprise à la main n'est pas déplacée", () => {
    const manuel = [{ ...mails[0], overridden: true, scheduledAt: "2026-08-29T10:00:00.000Z" }];
    const planned = computeEmailSchedule(compressLeadOffsets(manuel, START, NOW), START, null, null);
    expect(planned[0].scheduledAt).toBe("2026-08-29T10:00:00.000Z");
  });
});
