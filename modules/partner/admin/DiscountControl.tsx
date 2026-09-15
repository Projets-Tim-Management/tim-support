"use client";

import { useEffect, useRef, useState } from "react";

import { eur } from "@/modules/partner/lib/format";
import { effectiveUnitPrice } from "@/modules/partner/lib/pricing";

/**
 * Remise facultative sur une ligne de licences, SUR LA MÊME LIGNE que le prix.
 *
 * Un bouton « ⋮ » à côté du prix ouvre un petit menu — « Remise en % »,
 * « Remise en € » (par licence), et « Retirer la remise » quand il y en a une.
 * Le choix fait apparaître, à droite, le champ de valeur avec son unité, puis
 * le prix effectif. Fermé, il ne reste que le bouton : presque aucune ligne
 * n'a de remise, elle ne doit rien peser.
 *
 * Une seule remise par ligne : changer d'unité repart de zéro.
 */

export type DiscountValue = { pct: number; amount: number };

type Props = {
  price: number;
  value: DiscountValue;
  onChange: (next: DiscountValue) => void;
  disabled?: boolean;
};

type Unit = "pct" | "amount";

const KebabIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
);

export function DiscountControl({ price, value, onChange, disabled }: Props) {
  const active = value.pct > 0 || value.amount > 0;
  // L'unité ouverte tant que la valeur est à zéro ; dès qu'une valeur existe,
  // c'est elle qui dit l'unité (y compris venue de « Aligner sur Pennylane »).
  const [opened, setOpened] = useState<Unit | null>(null);
  const unit: Unit | null = value.amount > 0 ? "amount" : value.pct > 0 ? "pct" : opened;
  const [menu, setMenu] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);

  // Le menu se ferme au clic ailleurs ou sur Échap.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const choose = (u: Unit) => {
    setMenu(false);
    if (u !== unit) onChange({ pct: 0, amount: 0 });
    setOpened(u);
  };
  const clear = () => {
    setMenu(false);
    onChange({ pct: 0, amount: 0 });
    setOpened(null);
  };

  const current = unit === "pct" ? value.pct : value.amount;
  const effective = effectiveUnitPrice({ price, discountPct: value.pct, discountAmount: value.amount });

  return (
    <>
      {unit && (
        <>
          <span className="lic-discount__minus">−</span>
          <input
            type="number"
            min={0}
            max={unit === "pct" ? 100 : undefined}
            step="any"
            inputMode="decimal"
            className="lic-input lic-input--sm"
            placeholder="0"
            disabled={disabled}
            value={current === 0 ? "" : current}
            onChange={(e) => {
              const n = e.target.value === "" ? 0 : Math.max(0, Number(e.target.value));
              onChange(unit === "pct" ? { pct: Math.min(100, n), amount: 0 } : { pct: 0, amount: n });
            }}
          />
          <span className="lic-discount__unit">{unit === "pct" ? "%" : "€"}</span>
          {active && <span className="lic-discount__net">= {eur.format(effective)}</span>}
        </>
      )}
      <span className="lic-discount__menu" ref={wrap}>
        <button
          type="button"
          className={`lic-discount__kebab${active ? " lic-discount__kebab--on" : ""}`}
          title="Remise sur cette ligne"
          aria-haspopup="menu"
          aria-expanded={menu}
          disabled={disabled}
          onClick={() => setMenu((m) => !m)}
        >
          <KebabIcon />
        </button>
        {menu && (
          <span className="lic-discount__pop" role="menu">
            <button type="button" role="menuitem" onClick={() => choose("amount")}>
              Remise en €
            </button>
            <button type="button" role="menuitem" onClick={() => choose("pct")}>
              Remise en %
            </button>
            {unit && (
              <button type="button" role="menuitem" className="lic-discount__pop-danger" onClick={clear}>
                Retirer la remise
              </button>
            )}
          </span>
        )}
      </span>
    </>
  );
}
