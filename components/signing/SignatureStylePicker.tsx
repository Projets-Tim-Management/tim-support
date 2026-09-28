"use client";

import type { ReactNode } from "react";

import { SIGNATURE_FONT_CLASS } from "@/components/portal/signature-fonts";
import { SIGNATURE_STYLES, type SignatureStyle } from "@/modules/partner/lib/signature-styles";

/**
 * Le choix du rendu de signature : un aperçu du nom par style, en direct.
 * Une apparence, pas une preuve — le procédé fait foi.
 *
 * Partagé par la signature client (Tailwind) et la contresignature TIM (admin) :
 * le comportement est commun, l'habillage passe par les classes et `mark`
 * (la pastille cochée côté client).
 */
export function SignatureStylePicker({
  value,
  onChange,
  name,
  className,
  itemClassName,
  nameClassName,
  mark,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: {
  value: SignatureStyle;
  onChange: (style: SignatureStyle) => void;
  /** Le nom affiché dans chaque aperçu. */
  name: string;
  className?: string;
  itemClassName: (on: boolean) => string;
  nameClassName?: string;
  mark?: (on: boolean) => ReactNode;
  /** Nom du groupe pour les lecteurs d'écran (ou l'id du titre visible). */
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  return (
    <div className={className} role="radiogroup" aria-label={ariaLabel} aria-labelledby={ariaLabelledBy}>
      {SIGNATURE_STYLES.map((st) => {
        const on = value === st.key;
        return (
          <button
            key={st.key}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`Signature ${st.label.toLowerCase()}`}
            onClick={() => onChange(st.key)}
            className={itemClassName(on)}
          >
            <span className={`${SIGNATURE_FONT_CLASS[st.key]}${nameClassName ? ` ${nameClassName}` : ""}`}>{name}</span>
            {mark?.(on)}
          </button>
        );
      })}
    </div>
  );
}
