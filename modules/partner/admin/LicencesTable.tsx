"use client";

import { useField, useFormFields } from "@payloadcms/ui";

import { eur } from "@/modules/partner/lib/format";
import {
  LICENCE_BASE_PRICES,
  PROFILS,
  suggestedUnitPrice,
  volumeDiscountPct,
  type ProfilKey,
} from "@/modules/partner/lib/pricing";

/**
 * Tableau de saisie des licences d'un client apporté (Profil · Quantité · Prix
 * € HT · Sous-total HT). Le partenaire fixe librement les prix ; sous chaque
 * prix, un prix CONSEILLÉ (arrondi, gris, cliquable) baisse selon le volume —
 * purement indicatif. Le CA HT = Σ (qté × prix saisis), sans remise appliquée.
 */

function LicenceRow({ pKey, label, discount }: { pKey: ProfilKey; label: string; discount: number }) {
  const qty = useField<number>({ path: `licences.${pKey}Qty` });
  const price = useField<number>({ path: `licences.${pKey}Price` });
  const q = Number(qty.value ?? 0);
  const p = Number(price.value ?? 0);

  // Prix conseillé (grille TIM) : entier si ≥ 10 € (lisibilité), 2 décimales
  // si < 10 € (petits prix : Chef de chantier 9,9 · Chef d'équipe 8,8 · Compagnon 6,00…).
  const rawSuggested = discount > 0 ? suggestedUnitPrice(LICENCE_BASE_PRICES[pKey], discount) : null;
  const suggested =
    rawSuggested == null ? null : rawSuggested >= 10 ? Math.round(rawSuggested) : Math.round(rawSuggested * 100) / 100;
  const suggestedLabel =
    rawSuggested == null || suggested == null
      ? null
      : rawSuggested >= 10
        ? `${suggested} €`
        : eur.format(suggested);
  const showSuggest = suggested != null && suggested !== p;

  return (
    <tr className="lic-row">
      <td className="lic-profil">{label}</td>
      <td className="lic-num">
        <input
          type="number"
          min={0}
          inputMode="numeric"
          className="lic-input"
          placeholder="0"
          value={q === 0 ? "" : q}
          onChange={(e) => qty.setValue(e.target.value === "" ? 0 : Number(e.target.value))}
        />
      </td>
      <td className="lic-num">
        <input
          type="number"
          min={0}
          inputMode="decimal"
          className="lic-input"
          placeholder="0"
          value={p === 0 ? "" : p}
          onChange={(e) => price.setValue(e.target.value === "" ? 0 : Number(e.target.value))}
        />
        {showSuggest && (
          <button
            type="button"
            className="lic-suggest"
            title="Appliquer le prix conseillé (facultatif)"
            onClick={() => price.setValue(suggested)}
          >
            conseillé&nbsp;{suggestedLabel}
          </button>
        )}
      </td>
      <td className="lic-sub">{eur.format(q * p)}</td>
    </tr>
  );
}

export function LicencesTable() {
  const { totalQty, caHT } = useFormFields(([fields]) => {
    let tQty = 0;
    let brut = 0;
    for (const pr of PROFILS) {
      const q = Number(fields[`licences.${pr.key}Qty`]?.value ?? 0);
      const p = Number(fields[`licences.${pr.key}Price`]?.value ?? 0);
      tQty += q;
      brut += q * p;
    }
    return { totalQty: tQty, caHT: brut };
  });

  // Pilote uniquement le prix conseillé par ligne (aucune remise affichée).
  const discount = volumeDiscountPct(totalQty);

  return (
    <div className="lic-wrap">
      <table className="lic-table">
        <thead>
          <tr>
            <th>Profil</th>
            <th className="lic-num">Quantité</th>
            <th className="lic-num">Prix € HT</th>
            <th className="lic-num">Sous-total HT</th>
          </tr>
        </thead>
        <tbody>
          {PROFILS.map((pr) => (
            <LicenceRow key={pr.key} pKey={pr.key} label={pr.label} discount={discount} />
          ))}
        </tbody>
        <tfoot>
          <tr className="lic-total">
            <td>
              Total · {totalQty} licence{totalQty > 1 ? "s" : ""}
            </td>
            <td className="lic-num">{totalQty}</td>
            <td className="lic-num" />
            <td className="lic-num">{eur.format(caHT)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
