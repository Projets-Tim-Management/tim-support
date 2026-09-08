"use client";

import { useField } from "@payloadcms/ui";

import { initialsOf, useTeam } from "@/modules/dev/admin/team";

/**
 * « Assigné à » présenté comme une rangée de VISAGES.
 *
 * Un menu déroulant demande trois gestes (ouvrir, lire, choisir) et n'affiche
 * qu'un nom une fois refermé. Une rangée d'avatars montre l'équipe entière, dit
 * qui est déjà pris sur ce point, et se répond d'un clic. On reconnaît un
 * collègue à sa tête avant de lire son nom.
 *
 * Sans photo de profil : les initiales. Au survol : le nom et l'e-mail — parce
 * que deux prénoms se ressemblent, et qu'une initiale ne suffit pas toujours.
 *
 * On en choisit AUTANT QU'ON VEUT : un travail se partage. Recliquer sur une
 * personne déjà choisie la retire — assigner et désassigner sont le même geste,
 * il n'y a pas de bouton « vider » à chercher.
 */
type Props = { path?: string; field?: { label?: unknown }; readOnly?: boolean };

export const AssigneePicker = (props: Props) => {
  const path = props.path ?? "assignee";
  const { setValue, value } = useField<(number | string)[] | number | string | null>({ path });
  const team = useTeam();
  const label = typeof props.field?.label === "string" ? props.field.label : "Assigné à";

  /**
   * Le champ est multiple, mais on lit défensivement : une fiche enregistrée
   * avant le passage au multiple porte encore une valeur simple, et elle doit
   * s'afficher plutôt que disparaître.
   */
  const chosen = (Array.isArray(value) ? value : value == null ? [] : [value]).map(String);

  return (
    <div className="field-type dev-people">
      <label className="dev-cfield__label">{label}</label>

      {team.list.length === 0 ? (
        <p className="dev-people__empty">Aucun membre d&apos;équipe à proposer.</p>
      ) : (
        <div className="dev-people__row">
          {team.list.map((member) => {
            const on = chosen.includes(member.id);
            return (
              <button
                key={member.id}
                type="button"
                className={`dev-people__btn${on ? " dev-people__btn--on" : ""}`}
                aria-pressed={on}
                aria-label={member.name}
                disabled={props.readOnly}
                // Deux lignes dans l'infobulle : le nom, puis l'e-mail qui lève
                // l'ambiguïté entre deux homonymes.
                data-tip={member.email ? `${member.name}\n${member.email}` : member.name}
                onClick={() => {
                  // `id` numérique quand c'en est un : la base attend un entier,
                  // pas la chaîne « 3 ».
                  const asId = (raw: string): number | string => {
                    const num = Number(raw);
                    return Number.isFinite(num) ? num : raw;
                  };
                  const next = on
                    ? chosen.filter((id) => id !== member.id)
                    : [...chosen, member.id];
                  setValue(next.map(asId));
                }}
              >
                {member.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={member.avatar} alt="" className="dev-people__img" />
                ) : (
                  <span className="dev-people__ini">{initialsOf(member.name)}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
