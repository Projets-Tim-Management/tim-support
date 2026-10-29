"use client";

import { FieldLabel, useField } from "@payloadcms/ui";

import { FEATURE_PROFILES } from "@/modules/editorial/lib/feature-profiles";

/**
 * « Pour qui ? » en cases à cocher, avec « Tous les profils » en tête.
 *
 * La liste déroulante à choix multiple obligeait à ajouter les six profils un
 * par un pour dire « tout le monde ». « Tous » coche les six d'un coup — c'est
 * la même valeur en base (les six profils), aucune valeur spéciale à gérer.
 * Rien de coché reste possible et veut dire la même chose : la fiche concerne
 * tout le monde.
 */
const ALL = FEATURE_PROFILES.map((p) => p.value as string);

/**
 * Les pastilles elles-mêmes, contrôlées : le champ de la fiche et la fenêtre
 * « Rédiger avec Claude » choisissent les profils de la même façon.
 */
export function ProfilePills({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const all = ALL.every((v) => value.includes(v));
  // Toujours dans l'ordre de la liste : la fiche ne change pas selon l'ordre des clics.
  const toggle = (v: string, on: boolean) => onChange(ALL.filter((x) => (x === v ? on : value.includes(x))));

  // Des PASTILLES sur deux colonnes plutôt qu'une liste de cases : la colonne
  // de droite est étroite, et un choix se lit mieux quand il se voit allumé.
  const pill = (active: boolean, extra = "") => `fw-pill${active ? " is-active" : ""}${extra}`;

  return (
    <div className="fw-pills" role="group" aria-label="Profils concernés">
      <button
        type="button"
        className={pill(all, " fw-pill--all")}
        aria-pressed={all}
        disabled={disabled}
        onClick={() => onChange(all ? [] : ALL)}
      >
        <span className="fw-pill__mark" aria-hidden>
          {all ? "✓" : ""}
        </span>
        Tous les profils
      </button>
      {FEATURE_PROFILES.map((p) => {
        const on = value.includes(p.value);
        return (
          <button
            key={p.value}
            type="button"
            className={pill(on)}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => toggle(p.value, !on)}
          >
            <span className="fw-pill__mark" aria-hidden>
              {on ? "✓" : ""}
            </span>
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ProfilesField(props: any) {
  const path: string = props?.path ?? "profiles";
  const { value, setValue } = useField<string[] | null>({ path });
  const current = Array.isArray(value) ? value : [];
  const all = ALL.every((v) => current.includes(v));

  return (
    <div className="field-type">
      <FieldLabel label={props?.field?.label ?? "Pour qui ?"} path={path} />
      <ProfilePills value={current} onChange={setValue} disabled={Boolean(props?.readOnly)} />
      <p className="field-description">
        {current.length === 0
          ? "Aucun profil coché : la fiche s'affiche pour tout le monde."
          : all
            ? "La fiche s'affiche pour tous les profils."
            : `La fiche s'affiche pour ${current.length} profil${current.length > 1 ? "s" : ""} sur ${ALL.length}.`}
      </p>
    </div>
  );
}
