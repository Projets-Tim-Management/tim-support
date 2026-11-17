"use client";

import { useField, useFormFields } from "@payloadcms/ui";

import { DiscountControl } from "@/modules/partner/admin/DiscountControl";
import { eur } from "@/modules/partner/lib/format";
import {
  adminPriceForModules,
  ANNUAL_DISCOUNT_PCT,
  annualOffer,
  effectiveUnitPrice,
  isAnnualBilling,
  LICENCE_BASE_PRICES,
  MODULES,
  type ModuleChoice,
  PROFILS,
  suggestedUnitPrice,
  OUT_OF_VOLUME,
  volumeDiscountPct,
  type ProfilKey,
} from "@/modules/partner/lib/pricing";

/**
 * Tableau de saisie des licences d'un client apporté (Profil · Quantité · Prix
 * € HT · Sous-total HT). Le partenaire fixe librement les prix ; sous chaque
 * prix, un prix CONSEILLÉ (arrondi, gris, cliquable) baisse selon le volume —
 * purement indicatif. Le CA HT = Σ (qté × prix saisis), sans remise appliquée.
 *
 * Au-dessus, les MODULES pris (16/11/2026) : cochés pendant le rendez-vous, ils posent le prix de l'Admin (29 / 39 / 9 €)
 * et la ligne Magasinier (Stock) ; « Paiement annuel » passe la facturation à l'année : −10 % sur tout l'abonnement,
 * dans le CA de la fiche comme dans les commissions.
 */

/** Les modules et le paiement annuel, en pastilles. Cocher règle les lignes Admin et Magasinier. */
function ModulesBar() {
  const planning = useField<boolean>({ path: "licences.modulePlanning" });
  const pointage = useField<boolean>({ path: "licences.modulePointage" });
  const stock = useField<boolean>({ path: "licences.moduleStock" });
  // Le paiement annuel EST la périodicité de facturation « annuelle » : une seule information, la même partout.
  const period = useField<string>({ path: "billingPeriod" });
  const annual = isAnnualBilling(period.value);
  const adminQty = useField<number>({ path: "licences.adminQty" });
  const adminPrice = useField<number>({ path: "licences.adminPrice" });
  const magQty = useField<number>({ path: "licences.magasinierQty" });
  const magPrice = useField<number>({ path: "licences.magasinierPrice" });
  const fields = { planning, pointage, stock };
  const current: ModuleChoice = { planning: planning.value === true, pointage: pointage.value === true, stock: stock.value === true };

  const toggle = (key: keyof typeof fields) => {
    const next = { ...current, [key]: !current[key] };
    fields[key].setValue(next[key]);
    const price = adminPriceForModules(next);
    // Plus aucun module : l'Admin revient au prix de toujours.
    adminPrice.setValue(price ?? LICENCE_BASE_PRICES.admin);
    if (price != null && !Number(adminQty.value)) adminQty.setValue(1);
    if (key === "stock") {
      if (next.stock) {
        // Un magasinier compté d'office ; on en ajoute d'autres dans le tableau.
        if (!Number(magQty.value)) magQty.setValue(1);
        if (!Number(magPrice.value)) magPrice.setValue(LICENCE_BASE_PRICES.magasinier);
      } else magQty.setValue(0);
    }
  };

  return (
    <div className="lic-modules" role="group" aria-label="Modules de l'offre">
      <span className="lic-modules__label">Modules</span>
      {MODULES.map((m) => (
        <button
          key={m.key}
          type="button"
          className={`lic-chip${current[m.key] ? " is-on" : ""}`}
          aria-pressed={current[m.key]}
          onClick={() => toggle(m.key)}
        >
          <span aria-hidden>{current[m.key] ? "✓" : m.icon}</span> {m.label}
        </button>
      ))}
      <span className="lic-modules__sep" aria-hidden />
      <button
        type="button"
        className={`lic-chip lic-chip--annual${annual ? " is-on" : ""}`}
        aria-pressed={annual}
        title="Règle aussi la périodicité de facturation (annuelle / mensuelle)"
        onClick={() => period.setValue(annual ? "mensuelle" : "annuelle")}
      >
        <span aria-hidden>{annual ? "✓" : "🗓️"}</span> Paiement annuel −{ANNUAL_DISCOUNT_PCT} %
      </button>
    </div>
  );
}

function LicenceRow({ pKey, label, discount, base }: { pKey: ProfilKey; label: string; discount: number; base: number }) {
  const qty = useField<number>({ path: `licences.${pKey}Qty` });
  const price = useField<number>({ path: `licences.${pKey}Price` });
  const discountPct = useField<number>({ path: `licences.${pKey}DiscountPct` });
  const discountAmount = useField<number>({ path: `licences.${pKey}DiscountAmount` });
  const q = Number(qty.value ?? 0);
  const p = Number(price.value ?? 0);
  const dPct = Number(discountPct.value ?? 0);
  const dAmt = Number(discountAmount.value ?? 0);
  const net = effectiveUnitPrice({ price: p, discountPct: dPct, discountAmount: dAmt });

  // Prix conseillé (grille TIM) : entier si ≥ 10 € (lisibilité), 2 décimales
  // si < 10 € (petits prix : Chef de chantier 9,9 · Chef d'équipe 8,8 · Compagnon 6,00…).
  const rawSuggested = discount > 0 ? suggestedUnitPrice(base, discount) : null;
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
        <span className="lic-price">
          <input
            type="number"
            min={0}
            inputMode="decimal"
            className="lic-input"
            placeholder="0"
            value={p === 0 ? "" : p}
            onChange={(e) => price.setValue(e.target.value === "" ? 0 : Number(e.target.value))}
          />
          {/* Remise sur la ligne (facultative) : % ou € par licence, comme dans Pennylane. */}
          <DiscountControl
            price={p}
            value={{ pct: dPct, amount: dAmt }}
            onChange={(d) => {
              discountPct.setValue(d.pct);
              discountAmount.setValue(d.amount);
            }}
          />
        </span>
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
      <td className="lic-sub">{eur.format(q * net)}</td>
    </tr>
  );
}

export function LicencesTable() {
  const { totalQty, volume, caHT, modules, annual, magasinierQty } = useFormFields(([fields]) => {
    let tQty = 0;
    let vQty = 0;
    let brut = 0;
    for (const pr of PROFILS) {
      const q = Number(fields[`licences.${pr.key}Qty`]?.value ?? 0);
      const net = effectiveUnitPrice({
        price: Number(fields[`licences.${pr.key}Price`]?.value ?? 0),
        discountPct: Number(fields[`licences.${pr.key}DiscountPct`]?.value ?? 0),
        discountAmount: Number(fields[`licences.${pr.key}DiscountAmount`]?.value ?? 0),
      });
      tQty += q;
      if (!OUT_OF_VOLUME.has(pr.key)) vQty += q;
      brut += q * net;
    }
    const m: ModuleChoice = Object.fromEntries(MODULES.map((x) => [x.key, fields[`licences.${x.field}`]?.value === true]));
    return {
      totalQty: tQty,
      volume: vQty,
      caHT: brut,
      modules: m,
      annual: isAnnualBilling(fields.billingPeriod?.value as string | undefined),
      magasinierQty: Number(fields["licences.magasinierQty"]?.value ?? 0),
    };
  });

  // Pilote uniquement le prix conseillé par ligne (aucune remise affichée).
  // Le palier se compte hors licences Visuel (voir OUT_OF_VOLUME).
  const discount = volumeDiscountPct(volume);
  // Le prix de base de l'Admin suit les modules cochés (29 / 39 / 9 €) ; sans module, celui de toujours.
  const baseOf = (k: ProfilKey) => (k === "admin" ? (adminPriceForModules(modules) ?? LICENCE_BASE_PRICES.admin) : LICENCE_BASE_PRICES[k]);
  // La ligne Magasinier n'existe qu'avec le module Stock (ou si une fiche en compte déjà).
  const shown = PROFILS.filter((pr) => pr.key !== "magasinier" || modules.stock || magasinierQty > 0);
  const year = annualOffer(caHT);

  return (
    <div className="lic-wrap">
      <ModulesBar />
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
          {shown.map((pr) => (
            <LicenceRow key={pr.key} pKey={pr.key} label={pr.label} discount={discount} base={baseOf(pr.key)} />
          ))}
        </tbody>
        <tfoot>
          <tr className="lic-total">
            <td>
              Total · {totalQty} licence{totalQty > 1 ? "s" : ""}
              {annual && <span className="lic-total__hint"> · par mois</span>}
            </td>
            <td className="lic-num">{totalQty}</td>
            <td className="lic-num" />
            <td className="lic-num">{eur.format(caHT)}</td>
          </tr>
          {annual && caHT > 0 && (
            <>
              <tr className="lic-annual">
                <td colSpan={3}>Paiement annuel −{ANNUAL_DISCOUNT_PCT} % (sur tout l&apos;abonnement)</td>
                <td className="lic-num">−{eur.format(year.saving)}</td>
              </tr>
              <tr className="lic-annual lic-annual--total">
                <td colSpan={3}>
                  Soit {eur.format(year.monthly)} HT / mois, réglé à l&apos;année
                </td>
                <td className="lic-num">{eur.format(year.yearly)} / an</td>
              </tr>
            </>
          )}
        </tfoot>
      </table>
    </div>
  );
}
