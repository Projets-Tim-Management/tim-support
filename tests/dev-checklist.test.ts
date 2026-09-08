import { describe, expect, it } from "vitest";

import { computeChecklistProgress, stampChecklistComments } from "@/modules/dev/hooks/checklist";

/**
 * La checklist d'une feature.
 *
 * Deux choses doivent rester vraies : un commentaire garde son auteur et sa
 * date d'origine quoi qu'il arrive ensuite à la fiche, et l'avancement affiché
 * dans la liste dit la vérité même sur une mise à jour partielle.
 */

type Hook = typeof computeChecklistProgress;
type Args = Parameters<Hook>[0];

const run = async (hook: Hook, args: Partial<Args>) =>
  (await hook({ operation: "update", ...args } as Args)) as Record<string, unknown>;

const asUser = (id: number) => ({ user: { id } }) as never;

describe("auteur et date d'un commentaire", () => {
  it("sont posés sur le commentaire qu'on vient d'écrire", async () => {
    const out = await run(stampChecklistComments, {
      data: { checklist: [{ title: "Point", comments: [{ body: "Il faut trancher le cas des demi-journées." }] }] },
      req: asUser(7),
    });
    const comment = (out.checklist as { comments: { author?: unknown; at?: unknown }[] }[])[0].comments[0];
    expect(comment.author).toBe(7);
    expect(typeof comment.at).toBe("string");
  });

  it("NE SONT PAS réécrits sur un commentaire existant", async () => {
    // Le cas qui compte : quelqu'un d'autre rouvre la feature six mois plus
    // tard et l'enregistre. Le commentaire doit rester de son auteur.
    const origine = { body: "Vu avec le client.", author: 3, at: "2026-01-05T08:00:00.000Z" };
    const out = await run(stampChecklistComments, {
      data: { checklist: [{ title: "Point", comments: [origine] }] },
      req: asUser(99),
    });
    const comment = (out.checklist as { comments: { author?: unknown; at?: unknown }[] }[])[0].comments[0];
    expect(comment.author).toBe(3);
    expect(comment.at).toBe("2026-01-05T08:00:00.000Z");
  });

  it("RETIRE une ligne de commentaire laissée vide", async () => {
    // Ligne ajoutée par mégarde puis abandonnée. Tant qu'elle survivait, elle
    // ressemblait à un message dans le fil — et, `body` étant obligatoire, elle
    // refusait l'enregistrement de la fiche sans qu'aucun écran ne permette de
    // la corriger.
    const out = await run(stampChecklistComments, {
      data: { checklist: [{ title: "Point", comments: [{ body: "   " }, { body: "Vrai message" }] }] },
      req: asUser(7),
    });
    const comments = (out.checklist as { comments: { body?: string }[] }[])[0].comments;
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toBe("Vrai message");
  });

  it("laisse la liste intacte quand tout est écrit", async () => {
    const out = await run(stampChecklistComments, {
      data: { checklist: [{ title: "P", comments: [{ body: "un" }, { body: "deux" }] }] },
      req: asUser(7),
    });
    expect((out.checklist as { comments: unknown[] }[])[0].comments).toHaveLength(2);
  });

  it("ne casse pas sur une feature sans checklist, ni sans utilisateur connu", async () => {
    expect(await run(stampChecklistComments, { data: { name: "Mobile" }, req: asUser(1) })).toEqual({ name: "Mobile" });
    const out = await run(stampChecklistComments, {
      data: { checklist: [{ title: "P", comments: [{ body: "note" }] }] },
      req: {} as never,
    });
    const comment = (out.checklist as { comments: { author?: unknown; at?: unknown }[] }[])[0].comments[0];
    expect(comment.author).toBeUndefined(); // pas d'auteur inventé
    expect(typeof comment.at).toBe("string"); // la date, elle, est certaine
  });
});

describe("avancement affiché dans la liste", () => {
  it("compte les points cochés sur le total", async () => {
    const out = await run(computeChecklistProgress, {
      data: { checklist: [{ done: true }, { done: false }, { done: true }] },
    });
    expect(out.checklistProgress).toBe("2/3");
  });

  it("reste vide quand il n'y a pas de checklist", async () => {
    // « 0/0 » se lirait comme un retard alors qu'il n'y a rien à faire.
    expect((await run(computeChecklistProgress, { data: { checklist: [] } })).checklistProgress).toBeNull();
    expect((await run(computeChecklistProgress, { data: { name: "x" } })).checklistProgress).toBeNull();
  });

  it("se reprend sur la fiche quand la mise à jour ne touche pas à la checklist", async () => {
    const out = await run(computeChecklistProgress, {
      data: { name: "Nouveau nom" },
      originalDoc: { checklist: [{ done: true }, { done: false }] },
    });
    expect(out.checklistProgress).toBe("1/2");
  });

  it("prend bien la valeur envoyée quand la checklist est vidée", async () => {
    const out = await run(computeChecklistProgress, {
      data: { checklist: [] },
      originalDoc: { checklist: [{ done: true }] },
    });
    expect(out.checklistProgress).toBeNull();
  });
});
