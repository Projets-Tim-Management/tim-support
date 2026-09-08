import type { Payload } from "payload";

import { deleteRow, listRows, saveRow } from "@/modules/marketing/lib/dossier-rows";
import { readImport } from "@/modules/marketing/lib/portal-csv";
import { validateRow, type PortalSection } from "@/modules/marketing/lib/portal-sections";

/**
 * L'import CSV d'une section du dossier, EN DEUX TEMPS.
 *
 * La première requête n'écrit rien : le client voit son fichier dans un tableau
 * et corrige ce qui cloche avant que sa liste ne soit touchée. Un import qui
 * écrit d'abord et explique ensuite laisse un dossier à moitié rempli dont
 * personne ne sait plus ce qu'il contient.
 *
 * La seconde reçoit les lignes TELLES QUE CORRIGÉES à l'écran, et non le
 * fichier d'origine — sinon les corrections seraient perdues.
 *
 * Écrit ici plutôt que dans une route parce qu'il y a DEUX portes : l'espace
 * client et la console de préparation. Ce qui diffère entre elles — qui est
 * autorisé, de quel client il s'agit, si le dossier est verrouillé — se règle
 * dans la route ; le traitement, lui, doit être le même, sans quoi un fichier
 * accepté d'un côté serait refusé de l'autre.
 *
 * ⚠️ Tout est revalidé ici. Le contrôle fait dans le navigateur sert le
 * confort, jamais l'autorité : rien n'empêche d'appeler la route directement.
 * L'écriture passe par `saveRow`, celle de la saisie manuelle — même liste
 * blanche de champs, même validation, même rattachement au client.
 */

/** Plafond par envoi : au-delà, c'est une reprise de données, pas une saisie. */
export const MAX_ROWS = 500;

export type ImportBody = {
  csv?: string;
  rows?: Record<string, unknown>[];
  confirmer?: boolean;
  remplacer?: boolean;
};

export type ImportOutcome = { status: number; body: Record<string, unknown> };

export async function runImport(
  payload: Payload,
  section: PortalSection,
  clientId: number | string,
  body: ImportBody | null,
): Promise<ImportOutcome> {
  // ── Écriture des lignes corrigées ────────────────────────────────────────
  if (body?.confirmer && Array.isArray(body.rows)) {
    const rows = body.rows;
    if (rows.length > MAX_ROWS) {
      return { status: 413, body: { error: "too_many_rows", max: MAX_ROWS, found: rows.length } };
    }

    /**
     * Remplacer efface AVANT d'écrire, et dans cet ordre seulement.
     *
     * L'inverse — écrire puis nettoyer — laisserait la liste en double si
     * l'exécution s'arrêtait entre les deux, et on ne saurait plus laquelle est
     * la bonne. Une liste vide un instant se répare ; une liste dédoublée se
     * démêle à la main.
     */
    let deleted = 0;
    if (body.remplacer) {
      const anciennes = await listRows(payload, section, clientId);
      for (const doc of anciennes) {
        await deleteRow(payload, section, clientId, String(doc.id));
      }
      deleted = anciennes.length;
    }

    let written = 0;
    const refused: { index: number; errors: Record<string, string> }[] = [];

    for (const [i, row] of rows.entries()) {
      const res = await saveRow(payload, section, clientId, row);
      if (res.ok) written += 1;
      else refused.push({ index: i, errors: res.errors ?? { _: "Ligne refusée." } });
    }
    return { status: 200, body: { written, refused, deleted } };
  }

  // ── Lecture ──────────────────────────────────────────────────────────────
  const csv = typeof body?.csv === "string" ? body.csv : "";
  if (!csv.trim()) return { status: 400, body: { error: "empty_file" } };

  const rapport = readImport(section, csv, validateRow);

  if (rapport.rows.length > MAX_ROWS) {
    return {
      status: 413,
      body: { error: "too_many_rows", max: MAX_ROWS, found: rapport.rows.length },
    };
  }

  // Une colonne obligatoire absente : rien n'est importable, et le dire tout de
  // suite évite de faire lire au client cinquante lignes fautives pour la même
  // raison.
  if (rapport.missingRequired.length) {
    return { status: 200, body: { ...rapport, ok: 0, ko: rapport.rows.length, written: 0 } };
  }

  return { status: 200, body: { ...rapport, written: 0 } };
}
