"use client";

import { useFormFields } from "@payloadcms/ui";

/**
 * L'alerte en tête de fiche quand le formulaire du site vitrine n'a pas pu
 * tout reprendre : « Adresse e-mail mal formée — « koneyayakn@gmail.cóm » ».
 *
 * La fiche existe, « Nouvelle », visible dans le Kanban : le lead n'est pas
 * perdu, mais quelque chose est à corriger avant d'écrire ou de facturer. Le
 * champ se corrige juste en dessous ; à l'enregistrement, la réserve
 * disparaît (voir clearIntakeIssues). Rien à cliquer ici — c'est un constat.
 */
type Issue = { field?: string; raw?: string; message?: string };
const FIELD_LABEL: Record<string, string> = { email: "Adresse e-mail", phone: "Téléphone" };

export function IntakeAlert() {
  const rows = useFormFields(([fields]) => fields.intakeIssues?.rows ?? []);
  const issues = useFormFields(([fields]) =>
    (fields.intakeIssues?.rows ?? []).map((_, i) => ({
      field: fields[`intakeIssues.${i}.field`]?.value as string | undefined,
      raw: fields[`intakeIssues.${i}.raw`]?.value as string | undefined,
      message: fields[`intakeIssues.${i}.message`]?.value as string | undefined,
    })) as Issue[],
  );
  if (!rows.length) return null;

  return (
    <div className="tim-intake" role="alert">
      <span className="tim-intake__icon" aria-hidden>
        !
      </span>
      <div className="tim-intake__body">
        <p className="tim-intake__title">Fiche non conforme — reprise du formulaire incomplète</p>
        <ul className="tim-intake__list">
          {issues.map((i, n) => (
            <li key={n}>
              <strong>{FIELD_LABEL[i.field ?? ""] ?? i.field}</strong> : {i.message}
              {i.raw ? (
                <>
                  {" "}
                  Saisi : <code>{i.raw}</code>
                </>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="tim-intake__hint">Corrigez le champ ci-dessous et enregistrez : l&apos;alerte disparaît d&apos;elle-même.</p>
      </div>
    </div>
  );
}
