"use client";

import type { Ref } from "react";

/**
 * Le champ du code à six chiffres reçu par e-mail — partagé par la signature
 * client et la contresignature TIM. Seuls les chiffres passent, six au plus ;
 * l'habillage (classe) reste propre à chaque écran.
 */
export function CodeInput({
  value,
  onChange,
  className,
  inputRef,
}: {
  value: string;
  onChange: (code: string) => void;
  className?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <input
      ref={inputRef}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      aria-label="Code à 6 chiffres"
      placeholder="••••••"
    />
  );
}
