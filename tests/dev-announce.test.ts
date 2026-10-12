import { describe, expect, it } from "vitest";

import { buildAnnounceEmail } from "@/modules/dev/lib/announce-email";
import { DEV_STATUS_SEED } from "@/modules/dev/lib/devStatus";

/**
 * « C'est disponible » : l'e-mail au client qui avait demandé un développement.
 * Une seule demande — une démo ou un échange — et une réponse qui va au
 * partenaire. Ce qui vient d'une saisie est échappé : un titre de développement
 * peut contenir n'importe quoi.
 */
const base = {
  title: "Export des heures & absences",
  contactFirstName: "Karim",
  recipientEmail: "karim@instalclim.fr",
};

describe("buildAnnounceEmail", () => {
  it("annonce la bonne nouvelle dès l'objet", () => {
    const m = buildAnnounceEmail(base);
    expect(m.subject).toBe("Bonne nouvelle : « Export des heures & absences » est prête !");
    expect(m.text).toContain("Vous souhaitiez la fonctionnalité « Export des heures & absences »");
    expect(m.text).toContain("Notre équipe technique l'a réalisée");
    expect(m.text).toContain("Bonjour Karim,");
    expect(m.html).toContain("Export des heures &amp; absences");
    expect(m.html).not.toContain("heures & absences");
  });

  it("sans lien de réservation : répondre à l'e-mail, sans numéro ni nom de partenaire", () => {
    const m = buildAnnounceEmail(base);
    expect(m.text).toContain("on vous propose une démonstration");
    expect(m.text).toContain("répondez simplement à cet e-mail.");
    expect(m.text).not.toContain("appelez");
    expect(m.html).not.toContain("Réserver une démo");
  });

  it("avec un lien de réservation : un bouton, et pas de numéro à retenir", () => {
    const m = buildAnnounceEmail({ ...base, bookingUrl: "https://cal.example/luis" });
    expect(m.html).toContain("Réserver une démo");
    expect(m.html).toContain('href="https://cal.example/luis"');
    expect(m.text).toContain("Réserver une démo : https://cal.example/luis");
  });

  it("renvoie vers la fiche du site support quand elle existe", () => {
    const m = buildAnnounceEmail({ ...base, featureSlug: "export-heures", featureTitle: "Exporter les heures" });
    expect(m.html).toContain("/features/export-heures");
    expect(m.html).toContain("Exporter les heures");
    expect(buildAnnounceEmail(base).html).not.toContain("/features/");
  });

  it("reste poli sans prénom", () => {
    const m = buildAnnounceEmail({ title: "Un dev", contactFirstName: null });
    expect(m.text).toContain("Bonjour,");
    expect(m.text).toContain("répondez simplement à cet e-mail.");
  });

  it("neutralise une balise dans le titre", () => {
    const m = buildAnnounceEmail({ ...base, title: '<img src=x onerror="alert(1)">' });
    expect(m.html).not.toContain("<img src=x");
    expect(m.html).toContain("&lt;img src=x");
  });
});

describe("rôle « prévient les demandeurs »", () => {
  it("est porté par « Terminé » dans le jeu livré, et par lui seul", () => {
    const porteurs = DEV_STATUS_SEED.filter((s) => s.roles.includes("annonce")).map((s) => s.key);
    expect(porteurs).toEqual(["termine"]);
  });

  it("reprend les textes et l'image du back-office ; un champ vide garde l'original", () => {
    const m = buildAnnounceEmail({
      ...base,
      texts: { subject: "C'est prêt : {{titre}}", intro: "**{{titre}}** est là <b>!</b>", heading: "" },
      heroImageUrl: "https://cdn.exemple/hero.png",
    });
    expect(m.subject).toBe("C'est prêt : Export des heures & absences");
    expect(m.html).toContain("<strong>Export des heures &amp; absences</strong> est là &lt;b&gt;!&lt;/b&gt;");
    expect(m.html).toContain("Bonne nouvelle !");
    expect(m.html).toContain("https://cdn.exemple/hero.png");
    expect(m.text).toContain("Export des heures & absences est là");
  });
});

