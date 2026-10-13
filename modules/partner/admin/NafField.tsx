"use client";

import { TextInput, useField } from "@payloadcms/ui";
import type { ChangeEvent } from "react";

import { nafLabel, normalizeNaf } from "@/modules/partner/lib/naf";

/**
 * Code NAF de la fiche. Taper dans le champ, c'est une saisie : la source
 * passe à « manuel » au même geste (la recherche INSEE, elle, pose « insee »
 * sans passer par ce champ). Le libellé s'affiche dessous pendant qu'on tape,
 * pour voir tout de suite si le code est le bon métier.
 */
export function NafField() {
  const naf = useField<string>({ path: "naf" });
  const source = useField<string | null>({ path: "nafSource" });

  const value = naf.value ?? "";
  const label = nafLabel(value);
  const typed = value.trim() !== "";

  let hint: string;
  if (!typed) hint = "Rempli par la recherche INSEE, ou à saisir (ex. 43.22A).";
  else if (!normalizeNaf(value)) hint = "Forme attendue : 2 chiffres, point, 2 chiffres, une lettre (43.22A).";
  else if (!label) hint = "Ce code n'existe pas dans la NAF rév. 2.";
  else hint = `${label} — ${source.value === "insee" ? "d'après l'INSEE" : "saisi à la main"}`;

  return (
    <div className="tim-naf">
      <TextInput
        path="naf"
        label="Code NAF"
        placeholder="43.22A"
        value={value}
        showError={naf.showError}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          naf.setValue(e.target.value);
          source.setValue(e.target.value.trim() ? "manuel" : null);
        }}
      />
      <p className={`tim-naf__hint${typed && !label ? " tim-naf__hint--error" : ""}`}>{hint}</p>
    </div>
  );
}
