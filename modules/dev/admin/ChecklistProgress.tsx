"use client";

import { useFormFields } from "@payloadcms/ui";

/**
 * Avancement de la checklist, au-dessus de la liste des points.
 *
 * Lu depuis l'état du FORMULAIRE et non depuis la fiche enregistrée : cocher un
 * point doit faire bouger la barre tout de suite.
 *
 * ⚠️ Piège Payload : sur un champ `array`, `useField` ne renvoie PAS les lignes
 * mais leur NOMBRE (la valeur du champ est un compte, les lignes vivent dans
 * `rows` et chaque sous-champ a son propre chemin). Une première version lisait
 * `value` comme un tableau : elle n'a jamais rien affiché.
 *
 * On s'abonne donc aux valeurs `checklist.N.done`, et on les réduit à une
 * CHAÎNE (« 1011 ») : le sélecteur renvoie alors la même valeur tant que rien
 * ne change, ce qui évite de rendre à chaque frappe ailleurs dans la fiche.
 */
export const ChecklistProgress = () => {
  const flags = useFormFields(([fields]) => {
    const rows = (fields?.checklist as { rows?: unknown[] } | undefined)?.rows ?? [];
    return rows.map((_, i) => (fields?.[`checklist.${i}.done`]?.value ? "1" : "0")).join("");
  });

  const total = flags?.length ?? 0;
  if (total === 0) return null;

  const done = (flags.match(/1/g) ?? []).length;
  const pct = Math.round((done / total) * 100);

  return (
    <div className="dev-progress dev-progress--main">
      <div
        className="dev-progress__bar"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className="dev-progress__fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="dev-progress__text">
        {pct} %
        <span className="dev-progress__detail">
          {done}/{total} {done === total ? "— terminé" : "faits"}
        </span>
      </span>
    </div>
  );
};
