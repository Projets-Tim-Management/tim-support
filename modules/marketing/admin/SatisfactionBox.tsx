"use client";

import { useFormFields } from "@payloadcms/ui";

import { SATISFACTION_LEVELS } from "@/modules/marketing/lib/satisfaction";

/**
 * La réponse du client à « Comment ça se passe ? », dans la fiche du parcours.
 *
 * Un champ numérique affichait « 2 » — un chiffre dont il fallait connaître
 * l'échelle pour comprendre qu'il s'agit d'un client mécontent. On montre donc
 * le visage sur lequel il a cliqué, son libellé, la date, et ce qu'il a bien
 * voulu ajouter.
 *
 * Rien du tout tant qu'il n'a pas répondu : un encart « aucune réponse » sur
 * chaque parcours pendant la première semaine ne dit rien qu'on ne sache déjà.
 */
/**
 * ⚠️ Fuseau explicite, même dans le navigateur.
 *
 * Sans lui, la date dépend du réglage du poste : deux personnes de l'équipe
 * liraient deux jours différents pour la même réponse, et un poste réglé
 * ailleurs qu'à Paris décalerait tout d'un jour. Le parcours, lui, se raisonne
 * en heure de Paris de bout en bout.
 */
const frDate = (iso?: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long" });
};

export const SatisfactionBox = () => {
  const value = useFormFields(([fields]) => fields.satisfaction?.value as number | undefined);
  const at = useFormFields(([fields]) => fields.satisfactionAt?.value as string | undefined);
  const comment = useFormFields(
    ([fields]) => fields.satisfactionComment?.value as string | undefined,
  );

  const level = SATISFACTION_LEVELS.find((l) => l.value === value);
  if (!level) return null;

  const jour = frDate(at);

  return (
    <div className="field-type jr-box jr-sat">
      <h4 className="jr-box__title">Comment ça se passe ?</h4>
      {/* Les notes basses se voient de loin : c'est le seul cas où il faut
          rappeler le client dans la journée. */}
      <p className={`jr-sat__line${level.value <= 2 ? " jr-sat__line--bad" : ""}`}>
        <span className="jr-sat__emoji" aria-hidden="true">
          {level.emoji}
        </span>
        <span className="jr-sat__label">{level.label}</span>
      </p>
      {jour ? <p className="jr-sat__when">Répondu le {jour}</p> : null}
      {comment?.trim() ? <p className="jr-sat__comment">« {comment.trim()} »</p> : null}
    </div>
  );
};
