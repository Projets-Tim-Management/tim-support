import { describe, expect, it } from "vitest";

import {
  attachmentNames,
  captureAddresses,
  stripQuoted,
  cleanSubject,
  correspondents,
  direction,
  readAddress,
  readAddresses,
} from "@/modules/partner/lib/email-capture";

/**
 * Rattachement d'un e-mail à une opportunité.
 *
 * Ce module décide de ce qui est ÉCRIT et de ce qui est oublié. Une erreur ici
 * ne casse rien visiblement : elle range un échange sur la mauvaise fiche, ou
 * conserve un message qui ne nous regarde pas.
 */

const CAPTURE = "suivi@tim-management.co";

describe("lecture des adresses", () => {
  it("accepte les formes que produisent les webhooks", () => {
    expect(readAddress("Jean Dupont <Jean@Toiture34.FR>")).toBe("jean@toiture34.fr");
    expect(readAddress({ Address: "a@b.fr" })).toBe("a@b.fr");
    expect(readAddress({ address: "a@b.fr", name: "A" })).toBe("a@b.fr");
    expect(readAddress("pas une adresse")).toBeNull();
    expect(readAddress(null)).toBeNull();
  });

  it("aplatit les listes et écarte les doublons de casse", () => {
    expect(readAddresses(["A@b.fr", { Address: "a@B.FR" }, "c@d.fr"])).toEqual(["a@b.fr", "c@d.fr"]);
  });
});

describe("qui peut être le prospect", () => {
  const msg = {
    from: "Luis <luis@toiture34.fr>",
    to: ["charlie@tim-management.co", CAPTURE],
    cc: "assistante@toiture34.fr",
  };

  it("retient l'expéditeur et les destinataires visibles", () => {
    expect(correspondents(msg, CAPTURE)).toEqual([
      "luis@toiture34.fr",
      "charlie@tim-management.co",
      "assistante@toiture34.fr",
    ]);
  });

  it("écarte l'adresse de capture, qui ne désigne personne", () => {
    // Elle est dans TOUS les messages : la laisser reviendrait à chercher une
    // opportunité qui aurait notre propre adresse d'archivage.
    expect(correspondents(msg, CAPTURE)).not.toContain(CAPTURE);
    // Y compris quand quelqu'un la met en Cc au lieu de Cci.
    expect(correspondents({ cc: CAPTURE.toUpperCase() }, CAPTURE)).toEqual([]);
  });

  it("ne renvoie rien d'un message sans adresse exploitable", () => {
    expect(correspondents({}, CAPTURE)).toEqual([]);
  });
});

describe("sens du message", () => {
  const OURS = ["charlie@tim-management.co"];

  it("est « envoyé » quand ça part de notre boîte, « reçu » sinon", () => {
    const de = (from: string) => direction({ from }, "luis@toiture34.fr", OURS);
    expect(de("Charlie <charlie@tim-management.co>")).toBe("envoye");
    expect(de("Luis <luis@toiture34.fr>")).toBe("recu");
  });

  it("reste « reçu » quand un collègue du prospect répond depuis une AUTRE adresse", () => {
    /**
     * Le cas qui cassait en production : une fiche rattachée via
     * invoices@ctsm.be, une réponse écrite par Louis depuis son adresse
     * personnelle. Comparée à la seule adresse de rattachement, elle passait
     * pour un envoi de notre part — et la fiche affichait « Envoyé » sur un
     * message qu'on avait reçu.
     */
    expect(direction({ from: "l.dupont@ctsm.be" }, "invoices@ctsm.be", OURS)).toBe("recu");
  });

  it("se fie à l'expéditeur, jamais aux destinataires", () => {
    // Dans un fil à plusieurs, l'adresse du prospect figure des deux côtés.
    const msg = { from: "charlie@tim-management.co", to: ["luis@toiture34.fr"] };
    expect(direction(msg, "luis@toiture34.fr", OURS)).toBe("envoye");
  });

  it("se rabat sur le domaine quand on ne connaît pas nos adresses", () => {
    // Cas de la copie cachée : personne ne nous dit quelle boîte est la nôtre.
    expect(direction({ from: "l.dupont@ctsm.be" }, "invoices@ctsm.be")).toBe("recu");
    expect(direction({ from: "charlie@tim-management.co" }, "invoices@ctsm.be")).toBe("envoye");
  });
});

describe("le fil cité", () => {
  it("coupe au « Le … a écrit : »", () => {
    const text = "Bonjour Charlie, c'est parfait pour mardi.\n\nLe mar. 2 sept. 2026 à 11:52, Charlie <c@tim.co> a écrit :\n> Bonjour, je vous propose mardi.";
    expect(stripQuoted(text)).toBe("Bonjour Charlie, c'est parfait pour mardi.");
  });

  it("coupe aussi sur un simple « > », même sans phrase d'introduction", () => {
    /**
     * Le « Le … a écrit : » se retrouve souvent coupé par un retour à la ligne
     * et échappe alors aux motifs de phrase. Le préfixe de citation, lui,
     * survit toujours — c'est le filet qui rattrape les fils entiers.
     */
    const text = "Merci pour votre retour, c'est noté.\n\n> Bonjour, voici le devis\n> en pièce jointe.";
    expect(stripQuoted(text)).toBe("Merci pour votre retour, c'est noté.");
  });

  it("coupe sur l'en-tête d'un transfert Outlook", () => {
    const text = "Je te transmets, regarde le prix.\n\nDe : client@x.fr\nEnvoyé : lundi\nObjet : Devis";
    expect(stripQuoted(text)).toBe("Je te transmets, regarde le prix.");
  });

  it("garde TOUT quand la coupe ne laisserait presque rien", () => {
    /**
     * Un transfert commenté d'un mot — « pour info » — ne doit pas se réduire à
     * ce mot : un message tronqué à tort est pire qu'un message trop long,
     * parce que rien ne le signale.
     */
    const text = "Pour info\n\n> Bonjour, voici le devis demandé hier.";
    expect(stripQuoted(text)).toContain("voici le devis");
  });

  it("laisse intact un message sans citation", () => {
    expect(stripQuoted("  Bonjour, c'est noté.  ")).toBe("Bonjour, c'est noté.");
  });
});

describe("objet", () => {
  it("retire les préfixes de réponse et de transfert accumulés", () => {
    // Sans ça, la chronologie affiche « Re: Re: Fwd: Devis » et on ne lit plus
    // le sujet mais l'historique du fil.
    expect(cleanSubject("Re: Fwd: RE: Devis chantier")).toBe("Devis chantier");
    expect(cleanSubject("TR : Votre demande")).toBe("Votre demande");
    expect(cleanSubject("RE[2]: Relance")).toBe("Relance");
  });

  it("laisse intact un objet qui commence par un mot ressemblant", () => {
    expect(cleanSubject("Refonte du planning")).toBe("Refonte du planning");
  });

  it("tient sans objet", () => {
    expect(cleanSubject(null)).toBe("");
    expect(cleanSubject("   ")).toBe("");
  });
});

describe("pièces jointes", () => {
  it("ne garde que les noms", () => {
    // Décision assumée : « je vous ai envoyé le devis » se vérifie avec un nom
    // et une date, sans détenir des documents que personne ne nous a confiés.
    expect(
      attachmentNames({ attachments: [{ Name: "devis.pdf" }, { name: "plan.png" }, { Name: "  " }] }),
    ).toEqual(["devis.pdf", "plan.png"]);
    expect(attachmentNames({})).toEqual([]);
  });
});

describe("les deux formes de l'adresse de capture", () => {
  const set = (addr?: string, domain?: string) => {
    if (addr) process.env.EMAIL_CAPTURE_ADDRESS = addr;
    else delete process.env.EMAIL_CAPTURE_ADDRESS;
    if (domain) process.env.REPLY_DOMAIN = domain;
    else delete process.env.REPLY_DOMAIN;
  };

  it("reconnaît celle qu'on tape ET celle qui arrive vraiment", () => {
    /**
     * Le Cci n'apparaît pas dans les en-têtes : ce qui parvient au webhook est
     * l'adresse routée sur REPLY_DOMAIN. Ne reconnaître que la première
     * reviendrait à ne jamais rien capturer.
     */
    set("suivi@tim-management.co", "reply.tim-management.co");
    expect(captureAddresses()).toEqual([
      "suivi@tim-management.co",
      "suivi@reply.tim-management.co",
    ]);
  });

  it("tient sans REPLY_DOMAIN, et se tait sans adresse", () => {
    set("Suivi@Tim-Management.CO");
    expect(captureAddresses()).toEqual(["suivi@tim-management.co"]);
    set(undefined);
    expect(captureAddresses()).toEqual([]);
    set("pas-une-adresse");
    expect(captureAddresses()).toEqual([]);
    set(undefined);
  });
});
