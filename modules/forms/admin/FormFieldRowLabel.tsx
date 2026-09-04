"use client";

import { useRowLabel } from "@payloadcms/ui";

import { FIELD_TYPES } from "@/modules/forms/lib/form-schema";

/**
 * Libellé d'une ligne de la liste « Champs ».
 *
 * Sans lui, neuf champs repliés affichent neuf fois « Champ 01, 02… » : il faut
 * les déplier un par un pour retrouver celui qu'on cherche. On montre donc ce qui
 * permet de le reconnaître — son intitulé, son type, et le fait qu'il soit
 * facultatif, qui est justement ce qu'on vient vérifier le plus souvent.
 */
type FieldRow = {
  label?: string;
  name?: string;
  type?: string;
  required?: boolean;
};

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  FIELD_TYPES.map((t) => [t.value, t.label]),
);

export function FormFieldRowLabel() {
  const { data, rowNumber } = useRowLabel<FieldRow>();

  const num = typeof rowNumber === "number" ? String(rowNumber + 1).padStart(2, "0") : "—";
  const title = data?.label?.trim() || data?.name?.trim() || "Nouveau champ";
  const type = data?.type ? (TYPE_LABEL[data.type] ?? data.type) : undefined;

  return (
    <span>
      {num} — {title}
      {type ? ` · ${type}` : ""}
      {data?.required === false ? " · facultatif" : ""}
    </span>
  );
}
