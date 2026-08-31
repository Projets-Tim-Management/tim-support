import { describe, expect, it } from "vitest";

import { escape } from "@/core/lib/email-template";
import { newTicketNoticeEmail, ticketReplyNoticeEmail } from "@/modules/support/lib/email";
import {
  buildContractRequestEmail,
  buildDossierToCheckEmail,
  buildQuoteEmail,
  buildTestRequestEmail,
} from "@/modules/marketing/lib/notify";

/**
 * Les alertes internes affichent des données SAISIES : raison sociale, adresse
 * de facturation, liste de contrôle de l'étape.
 *
 * Une esperluette dans « Dupont & Fils » suffit à produire un HTML invalide, et
 * un chevron à faire disparaître la moitié du tableau — dans le message même qui
 * sert à décider d'un Go/No-Go ou à chiffrer un devis. Les gabarits clients
 * échappaient déjà ; ces deux-là étaient restés en dehors.
 */

const MECHANT = '<img src=x onerror="alert(1)"> & "Cie" <b>';

/**
 * Aucune BALISE ni aucun ATTRIBUT ne s'est formé.
 *
 * On ne cherche pas le mot « onerror » : correctement échappé, il apparaît —
 * et c'est justement le but, il devient du texte inerte que le lecteur voit.
 * Ce qu'on vérifie, c'est qu'aucune syntaxe HTML ne s'est reconstituée.
 */
const aucuneBalise = (html: string) => {
  expect(html).not.toContain("<img");
  expect(html).not.toContain("<b>");
  expect(html).not.toContain('onerror="'); // le guillemet ouvrant est échappé
};

const client = {
  id: 60,
  companyName: MECHANT,
  siren: MECHANT,
  email: MECHANT,
  raisonSociale: MECHANT,
  billingAddress: MECHANT,
  caPaye: 1200,
  totalLicences: 12,
  licences: { chefQty: 2, chefPrice: 39 },
};
const partner = { id: 6, displayName: MECHANT, societe: MECHANT, email: MECHANT };

describe("alertes internes : les données saisies sont échappées", () => {
  it("« Go / No-Go » n'injecte aucune balise", () => {
    const mail = buildTestRequestEmail(
      { id: 42, startDate: "2026-09-07T00:00:00.000Z", endDate: "2026-10-05T00:00:00.000Z" },
      { client, partner, checklist: MECHANT },
    );
    aucuneBalise(mail.html);
    expect(mail.html).toContain(escape("<img"));
  });

  it("« Devis à rédiger » n'injecte aucune balise", () => {
    const mail = buildQuoteEmail({ id: 42, endDate: "2026-10-05T00:00:00.000Z" }, { client, partner });
    aucuneBalise(mail.html);
    expect(mail.html).toContain(escape("<img"));
  });

  it("reste lisible et complet avec des données ordinaires", () => {
    // L'échappement ne doit pas vider le message de sa substance : ces alertes
    // servent à DÉCIDER sans ouvrir le back-office.
    const mail = buildTestRequestEmail(
      { id: 42, startDate: "2026-09-07T00:00:00.000Z", endDate: "2026-10-05T00:00:00.000Z" },
      {
        client: { id: 60, companyName: "SOCOM FRANCE", siren: "123456789", totalLicences: 12 },
        partner: { id: 6, displayName: "Dupont & Fils" },
        checklist: "Vérifier le SIREN",
      },
    );
    expect(mail.subject).toContain("SOCOM FRANCE");
    expect(mail.html).toContain("Dupont &amp; Fils");
    expect(mail.html).toContain("123456789");
    expect(mail.html).toContain("Vérifier le SIREN");
    expect(mail.text).toContain("SOCOM FRANCE");
  });
});

describe("échappement : les guillemets aussi", () => {
  it("neutralise le guillemet, qui sort d'un attribut HTML", () => {
    // `escape` sert aussi à l'intérieur d'attributs (title, alt, href). Sans le
    // guillemet, une valeur saisie peut fermer l'attribut et en ouvrir un autre.
    expect(escape('" onmouseover="x')).not.toContain('"');
  });

  it("laisse le texte ordinaire intact", () => {
    expect(escape("Dupont et Fils — 44 quai Jayr")).toBe("Dupont et Fils — 44 quai Jayr");
  });
});

describe("les alertes internes passent des valeurs brutes à internalNotice", () => {
  it("échappe une seule fois, jamais deux", () => {
    // Le double échappement est l'autre moitié du problème : « Dupont & Fils »
    // affiché « Dupont &amp; Fils » en toutes lettres dans le message. Il
    // survient dès qu'un appelant échappe encore alors que l'enveloppe le fait.
    const mail = buildDossierToCheckEmail(
      { id: 42 },
      { clientName: "Dupont & Fils", partnerName: "Martin <SARL>", clientId: 60 },
    );
    expect(mail.html).toContain("Dupont &amp; Fils");
    expect(mail.html).not.toContain("&amp;amp;");
    expect(mail.html).toContain("Martin &lt;SARL&gt;");
    expect(mail.html).not.toContain("&amp;lt;");
  });

  it("neutralise aussi ce qui arrive par le corps du message", () => {
    const mail = buildContractRequestEmail(
      { id: 42 },
      { clientName: '<script>alert(1)</script>', partnerName: "Martin" },
    );
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});

describe("alertes de tickets : même contrat d'échappement", () => {
  const AMPERSAND = "Dupont & Fils";

  it("« nouveau ticket » échappe une fois, et affiche l'adresse entre chevrons", () => {
    const mail = newTicketNoticeEmail({
      id: 7,
      number: 7,
      subject: AMPERSAND,
      type: "assistance",
      name: AMPERSAND,
      email: "a@b.fr",
      description: "Problème sur <chantier> & suivi",
    });
    expect(mail.html).toContain("Dupont &amp; Fils");
    expect(mail.html).not.toContain("&amp;amp;");
    // Les chevrons autour de l'adresse doivent rester VISIBLES, pas disparaître
    // en balise : c'est ainsi qu'on lit un expéditeur.
    expect(mail.html).toContain("&lt;a@b.fr&gt;");
    expect(mail.html).not.toContain("&amp;lt;");
  });

  it("« réponse au ticket » échappe une fois", () => {
    const mail = ticketReplyNoticeEmail({
      id: 7,
      number: 7,
      subject: AMPERSAND,
      name: AMPERSAND,
      email: "a@b.fr",
      body: "Merci & bonne journée",
      journey: { runId: 42, clientName: AMPERSAND },
    });
    expect(mail.html).toContain("Dupont &amp; Fils");
    expect(mail.html).not.toContain("&amp;amp;");
    expect(mail.html).toContain("&lt;a@b.fr&gt;");
  });
});
