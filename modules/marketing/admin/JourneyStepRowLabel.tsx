"use client";

import { useRowLabel } from "@payloadcms/ui";

import { JOURNEY_ACTORS } from "@/modules/marketing/lib/journey";

/**
 * Libellé de ligne d'une étape (array `steps`), côté modèle ET côté phase de
 * test : numéro + intitulé + qui agit, et une pastille d'état quand la ligne en
 * porte un (les modèles n'ont pas d'état, seules les instances en ont).
 * Sans ça, 20 étapes repliées affichent 20 fois « Étape 01, 02… ».
 */
type StepRow = {
  label?: string;
  actor?: string;
  state?: string;
};

const ACTOR_LABEL: Record<string, string> = Object.fromEntries(
  JOURNEY_ACTORS.map((a) => [a.value, a.label]),
);

const STATE_MARK: Record<string, string> = {
  fait: "✔",
  bloque: "⚠",
};

export function JourneyStepRowLabel() {
  const { data, rowNumber } = useRowLabel<StepRow>();

  const num = typeof rowNumber === "number" ? String(rowNumber + 1).padStart(2, "0") : "—";
  const mark = data?.state ? STATE_MARK[data.state] : undefined;

  return (
    <span className="jr-rowlabel">
      <span className="jr-rowlabel__num">{num}</span>
      <span className="jr-rowlabel__title">{data?.label?.trim() || "Nouvelle étape"}</span>
      {data?.actor && <span className="jr-rowlabel__actor">{ACTOR_LABEL[data.actor] ?? data.actor}</span>}
      {mark && <span className={`jr-rowlabel__state jr-rowlabel__state--${data.state}`}>{mark}</span>}
    </span>
  );
}
