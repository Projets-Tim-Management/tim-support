import type { CollectionBeforeChangeHook } from "payload";

/**
 * Horodate et signe chaque document ajouté à un ticket.
 *
 * Une pièce déposée sans trace ne dit ni quand elle est arrivée, ni qui l'a
 * mise là — deux questions qu'on se pose systématiquement six mois plus tard,
 * devant un export de configuration dont on ne sait plus s'il précède ou suit
 * la correction.
 *
 * Seules les lignes NEUVES sont signées : réenregistrer un ticket ne réécrit
 * pas l'auteur d'un document déposé la semaine dernière, et corriger l'intitulé
 * d'une pièce n'en fait pas la sienne.
 */

type DocumentRow = {
  addedAt?: string | null;
  addedBy?: unknown;
  [k: string]: unknown;
};

export const stampDocuments: CollectionBeforeChangeHook = ({ data, req }) => {
  const rows = data?.documents as DocumentRow[] | undefined;
  if (!Array.isArray(rows) || rows.length === 0) return data;

  const now = new Date().toISOString();
  const userId = (req?.user as { id?: number | string } | undefined)?.id ?? null;

  return {
    ...data,
    documents: rows.map((row) =>
      row.addedAt
        ? row
        : {
            ...row,
            addedAt: now,
            // Un dépôt par l'API (import, reprise de données) n'a pas d'auteur :
            // mieux vaut le champ vide qu'un nom inventé.
            addedBy: row.addedBy ?? userId,
          },
    ),
  };
};
