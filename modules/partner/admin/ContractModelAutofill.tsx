"use client";

import { useField, useFormFields } from "@payloadcms/ui";
import { useEffect, useRef } from "react";

/**
 * Pré-remplissage LIVE côté fiche partenaire (onglet « Contrat & programme ») :
 * dès qu'on choisit le « Modèle de partenariat », les champs « Commission (%) »
 * et « Durée de commission » se remplissent selon le barème — modifiables ensuite.
 *
 * On n'agit QUE sur un changement réel du modèle (pas au chargement) → on
 * n'écrase jamais une valeur existante à l'ouverture de la fiche. Ne rend rien.
 * Barème dupliqué ici (miroir de MODEL_RATE / MODEL_DURATION dans Partners.ts).
 */

const MODEL_RATE: Record<string, number> = {
  "apporteur-affaires": 15,
  revendeur: 25,
  "revendeur-sav": 40,
};
const MODEL_DURATION: Record<string, string> = {
  "apporteur-affaires": "24m",
  revendeur: "24m",
  "revendeur-sav": "vie",
};

export function ContractModelAutofill() {
  const model = useFormFields(
    ([fields]) => (fields?.partnershipModel?.value as string | undefined) ?? undefined,
  );
  const rate = useField<number>({ path: "commissionRate" });
  const duration = useField<string>({ path: "commissionDuration" });

  const prevModel = useRef<string | undefined>(undefined);
  const mounted = useRef(false);

  useEffect(() => {
    // Premier rendu : on mémorise le modèle courant sans rien écraser.
    if (!mounted.current) {
      mounted.current = true;
      prevModel.current = model;
      return;
    }
    if (model === prevModel.current) return;
    prevModel.current = model;
    if (model && model in MODEL_RATE) {
      rate.setValue(MODEL_RATE[model]);
      duration.setValue(MODEL_DURATION[model]);
    }
    // rate/duration exclus des deps : on ne réagit qu'au changement de modèle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  return null;
}
