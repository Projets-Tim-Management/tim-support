import { describe, expect, it } from "vitest";

import {
  attachmentNames,
  captureAddresses,
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
  it("est « reçu » quand le prospect écrit, « envoyé » sinon", () => {
    const de = (from: string) => direction({ from }, "luis@toiture34.fr");
    expect(de("Luis <luis@toiture34.fr>")).toBe("recu");
    expect(de("charlie@tim-management.co")).toBe("envoye");
  });

  it("se fie à l'expéditeur, jamais aux destinataires", () => {
    /**
     * Un fil à plusieurs contient l'adresse du prospect des DEUX côtés : il est
     * destinataire du message qu'on lui envoie comme du sien en copie. Seul
     * l'expéditeur dit qui parle.
     */
    const msg = { from: "charlie@tim-management.co", to: ["luis@toiture34.fr"] };
    expect(direction(msg, "luis@toiture34.fr")).toBe("envoye");
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
