"use client";

import { useCallback, useState } from "react";

/**
 * Les champs remplis d'un document à signer : identifiant → horodatage du clic.
 * Un clic remplit, un second annule — la même règle côté client et côté TIM.
 */
export function useClickedFields() {
  const [clicked, setClicked] = useState<Record<string, string>>({});
  const toggleField = useCallback(
    (id: string) =>
      setClicked((c) => {
        const next = { ...c };
        if (next[id]) delete next[id];
        else next[id] = new Date().toISOString();
        return next;
      }),
    [],
  );
  /** Tout effacer : le document a changé, les clics d'avant ne valent plus. */
  const resetFields = useCallback(() => setClicked({}), []);
  return { clicked, toggleField, resetFields };
}
