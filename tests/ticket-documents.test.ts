import { describe, expect, it } from "vitest";

import { stampDocuments } from "@/modules/support/hooks/documents";
import { ticketMediaIds } from "@/modules/support/lib/retention";

/**
 * Signature des documents d'un ticket.
 *
 * Ce qui se joue : qu'on sache, six mois plus tard, quand une pièce est arrivée
 * et qui l'a déposée — sans que réenregistrer le ticket ne réécrive l'histoire.
 */

const appel = (data: Record<string, unknown>, userId?: number | string) =>
  stampDocuments({
    data,
    req: userId == null ? {} : { user: { id: userId } },
    // Le hook n'en lit rien : Payload en fournit bien plus, on ne simule que
    // ce dont la règle dépend.
  } as never) as Record<string, unknown>;

type Row = { addedAt?: string | null; addedBy?: unknown; label?: string };

describe("stampDocuments", () => {
  it("date et signe une pièce qui vient d'être déposée", () => {
    const out = appel({ documents: [{ label: "Export config" }] }, 7);
    const doc = (out.documents as Row[])[0];
    expect(doc.addedBy).toBe(7);
    expect(Date.parse(doc.addedAt as string)).not.toBeNaN();
  });

  it("ne réécrit pas une pièce déjà signée", () => {
    // Corriger l'intitulé d'un document ne doit pas en faire le sien.
    const dépôt = { addedAt: "2026-08-01T09:00:00.000Z", addedBy: 3, label: "Capture" };
    const out = appel({ documents: [dépôt] }, 7);
    expect((out.documents as Row[])[0]).toEqual(dépôt);
  });

  it("accepte un dépôt sans auteur plutôt que d'en inventer un", () => {
    // Import, reprise de données, appel API : le champ reste vide.
    const out = appel({ documents: [{ label: "Reprise" }] });
    expect((out.documents as Row[])[0].addedBy).toBeNull();
  });

  it("laisse le ticket intact quand il n'y a aucun document", () => {
    const data = { subject: "Le pointage ne remonte pas" };
    expect(appel(data, 7)).toEqual(data);
    expect(appel({ ...data, documents: [] }, 7)).toEqual({ ...data, documents: [] });
  });

  it("ne touche pas aux autres champs du ticket", () => {
    const out = appel({ status: "in_progress", documents: [{ label: "A" }] }, 7);
    expect(out.status).toBe("in_progress");
  });
});

/**
 * Ce que la purge emporte.
 *
 * Elle supprime des fichiers pour de bon : une source oubliée, et des pièces
 * s'accumulent indéfiniment ; une source de trop, et on efface ce qu'il fallait
 * garder. Les trois sont donc énumérées à un seul endroit, et vérifiées ici.
 */
describe("ticketMediaIds", () => {
  const relId = (v: unknown): number | null =>
    typeof v === "number" ? v : ((v as { id?: number } | null)?.id ?? null);

  it("ramasse les trois sources : demande, fil, documents internes", () => {
    expect(
      ticketMediaIds(
        {
          attachments: [1],
          messages: [{ attachments: [2] }, { attachments: [3] }],
          documents: [{ file: 4 }],
        },
        relId,
      ).sort(),
    ).toEqual([1, 2, 3, 4]);
  });

  it("lit un lien déjà résolu comme un identifiant nu", () => {
    expect(ticketMediaIds({ documents: [{ file: { id: 9 } }] }, relId)).toEqual([9]);
  });

  it("ne supprime pas deux fois le même fichier", () => {
    // La même pièce peut être jointe au fil ET déposée comme document.
    expect(ticketMediaIds({ attachments: [5], documents: [{ file: 5 }] }, relId)).toEqual([5]);
  });

  it("ignore une ligne sans fichier", () => {
    expect(ticketMediaIds({ documents: [{}, { file: null }] }, relId)).toEqual([]);
  });

  it("rend une liste vide pour un ticket sans rien", () => {
    expect(ticketMediaIds({}, relId)).toEqual([]);
  });
});
