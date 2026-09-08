"use client";

import { useMemo, useState } from "react";

import { convertCell, type ImportedRow } from "@/modules/marketing/lib/portal-csv";
import {
  fieldRequired,
  validateRow,
  type PortalField,
  type PortalSection,
} from "@/modules/marketing/lib/portal-sections";

/**
 * Le fichier importé, présenté comme un tableau à corriger.
 *
 * POURQUOI PAS UN RAPPORT. Dire « ligne 7 : nationalité inconnue » oblige le
 * client à rouvrir son tableur, retrouver la ligne, corriger, réenregistrer,
 * redéposer — cinq gestes pour une faute de frappe. Ici il la corrige sur place
 * et le rouge disparaît.
 *
 * Le bouton de validation reste fermé tant qu'une case est en erreur : on ne
 * veut ni écrire à moitié, ni laisser croire que tout est passé.
 *
 * ⚠️ Les contrôles faits ici servent le CONFORT. L'autorité reste au serveur,
 * qui revalide tout — ce composant n'est qu'un écran.
 */

export type Ligne = { line: number; raw: Record<string, string> };

/** Ce qu'une ligne donne une fois convertie : valeurs prêtes, et fautes restantes. */
export function evaluer(
  section: PortalSection,
  champs: PortalField[],
  raw: Record<string, string>,
): { data: Record<string, unknown>; errors: Record<string, string> } {
  const data: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const f of champs) {
    const { value, error } = convertCell(f, raw[f.name] ?? "");
    if (error) errors[f.name] = error;
    else data[f.name] = value;
  }
  for (const [name, message] of Object.entries(validateRow(section, data))) {
    if (!errors[name]) errors[name] = message;
  }
  return { data, errors };
}

export const ligneDepuis = (r: ImportedRow): Ligne => ({ line: r.line, raw: { ...r.raw } });

/**
 * Ce qu'on attend dans la case, et rien d'autre.
 *
 * L'infobulle ne répète pas la faute : le fond rouge la signale déjà. Elle
 * répond à la seule question qui reste — qu'est-ce que j'écris ici ? Pour une
 * liste, ça veut dire les valeurs, toutes : en tronquer une est exactement
 * celle que le client cherchait.
 */
function attendu(f: PortalField): string {
  if (f.options?.length) return f.options.map((o) => o.label).join(", ");
  switch (f.type) {
    case "date":
      return "Une date au format jj/mm/aaaa.";
    case "email":
      return "Une adresse e-mail, par exemple prenom.nom@exemple.fr";
    case "tel":
      return "Un numéro de téléphone, par exemple 06 12 34 56 78";
    case "number":
      return "Un nombre.";
    case "checkbox":
      return "oui ou non.";
    default:
      return f.placeholder ? `Par exemple : ${f.placeholder}` : "Du texte libre.";
  }
}

export default function ImportGrid({
  section,
  champs,
  lignes,
  onChange,
  onRemove,
}: {
  section: PortalSection;
  champs: PortalField[];
  lignes: Ligne[];
  onChange: (index: number, field: string, value: string) => void;
  onRemove: (index: number) => void;
}) {
  const verdicts = useMemo(
    () => lignes.map((l) => evaluer(section, champs, l.raw)),
    [lignes, section, champs],
  );

  /**
   * L'infobulle est positionnée À L'ÉCRAN, pas dans la cellule.
   *
   * Placée dans le tableau, elle était rognée : le conteneur défile
   * horizontalement, et une boîte qui déborde d'un élément à défilement est
   * coupée sur les DEUX axes — impossible de la faire dépasser vers le bas.
   * Ce qu'on voyait après une seconde n'était pas elle, mais l'infobulle du
   * navigateur, qui a ce délai par construction.
   */
  const [bulle, setBulle] = useState<{ x: number; y: number; aide: string } | null>(null);

  const montrer = (el: HTMLElement, aide: string) => {
    const r = el.getBoundingClientRect();
    setBulle({ x: r.left, y: r.bottom + 6, aide });
  };

  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface text-left">
            <th className="w-12 px-2 py-2 text-xs font-semibold text-muted" title="Ligne du fichier">
              Ligne
            </th>
            {champs.map((f) => (
              <th
                key={f.name}
                className="min-w-[9rem] whitespace-nowrap px-3 py-2 font-semibold text-foreground"
              >
                {f.label}
                {f.required && <span className="text-primary"> *</span>}
              </th>
            ))}
            <th className="w-10 px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne, i) => {
            const { errors } = verdicts[i];
            return (
              <tr key={ligne.line} className="border-b border-border last:border-b-0">
                <td className="px-2 py-2 text-center text-xs text-muted">{ligne.line}</td>

                {champs.map((f) => {
                  const faute = errors[f.name];
                  return (
                    <td key={f.name} className="border-l border-border p-0 align-middle">
                      <input
                        value={ligne.raw[f.name] ?? ""}
                        onChange={(e) => onChange(i, f.name, e.target.value)}
                        aria-invalid={Boolean(faute)}
                        onMouseEnter={(e) => faute && montrer(e.currentTarget, attendu(f))}
                        onMouseLeave={() => setBulle(null)}
                        onFocus={(e) => faute && montrer(e.currentTarget, attendu(f))}
                        onBlur={() => setBulle(null)}
                        placeholder={
                          fieldRequired(f, {}) ? "Obligatoire" : (f.placeholder ?? "")
                        }
                        /**
                         * UNE SEULE classe de fond, jamais deux.
                         * `bg-transparent` et `bg-danger-bg` écrites ensemble
                         * laissaient Tailwind trancher selon l'ordre de sa
                         * feuille, pas selon la condition : le rouge ne
                         * s'affichait pas.
                         */
                        className={`w-full px-3 py-2 text-sm text-foreground outline-none ${
                          faute
                            ? "bg-danger-bg font-medium focus:bg-danger-bg"
                            : "bg-transparent focus:bg-primary-light"
                        }`}
                      />

                    </td>
                  );
                })}

                <td className="border-l border-border px-2 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
                    className="text-muted transition hover:text-primary"
                    aria-label={`Retirer la ligne ${ligne.line}`}
                    title="Retirer cette ligne de l'import"
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Rendue à la racine du composant, en position fixe : hors d'atteinte du
          défilement du tableau, et affichée SANS délai — c'est tout l'intérêt
          de ne pas s'en remettre à l'attribut `title`. */}
      {bulle && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 max-h-64 w-72 overflow-y-auto rounded-md bg-foreground px-3 py-2 text-xs leading-relaxed text-white shadow-lg"
          style={{ left: bulle.x, top: bulle.y }}
        >
          {bulle.aide}
        </div>
      )}
    </div>
  );
}
