import { describe, expect, it } from "vitest";

import { journalEntries } from "@/modules/partner/lib/journal";
import { buildTaskReminderEmail } from "@/modules/partner/lib/task-reminder";

/**
 * Historique d'une opportunité : ce que le système consigne tout seul, et le
 * rappel qui part pour une tâche.
 *
 * Le journal doit raconter les FAITS, pas le bruit : un enregistrement qui ne
 * change rien ne laisse aucune ligne, sans quoi la chronologie devient
 * illisible et plus personne ne la lit.
 */

const doc = (over: Record<string, unknown> = {}) => ({
  id: 7,
  clientStatus: "nouvelle",
  ...over,
});

describe("journal automatique", () => {
  it("ouvre l'historique d'un lead par sa provenance", () => {
    expect(
      journalEntries(doc({ source: "site-vitrine", leadNotes: "Besoins : Pointage." }), undefined, "create"),
    ).toEqual([{ title: "Lead reçu du site vitrine", content: "Besoins : Pointage." }]);
  });

  it("distingue une fiche saisie à la main", () => {
    expect(journalEntries(doc({ source: "manuelle" }), undefined, "create")).toEqual([
      { title: "Opportunité créée" },
    ]);
  });

  it("ne double pas la création d'une ligne « statut »", () => {
    expect(journalEntries(doc(), undefined, "create")).toHaveLength(1);
  });

  it("consigne un changement d'étape avec les deux libellés", () => {
    expect(
      journalEntries(doc({ clientStatus: "demo-programmee" }), doc({ clientStatus: "nouvelle" }), "update"),
    ).toEqual([{ title: "Étape : Nouvelle → Démo programmée" }]);
  });

  it("consigne le démarrage et la signature du contrat", () => {
    const entries = journalEntries(
      doc({ clientStatus: "actif", contractStartDate: "2026-09-01T00:00:00.000Z", signatureDate: "2026-08-28T00:00:00.000Z" }),
      doc({ clientStatus: "en-test" }),
      "update",
    );
    expect(entries.map((e) => e.title)).toEqual([
      "Étape : En phase de test → Gagnée",
      "Contrat démarré le 01/09/2026",
      "Contrat signé le 28/08/2026",
    ]);
  });

  it("reste muet quand rien ne change", () => {
    const same = doc({ clientStatus: "en-qualification", signatureDate: "2026-08-28T00:00:00.000Z" });
    expect(journalEntries(same, same, "update")).toEqual([]);
  });

  it("ne consigne le dossier de démarrage qu'aux étapes qui comptent", () => {
    expect(
      journalEntries(doc({ onboardingStatus: "transmis" }), doc({ onboardingStatus: "en-cours" }), "update"),
    ).toEqual([{ title: "Dossier de démarrage transmis par le client" }]);
    // « en-cours » est l'état de départ : le repasser en arrière n'est pas un fait.
    expect(
      journalEntries(doc({ onboardingStatus: "en-cours" }), doc({ onboardingStatus: "transmis" }), "update"),
    ).toEqual([]);
  });
});

describe("rappel de tâche", () => {
  const task = {
    id: 12,
    title: "Rappeler Yorick",
    content: "Transmettre l'offre détaillée.",
    dueDate: "2026-08-28T07:00:00.000Z",
    client: { id: 3, companyName: "KUHN CONSTRUCTION" },
  };

  it("met l'essentiel dans l'objet", () => {
    expect(buildTaskReminderEmail(task).subject).toBe("Rappel : Rappeler Yorick — KUHN CONSTRUCTION");
  });

  it("signale une priorité haute dès l'objet", () => {
    expect(buildTaskReminderEmail({ ...task, highPriority: true }).subject).toBe(
      "⚑ Rappel : Rappeler Yorick — KUHN CONSTRUCTION",
    );
  });

  it("donne échéance, détail et lien vers la fiche", () => {
    const { text, html } = buildTaskReminderEmail(task);
    expect(text).toContain("Opportunité : KUHN CONSTRUCTION");
    expect(text).toContain("28 août 2026");
    expect(text).toContain("Transmettre l'offre détaillée.");
    expect(html).toContain("/admin/collections/partner-clients/3");
  });

  it("échappe le HTML d'une tâche (le texte vient d'une saisie libre)", () => {
    const { html } = buildTaskReminderEmail({ ...task, title: "<script>alert(1)</script>" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("tient debout sans client ni échéance", () => {
    const { subject, text } = buildTaskReminderEmail({ id: 1, title: "À faire" });
    expect(subject).toBe("Rappel : À faire");
    expect(text).toBe("À faire");
  });
});
