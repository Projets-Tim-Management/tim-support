import { describe, expect, it } from "vitest";

import { carnetForModel, carnetRules, consignesBlock, normalizeOps, notedLine, splitCarnet, type NoteRow } from "@/modules/ai-team/lib/notebook";

/**
 * Le carnet d'un chef : ce qu'il retient d'un échange à l'autre. Il juge les
 * idées de la direction (et peut dire non), donne des consignes à SON équipe,
 * fait évoluer ses notes en disant pourquoi.
 */

const ctx = { noteIds: new Set(["41"]), teamKeys: new Set(["sea-meta", "sea-stratege"]) };

describe("le bloc du carnet dans une réponse", () => {
  it("se lit à part, et la direction ne le voit pas", () => {
    const r = splitCarnet('Non, pas maintenant : 1 lead en 3 mois.\n<carnet>{"ajouter":[{"sorte":"idee","texte":"Relancer 3 thèmes Meta","raison":"Trop peu de volume","verdict":"ecartee"}]}</carnet>');
    expect(r.text).toBe("Non, pas maintenant : 1 lead en 3 mois.");
    expect(r.raw).toEqual({ ajouter: [{ sorte: "idee", texte: "Relancer 3 thèmes Meta", raison: "Trop peu de volume", verdict: "ecartee" }] });
  });

  it("un bloc illisible ou coupé disparaît sans rien écrire", () => {
    expect(splitCarnet("Réponse.\n<carnet>{pas du json}</carnet>")).toEqual({ text: "Réponse.", raw: null });
    expect(splitCarnet('Réponse.\n<carnet>{"ajouter":[')).toEqual({ text: "Réponse.", raw: null });
    expect(splitCarnet("Sans carnet.")).toEqual({ text: "Sans carnet.", raw: null });
  });
});

describe("ce que le serveur accepte d'écrire", () => {
  it("une consigne va à un membre de SON équipe, une idée porte un verdict", () => {
    const ops = normalizeOps(
      {
        ajouter: [
          { sorte: "consigne", texte: "Plus de nouveau thème", raison: "Page à corriger", pour: "sea-meta" },
          { sorte: "consigne", texte: "Hors équipe", pour: "seo-analyste" },
          { sorte: "idee", texte: "Sans verdict" },
          { sorte: "idee", texte: "Une seule campagne", verdict: "imposee" },
          { sorte: "inconnue", texte: "x" },
          { sorte: "suivi", texte: "Revoir Meta", echeance: "2026-11-28" },
        ],
      },
      ctx,
    );
    expect(ops).toEqual([
      { op: "ajouter", kind: "consigne", text: "Plus de nouveau thème", reason: "Page à corriger", target: "sea-meta" },
      { op: "ajouter", kind: "idee", text: "Une seule campagne", reason: "", verdict: "imposee", disagreement: "Désaccord non précisé." },
      { op: "ajouter", kind: "suivi", text: "Revoir Meta", reason: "", dueAt: "2026-11-28" },
    ]);
  });

  it("on ne modifie qu'une note de son carnet, et toujours avec une raison", () => {
    const ops = normalizeOps(
      {
        modifier: [
          { id: "41", raison: "Les chiffres d'octobre la contredisent", etat: "abandonnee" },
          { id: "41", etat: "terminee" },
          { id: "99", raison: "x", etat: "terminee" },
          { id: "41", raison: "rien ne change" },
        ],
      },
      ctx,
    );
    expect(ops).toEqual([{ op: "modifier", id: "41", reason: "Les chiffres d'octobre la contredisent", status: "abandonnee" }]);
  });

  it("au plus 8 opérations, textes bornés", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ sorte: "conviction", texte: `${i} ${"x".repeat(900)}` }));
    const ops = normalizeOps({ ajouter: many }, ctx);
    expect(ops).toHaveLength(8);
    expect((ops[0] as { text: string }).text.length).toBe(500);
  });
});

describe("ce que la direction lit sous la réponse", () => {
  const names = { nameOf: (k: string) => ({ "sea-meta": "Camille" })[k] ?? k, textOf: () => "Google Ads est le canal le moins cher" };
  it("dit clairement le verdict, et le désaccord quand la direction a tranché", () => {
    expect(notedLine({ op: "ajouter", kind: "idee", text: "Relancer 3 thèmes", reason: "1 lead en 3 mois", verdict: "ecartee" }, names)).toBe("❌ Idée écartée : Relancer 3 thèmes — 1 lead en 3 mois");
    expect(notedLine({ op: "ajouter", kind: "idee", text: "Une seule campagne", reason: "", verdict: "imposee", disagreement: "je surveille le coût par lead" }, names)).toBe("🫡 Idée appliquée à votre demande : Une seule campagne — mon désaccord : je surveille le coût par lead");
    expect(notedLine({ op: "ajouter", kind: "consigne", text: "Plus de nouveau thème", reason: "", target: "sea-meta" }, names)).toBe("📣 Consigne à Camille : Plus de nouveau thème");
    expect(notedLine({ op: "modifier", id: "41", reason: "contredite en octobre", status: "abandonnee" }, names)).toBe("🗑️ Abandonné : Google Ads est le canal le moins cher — contredite en octobre");
  });
});

describe("ce que le chef relit, et ce que l'équipe reçoit", () => {
  it("le carnet relu porte les clés de l'équipe et l'histoire récente", () => {
    const note: NoteRow = { id: "41", member: "1", kind: "consigne", text: "Plus de nouveau thème", reason: "Page à corriger", target: "3", verdict: null, disagreement: null, dueAt: null, status: "active", origin: "conversation", createdAt: "2026-11-14T09:00:00Z", updatedAt: "2026-11-14T09:00:00Z", history: [{ at: "2026-11-14T09:00:00Z", change: "créée", reason: null }] };
    expect(carnetForModel([note], [{ id: "3", key: "sea-meta", name: "Camille" }])).toEqual([{ id: "41", sorte: "consigne", texte: "Plus de nouveau thème", raison: "Page à corriger", pour: "sea-meta", etat: "active", depuis: "2026-11-14" }]);
  });

  it("les règles disent qu'il peut refuser, et qu'il applique si la direction tranche", () => {
    const r = carnetRules([{ key: "sea-meta", name: "Camille" }]);
    expect(r).toMatch(/tu as le droit de dire non/);
    expect(r).toMatch(/je tranche/);
    expect(r).toContain("« sea-meta » (Camille)");
  });

  it("une consigne s'ajoute à la mission du sous-agent ; sans consigne, rien", () => {
    expect(consignesBlock([])).toBe("");
    expect(consignesBlock(["Consigne de Margaux (14 novembre) : plus de nouveau thème"])).toMatch(/LES CONSIGNES DE TON CHEF[\s\S]*- Consigne de Margaux/);
  });
});
