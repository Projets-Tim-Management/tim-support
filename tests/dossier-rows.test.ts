import { describe, expect, it, vi } from "vitest";

import { saveRow } from "@/modules/marketing/lib/dossier-rows";
import { sectionByKey } from "@/modules/marketing/lib/portal-sections";

/**
 * Écriture d'une ligne du dossier de démarrage.
 *
 * Le point contrôlé ici est un seul : un refus de la base est une RÉPONSE, pas
 * une panne. La collection valide des choses que le registre ne connaît pas —
 * l'âge minimum d'un salarié, le format d'un téléphone — et Payload signale ces
 * refus en levant. Laisser l'exception traverser donnait un 500 : « erreur
 * serveur » à l'écran là où il fallait lire le motif, et, à l'import, une seule
 * ligne fautive qui emportait tout le fichier.
 */

const salaries = sectionByKey("salaries")!;
const ligne = { company: "BTP Sud", firstName: "Luis", lastName: "Martin" };

/** Une exception de validation telle que Payload la lève. */
const validationError = () =>
  Object.assign(new Error("The following field is invalid: birthDate"), {
    name: "ValidationError",
    data: { errors: [{ path: "birthDate", message: "Le salarié doit avoir au moins 16 ans." }] },
  });

describe("enregistrement d'une ligne", () => {
  it("rend le motif du refus au lieu de laisser passer l'exception", async () => {
    const payload = { create: vi.fn().mockRejectedValue(validationError()) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await saveRow(payload as any, salaries, 1, ligne);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(422);
    expect(res.errors?.birthDate).toContain("16 ans");
  });

  it("reste un 500 — mais parlant — pour ce qu'on ne sait pas traduire", async () => {
    // Une panne de base n'est pas une faute du client : on ne la déguise pas en
    // erreur de saisie, mais on n'affiche pas non plus une page blanche.
    const payload = { create: vi.fn().mockRejectedValue(new Error("connection terminated")) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await saveRow(payload as any, salaries, 1, ligne);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(500);
    expect(res.errors?._).toContain("connection terminated");
  });

  it("n'appelle même pas la base quand le registre refuse déjà la ligne", async () => {
    const payload = { create: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await saveRow(payload as any, salaries, 1, { firstName: "Luis" });

    expect(res.ok).toBe(false);
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("rapporte le refus d'une mise à jour par lot, qui ne lève pas", async () => {
    // `payload.update({ where })` renvoie ses erreurs au lieu de les lever :
    // lire `docs[0]` sans regarder `errors` faisait passer un refus pour un
    // enregistrement réussi.
    const payload = {
      update: vi.fn().mockResolvedValue({ docs: [], errors: [{ message: "Téléphone invalide." }] }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await saveRow(payload as any, salaries, 1, { ...ligne, id: 7 });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(422);
    expect(res.errors?._).toBe("Téléphone invalide.");
  });
});
