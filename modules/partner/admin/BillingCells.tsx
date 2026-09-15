import type { PaymentState } from "@/modules/partner/lib/billing-check";
import { eur, round2 } from "@/modules/partner/lib/format";

/**
 * Cellules communes aux tableaux de rapprochement (lecture et édition) : un
 * écart de quantité, un prix unitaire. Sans état, sans dépendance — importables
 * des deux côtés sans boucle.
 */

/** Un écart de quantité : signé, coloré, ou un tiret quand tout va bien. */
export function Diff({ n }: { n: number }) {
  if (n === 0) return <span className="bil-diff bil-diff--zero">—</span>;
  return (
    <span className={`bil-diff ${n > 0 ? "bil-diff--plus" : "bil-diff--minus"}`}>
      {n > 0 ? `+${n}` : n}
    </span>
  );
}

/**
 * Un prix unitaire, remise déduite. Quand une remise existe, le prix avant
 * remise est rappelé en dessous : « 0,00 € » seul ne dirait pas qu'une licence
 * à 18 € est offerte.
 */
export function Price({
  value,
  list,
  mixed,
  flag,
}: {
  value: number | null;
  /** Prix avant remise, si différent de `value`. */
  list?: number | null;
  mixed?: boolean;
  flag?: boolean;
}) {
  if (mixed) return <span className="bil-price bil-price--flag">plusieurs prix</span>;
  if (value == null) return <span className="bil-price bil-price--none">—</span>;
  const discounted = list != null && round2(list) !== round2(value);
  return (
    <span className={`bil-price${flag ? " bil-price--flag" : ""}`}>
      {eur.format(value)}
      {discounted && <span className="bil-price__list">{eur.format(list)} avant remise</span>}
    </span>
  );
}

/**
 * La quantité Pennylane d'un profil, et son détail quand elle vient de
 * plusieurs lignes (un groupe facturé par entité) : « 2 Échafaudage · 5 Maçonnerie ».
 */
export function PlQty({ qty, lines }: { qty: number; lines: { qty: number; note: string }[] }) {
  return (
    <span className="bil-plqty">
      {qty}
      {lines.length > 1 && (
        <span className="bil-plqty__lines">
          {lines.map((l, i) => (
            <span key={i}>
              {l.qty} {l.note || "sans mention"}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

export const PAYMENT_LABEL: Record<PaymentState, string> = {
  payee: "Payée",
  partielle: "Partiellement payée",
  retard: "En retard",
  "a-echoir": "À échoir",
  annulee: "Annulée",
  autre: "—",
};

/** L'état d'une facture en une pastille : vert payée, rouge en retard, gris à échoir. */
export function PaymentBadge({ state, lateDays }: { state: PaymentState; lateDays?: number }) {
  return (
    <span className={`bil-pay bil-pay--${state}`}>
      {PAYMENT_LABEL[state]}
      {state === "retard" && lateDays ? ` · ${lateDays} j` : ""}
    </span>
  );
}
