"use client";

import { useField, useFormFields } from "@payloadcms/ui";

import { eur } from "@/modules/partner/lib/format";
import { effectiveUnitPrice, PRESTATIONS, PROFILS, type PrestationKey } from "@/modules/partner/lib/pricing";

/**
 * Le mémo des prestations ponctuelles d'un prospect (formation, développement,
 * mise en place), sous le tableau des licences : ce qu'on a évoqué pendant
 * l'appel, avec le prix du catalogue. Puis l'offre telle qu'elle se compose en
 * direct — licences par mois, prestations une fois.
 *
 * Un rappel interne : il ne part ni dans l'e-mail d'offre, ni dans le contrat,
 * et ne compte pas dans le CA mensuel (Charlie, 16/10/2026).
 */

function PrestationRow({ pKey, label, unit, base }: { pKey: PrestationKey; label: string; unit: string; base: number }) {
  const qty = useField<number>({ path: `prestations.${pKey}Qty` });
  const price = useField<number>({ path: `prestations.${pKey}Price` });
  const q = Number(qty.value ?? 0);
  const p = Number(price.value ?? 0);
  return (
    <tr className={`lic-row${q > 0 ? "" : " lic-row--idle"}`}>
      <td className="lic-profil">
        {label}
        <span className="lic-unit"> · {unit}</span>
      </td>
      <td className="lic-num">
        <input
          type="number"
          min={0}
          inputMode="decimal"
          className="lic-input"
          placeholder="0"
          aria-label={`Quantité — ${label}`}
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
          placeholder={String(base)}
          aria-label={`Prix — ${label}`}
          value={p === 0 ? "" : p}
          onChange={(e) => price.setValue(e.target.value === "" ? 0 : Number(e.target.value))}
        />
      </td>
      <td className="lic-sub">{eur.format(q * p)}</td>
    </tr>
  );
}

export function PrestationsMemo() {
  // L'offre en direct : les licences (par mois) et les prestations (une fois), recalculées à chaque frappe.
  const { monthly, once } = useFormFields(([f]) => {
    let m = 0;
    for (const pr of PROFILS) {
      const q = Number(f[`licences.${pr.key}Qty`]?.value ?? 0);
      m +=
        q *
        effectiveUnitPrice({
          price: Number(f[`licences.${pr.key}Price`]?.value ?? 0),
          discountPct: Number(f[`licences.${pr.key}DiscountPct`]?.value ?? 0),
          discountAmount: Number(f[`licences.${pr.key}DiscountAmount`]?.value ?? 0),
        });
    }
    let o = 0;
    for (const x of PRESTATIONS) o += Number(f[`prestations.${x.key}Qty`]?.value ?? 0) * Number(f[`prestations.${x.key}Price`]?.value ?? 0);
    return { monthly: m, once: o };
  });

  return (
    <div className="lic-wrap lic-wrap--memo">
      <table className="lic-table">
        <thead>
          <tr>
            <th>Prestation (mémo)</th>
            <th className="lic-num">Quantité</th>
            <th className="lic-num">Prix € HT</th>
            <th className="lic-num">Sous-total HT</th>
          </tr>
        </thead>
        <tbody>
          {PRESTATIONS.map((x) => (
            <PrestationRow key={x.key} pKey={x.key} label={x.label} unit={x.unit} base={x.price} />
          ))}
        </tbody>
        <tfoot>
          <tr className="lic-total">
            <td>Total des prestations · une fois</td>
            <td className="lic-num" />
            <td className="lic-num" />
            <td className="lic-num">{eur.format(once)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="lic-offer" aria-live="polite">
        <span>Offre en cours</span>
        <strong>{eur.format(monthly)} HT / mois</strong>
        {once > 0 && (
          <>
            <span aria-hidden>+</span>
            <strong>{eur.format(once)} HT une fois</strong>
          </>
        )}
      </p>
      <p className="lic-memo-hint">Mémo interne : les prestations ne partent ni dans l&apos;e-mail d&apos;offre, ni dans le contrat.</p>
    </div>
  );
}
