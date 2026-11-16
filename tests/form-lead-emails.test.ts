import { describe, expect, it } from "vitest";

import {
  leadConfirmationEmail,
  linksFor,
  newLeadNoticeEmail,
  topicsFor,
} from "@/modules/forms/lib/lead-emails";

/**
 * Ces deux e-mails remplacent des automations Brevo. Le premier est le seul
 * message que le prospect reçoit : un modèle qui se dégrade mal (« Bonjour  ,
 * vous êtes  de  ») est pire que pas de personnalisation du tout.
 */

const full = {
  civilite: "Mme",
  nom: "Marie Poulit",
  companyName: "Capblancq GT",
  fonction: "Employé",
  effectif: "11 - 25",
  besoins: ["Pointage", "Planning"],
  besoinValues: ["pointage", "planning"],
  email: "contact@capblancq.fr",
};

describe("sujets déduits des besoins", () => {
  it("retient les sujets cochés, dans l'ordre", () => {
    expect(topicsFor(["chantiers", "pointage"]).map((t) => t.topic)).toEqual([
      "le suivi de chantier",
      "le pointage",
    ]);
  });

  it("ignore un besoin inconnu et les doublons", () => {
    expect(topicsFor(["inconnu"])).toEqual([]);
    expect(topicsFor(["pointage", "pointage"])).toHaveLength(1);
    expect(topicsFor()).toEqual([]);
  });

  it("propose trois liens au plus, sans doublon", () => {
    for (const besoins of [[], ["pointage"], ["chantiers", "planning"], ["planning", "vehicules"]]) {
      const links = linksFor(besoins);
      expect(links.length, besoins.join()).toBeLessThanOrEqual(3);
      expect(new Set(links).size, besoins.join()).toBe(links.length);
    }
  });

  it("propose les pages les plus courantes quand rien n'est coché", () => {
    // Un e-mail sans aucun lien laisserait le prospect sans rien à explorer.
    expect(linksFor([]).length).toBe(3);
  });
});

describe("accusé de réception au prospect", () => {
  it("salue la personne et dit que la demande est arrivée", () => {
    const { text, html } = leadConfirmationEmail(full);
    expect(text).toContain("Bonjour Mme Marie Poulit,");
    expect(text).toContain("✅ Votre demande est bien arrivée.");
    expect(html).toContain("Demande reçue");
  });

  it("un suivi en trois étapes, la suivante en avant : choisir le créneau", () => {
    const { html } = leadConfirmationEmail(full);
    expect(html.indexOf("Demande reçue")).toBeLessThan(html.indexOf("Choisissez votre créneau"));
    expect(html.indexOf("Choisissez votre créneau")).toBeLessThan(html.indexOf("Votre démo"));
    expect(html).toContain("Choisir mon créneau");
    expect(html).toContain("Sans engagement");
  });

  it("se dégrade proprement quand tout manque", () => {
    const { text, html } = leadConfirmationEmail({});
    expect(text).toContain("Bonjour,");
    expect(text).not.toMatch(/Bonjour\s+,/);
    expect(text).not.toContain("undefined");
    expect(html).not.toContain("undefined");
  });

  it("porte le lien de réservation et le téléphone", () => {
    const { text } = leadConfirmationEmail(full);
    expect(text).toContain("calendly.com/cpiancatelli/30min");
    expect(text).toContain("09 72 12 59 03");
  });

  it("court : ni longs conseils, ni liens vers les fonctionnalités", () => {
    const { text, html } = leadConfirmationEmail(full);
    expect(text).not.toContain("Trois conseils");
    expect(html).not.toContain("jeter un œil");
  });

  it("reste court — c'est un e-mail, pas un document", () => {
    // Garde-fou contre la dérive : chaque ajout « utile » rallonge, et un
    // message qu'on fait défiler ne se lit plus.
    const lignes = leadConfirmationEmail(full).text.split("\n").filter(Boolean);
    expect(lignes.length).toBeLessThanOrEqual(16);
  });

  it("échappe ce que la personne a saisi", () => {
    const { html } = leadConfirmationEmail({ ...full, nom: "Dupont & <b>Fils</b>" });
    expect(html).toContain("Dupont &amp; &lt;b&gt;Fils&lt;/b&gt;");
    expect(html).not.toContain("<b>Fils</b>");
  });
});


describe("alerte interne", () => {
  it("dit qui arrive, ce qu'il demande et d'où il vient", () => {
    const mail = newLeadNoticeEmail({
      ...full,
      telephone: "+33 6 12 34 56 78",
      pays: "France",
      canal: "Google Ads — SEA",
      page: "/lp/demande-demo-suivi-temps-v2",
      campagne: "23456789",
      variante: "v2",
      clientId: 42,
    });
    expect(mail.subject).toBe("Nouveau lead — Capblancq GT (Google Ads — SEA)");
    for (const v of ["Capblancq GT", "11 - 25", "Employé", "+33 6 12 34 56 78", "Pointage, Planning", "France", "23456789"]) {
      expect(mail.text, v).toContain(v);
    }
    expect(mail.html).toContain("/admin/collections/partner-clients/42");
  });

  it("signale une fiche créée avec des réserves", () => {
    const mail = newLeadNoticeEmail({ companyName: "Sans Mail", issues: ["Adresse e-mail mal formée (« a@b »)"], clientId: 7 });
    expect(mail.text).toContain("réserves");
    expect(mail.text).toContain("Adresse e-mail mal formée");
    expect(mail.html).toContain("Nouvelle");
  });

  it("renvoie vers les soumissions quand aucune fiche n'a pu être créée", () => {
    const mail = newLeadNoticeEmail({ companyName: "Échec" });
    expect(mail.html).toContain("/admin/collections/form-submissions");
  });

  it("reste lisible sans société ni contexte", () => {
    const mail = newLeadNoticeEmail({});
    expect(mail.subject).toBe("Nouveau lead — Société inconnue");
    expect(mail.text).not.toContain("undefined");
    expect(mail.html).not.toContain("undefined");
  });

  it("échappe les valeurs saisies", () => {
    const mail = newLeadNoticeEmail({ companyName: 'Dupont & <script>alert(1)</script>' });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&amp;");
  });
});
