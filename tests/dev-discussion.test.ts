import { describe, expect, it } from "vitest";

import {
  commentCount,
  pendingQuestions,
  writtenComments,
} from "@/modules/dev/lib/discussion";

/**
 * Les questions posées dans une discussion.
 *
 * Ce qui est en jeu : la pastille « en attente » et la notification du tableau
 * de bord se déduisent d'ici. Une question qu'on croit répondue alors qu'elle
 * ne l'est pas, c'est un dev qui s'arrête sans que personne ne le sache.
 */

const q = (body: string, author: number, askedTo?: number) => ({ body, author, askedTo });

describe("ce qui attend une réponse", () => {
  it("une question posée à quelqu'un attend tant qu'il n'a pas écrit", () => {
    const fil = [q("Le client veut-il le multi-sites ?", 1, 2)];
    expect(pendingQuestions(fil)).toHaveLength(1);
    expect(pendingQuestions(fil)[0].askedTo).toBe("2");
  });

  it("est close dès que la personne sollicitée reprend la parole", () => {
    const fil = [q("On fait quoi ?", 1, 2), q("On fonce.", 2)];
    expect(pendingQuestions(fil)).toHaveLength(0);
  });

  it("une réponse de QUELQU'UN D'AUTRE ne referme pas la question", () => {
    // Le cas qui compte : trois personnes dans un fil, la question s'adressait
    // à l'une d'elles. Un tiers qui commente ne libère pas la personne visée.
    const fil = [q("Tu confirmes ?", 1, 2), q("Je crois que oui.", 3)];
    expect(pendingQuestions(fil)).toHaveLength(1);
  });

  it("un message ANTÉRIEUR de la personne ne compte pas comme réponse", () => {
    const fil = [q("Je regarde.", 2), q("Alors ?", 1, 2)];
    expect(pendingQuestions(fil)).toHaveLength(1);
    expect(pendingQuestions(fil)[0].index).toBe(1);
  });

  it("plusieurs questions en attente se cumulent", () => {
    const fil = [q("A ?", 1, 2), q("B ?", 1, 3), q("Oui pour A.", 2)];
    const attente = pendingQuestions(fil);
    expect(attente.map((x) => x.askedTo)).toEqual(["3"]);
  });

  it("filtre sur une personne : ce qu'ELLE doit, et rien d'autre", () => {
    const fil = [q("A ?", 1, 2), q("B ?", 1, 3)];
    expect(pendingQuestions(fil, "3")).toHaveLength(1);
    expect(pendingQuestions(fil, "9")).toHaveLength(0);
  });

  it("lit les relations peuplées comme les identifiants bruts", () => {
    const fil = [{ body: "Tu valides ?", author: { id: 1 }, askedTo: { id: 2 } }];
    expect(pendingQuestions(fil, "2")).toHaveLength(1);
  });

  it("un simple commentaire, sans destinataire, n'attend rien", () => {
    expect(pendingQuestions([q("Noté.", 1)])).toHaveLength(0);
  });
});

describe("messages écrits", () => {
  it("les lignes vides ne comptent pas — ni au compteur, ni comme réponse", () => {
    const fil = [q("Alors ?", 1, 2), { body: "   ", author: 2 }];
    expect(commentCount(fil)).toBe(1);
    expect(writtenComments(fil)).toHaveLength(1);
    // La ligne vide de la personne sollicitée ne referme pas la question.
    expect(pendingQuestions(fil)).toHaveLength(1);
  });

  it("ne casse pas sur une valeur inattendue", () => {
    expect(commentCount(undefined)).toBe(0);
    expect(pendingQuestions(null)).toEqual([]);
  });
});
