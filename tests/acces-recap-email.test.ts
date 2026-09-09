import { describe, expect, it } from "vitest";

import { buildTimAccessRecapEmail } from "@/modules/marketing/lib/emails";

/**
 * Le message qui remet TOUS les identifiants au référent.
 *
 * Deux choses ne doivent jamais manquer : les identifiants eux-mêmes — un
 * récapitulatif qui en oublie un envoie quelqu'un redemander la liste — et le
 * rappel de l'espace client, qui est la seule façon de les retrouver sans nous
 * réécrire.
 */

const ACCES = [
  { firstName: "David", lastName: "Lavialle", login: "david@dupont-btp.fr", password: "Kx7-mars", profileLabel: "Conducteur de travaux", profileKey: "conducteur" },
  { firstName: "Antony", lastName: "Lucia", login: "antony@dupont-btp.fr", password: "Zt2-plage" },
];

const APP = "https://app.tim-management.co/";
const STORE = /play\.google\.com|apps\.apple\.com/;

describe("récapitulatif des accès", () => {
  const mail = buildTimAccessRecapEmail({
    clientName: "Dupont BTP",
    contactFirstName: "Marie",
    accesses: ACCES,
  });

  it("porte CHAQUE identifiant et CHAQUE mot de passe", () => {
    for (const a of ACCES) {
      expect(mail.text).toContain(a.login);
      expect(mail.text).toContain(a.password);
      expect(mail.html).toContain(a.login);
      expect(mail.html).toContain(a.password);
    }
  });

  it("nomme les personnes : une liste de mots de passe sans noms ne se distribue pas", () => {
    expect(mail.text).toContain("David Lavialle");
    expect(mail.text).toContain("Antony Lucia");
  });

  it("renvoie vers l'espace client — un e-mail se perd, l'espace reste", () => {
    expect(mail.text).toContain("/espace-client");
    expect(mail.html).toContain("/espace-client");
  });

  /**
   * Le rappel de l'espace vient AVANT la liste : c'est là qu'on réimprime une
   * fiche ou qu'on renvoie ses accès à une seule personne, et personne ne
   * cherche cette information après avoir recopié neuf mots de passe.
   */
  it("annonce l'espace client avant le premier identifiant", () => {
    expect(mail.html.indexOf("/espace-client")).toBeLessThan(mail.html.indexOf(ACCES[0].login));
    expect(mail.text.indexOf("/espace-client")).toBeLessThan(mail.text.indexOf(ACCES[0].login));
  });

  it("dit qu'on peut y imprimer et renvoyer les accès un par un", () => {
    expect(mail.text).toMatch(/imprimer/i);
    expect(mail.text).toMatch(/un par un/i);
    expect(mail.html).toMatch(/imprimer/i);
  });

  it("annonce le nombre dans son objet", () => {
    expect(mail.subject).toContain("2");
  });

  it("dit que les mots de passe sont personnels", () => {
    expect(mail.text).toMatch(/personnels/i);
  });

  it("reste correct pour un seul accès", () => {
    const seul = buildTimAccessRecapEmail({ clientName: "Dupont BTP", accesses: [ACCES[0]] });
    // Ni « les 1 accès », ni un pluriel de trop.
    expect(seul.subject).not.toMatch(/\b1 accès/);
    expect(seul.text).toContain(ACCES[0].password);
  });

  it("tient debout sans nom de contact ni profil", () => {
    const brut = buildTimAccessRecapEmail({ accesses: [{ login: "x@y.fr", password: "abc" }] });
    expect(brut.text).toContain("abc");
    expect(brut.text).not.toMatch(/undefined|\bnull\b/);
    expect(brut.html).not.toMatch(/undefined|\bnull\b/);
  });
});

/**
 * Chacun n'entre pas par la même porte, et proposer une porte fermée est pire
 * que ne rien proposer : un compagnon n'a pas de compte sur le logiciel en
 * ligne, un administrateur n'a rien à faire sur un magasin d'applications.
 */
describe("récapitulatif : la porte annoncée suit le profil", () => {
  const mailFor = (profileKey: string) =>
    buildTimAccessRecapEmail({
      accesses: [{ login: "x@y.fr", password: "abc", profileKey }],
    });

  it("admin et conducteur de travaux : le logiciel en ligne, sans magasin", () => {
    for (const key of ["admin", "conducteur"]) {
      const mail = mailFor(key);
      expect(mail.html).toContain(APP);
      expect(mail.html).not.toMatch(STORE);
      expect(mail.text).toContain(APP);
      expect(mail.text).not.toMatch(STORE);
    }
  });

  it("chef de chantier : le logiciel EN LIGNE et les deux magasins", () => {
    const mail = mailFor("chefChantier");
    expect(mail.html).toContain(APP);
    expect(mail.html).toMatch(/play\.google\.com/);
    expect(mail.html).toMatch(/apps\.apple\.com/);
    expect(mail.text).toContain(APP);
    expect(mail.text).toMatch(STORE);
  });

  it("chef d'équipe et compagnon : les magasins seuls, jamais le lien du logiciel", () => {
    for (const key of ["chefEquipe", "compagnon"]) {
      const mail = mailFor(key);
      expect(mail.html).not.toContain(APP);
      expect(mail.text).not.toContain(APP);
      expect(mail.html).toMatch(/play\.google\.com/);
      expect(mail.html).toMatch(/apps\.apple\.com/);
    }
  });

  it("profil inconnu : le lien du logiciel, plutôt que rien", () => {
    const mail = buildTimAccessRecapEmail({ accesses: [{ login: "x@y.fr", password: "abc" }] });
    expect(mail.html).toContain(APP);
  });
});

/**
 * L'ORDRE, qui est le même sur les trois supports (espace client, ce message,
 * feuille d'impression) : par niveau, du bureau au terrain. Recoupés, ils se
 * lisent ligne à ligne ; mélangés, il faut relire chaque intitulé.
 */
describe("récapitulatif : rangé par niveau", () => {
  const mail = buildTimAccessRecapEmail({
    accesses: [
      { login: "cinq@y.fr", password: "e", profileKey: "compagnon", profileLabel: "Compagnon" },
      { login: "un@y.fr", password: "a", profileKey: "admin", profileLabel: "Admin" },
      { login: "quatre@y.fr", password: "d", profileKey: "chefEquipe", profileLabel: "Chef d'équipe" },
      { login: "deux@y.fr", password: "b", profileKey: "conducteur", profileLabel: "Conducteur de travaux" },
      { login: "trois@y.fr", password: "c", profileKey: "chefChantier", profileLabel: "Chef de chantier" },
    ],
  });

  it("descend du plus haut niveau au plus bas, quel que soit l'ordre reçu", () => {
    const rangs = ["un@y.fr", "deux@y.fr", "trois@y.fr", "quatre@y.fr", "cinq@y.fr"].map((l) =>
      mail.text.indexOf(l),
    );
    expect(rangs).toEqual([...rangs].sort((a, b) => a - b));
    expect(rangs.every((i) => i > 0)).toBe(true);
  });

  it("coiffe chaque niveau de son intitulé, une seule fois", () => {
    expect(mail.html.match(/Chef de chantier/g)).toHaveLength(1);
    expect(mail.text).toContain("COMPAGNON");
  });
});
