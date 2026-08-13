"use client";

import { useForm } from "@payloadcms/ui";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Enregistre le document APRÈS que les champs modifiés soient réellement entrés
 * dans l'état du formulaire.
 *
 * `dispatchFields` passe par un `useReducer` : le nouvel état n'existe qu'au
 * rendu suivant. Or `submit()` lit l'état du formulaire au moment de l'appel
 * (`contextRef.current.fields`, affecté pendant le rendu du `Form`). Enchaîner
 * les deux dans le même gestionnaire de clic enregistre donc le document TEL
 * QU'IL ÉTAIT : la modification qu'on vient de faire est perdue, et l'écran
 * donne l'impression que le clic n'a rien fait.
 *
 * Le bug était intermittent, ce qui le rendait difficile à voir : `submit()`
 * commence par valider le formulaire de façon asynchrone, et ce détour laissait
 * PARFOIS à React le temps de committer le rendu avant la lecture des champs.
 * Une fois sur deux, la validation « prenait ».
 *
 * On force donc le passage par un rendu : un compteur déclenche l'envoi dans un
 * effet, exécuté après le commit — quand les champs sont à jour, toujours.
 */
export function useSaveAfterDispatch(): () => void {
  const { submit } = useForm();
  const [tick, setTick] = useState(0);

  // `submit` change d'identité à chaque rendu du formulaire : le garder dans une
  // ref évite que l'effet ne se redéclenche et n'enregistre en boucle. La ref
  // est mise à jour dans un effet (jamais pendant le rendu) ; les effets
  // s'exécutant dans l'ordre de déclaration, elle est à jour quand le second lit.
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });

  useEffect(() => {
    if (tick === 0) return; // premier rendu : rien à enregistrer
    void submitRef.current();
  }, [tick]);

  return useCallback(() => setTick((n) => n + 1), []);
}
