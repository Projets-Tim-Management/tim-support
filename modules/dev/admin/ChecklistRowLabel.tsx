"use client";

import { toast, useDocumentInfo, useField, useForm, useRowLabel } from "@payloadcms/ui";

import { initialsOf, useTeam } from "@/modules/dev/admin/team";
import { commentCount, pendingQuestions, refId } from "@/modules/dev/lib/discussion";

/**
 * L'en-tête d'un point de checklist : la case à cocher, l'intitulé, la
 * discussion en cours.
 *
 * La case est ICI, dans la barre, et non dans le contenu du point : valider une
 * tâche est le geste le plus fréquent de cet écran, et il ne doit pas demander
 * de déplier quoi que ce soit. Le champ `done` reste dans les champs du point
 * (masqué en CSS) pour que sa valeur vive normalement dans l'état du
 * formulaire — c'est lui qu'on écrit d'ici.
 *
 * ⚠️ La barre entière est recouverte d'un bouton invisible (`.collapsible__toggle`)
 * qui plie et déplie la ligne. La case doit donc passer AU-DESSUS (z-index, voir
 * dev.scss) et arrêter la propagation du clic, sans quoi cocher une tâche
 * refermerait le point.
 */
type Row = {
  done?: boolean;
  title?: string;
  assignee?: unknown;
  comments?: unknown;
};



export function ChecklistRowLabel() {
  const { data, path, rowNumber } = useRowLabel<Row>();
  const team = useTeam();
  const { id } = useDocumentInfo();
  const { getDataByPath } = useForm();
  // Source de vérité : l'état du formulaire, pas l'instantané `data` du
  // libellé — sinon la case ne changerait d'aspect qu'au prochain rendu.
  const { value, setValue } = useField<boolean>({ path: `${path}.done` });
  const done = Boolean(value ?? data?.done);

  /**
   * Le titre s'écrit ICI, dans la barre, et non dans un champ du point déplié.
   *
   * C'est la même valeur (`title`) : le champ existe toujours, simplement
   * masqué (voir dev.scss). Sur une checklist de dix points, dix libellés
   * répétés en haut de chaque carte dépliée occupaient une ligne chacun pour
   * une information déjà lisible dans la barre.
   */
  const { setValue: setTitle, value: titleValue } = useField<string>({ path: `${path}.title` });

  /**
   * Cocher ENREGISTRE, sans passer par le bouton « Sauvegarder ».
   *
   * Une checklist se coche au fil de la journée, souvent sur une fiche qu'on
   * n'était pas venu modifier : demander un enregistrement explicite, c'est
   * garantir des coches perdues. On envoie donc la liste telle qu'elle est dans
   * le formulaire — les autres retouches en cours partent avec, ce qui est le
   * comportement attendu de « j'enregistre ».
   *
   * Sur une fiche jamais enregistrée (pas encore d'identifiant), on se contente
   * de l'état local : il n'y a pas encore de document où écrire.
   */
  const toggle = async () => {
    const next = !done;
    setValue(next);
    if (id == null || typeof rowNumber !== "number") return;

    const arrayPath = path.split(".").slice(0, -1).join(".");
    const rows = getDataByPath(arrayPath);
    if (!Array.isArray(rows)) return;
    const payload = rows.map((row, i) =>
      i === rowNumber ? { ...(row as Record<string, unknown>), done: next } : row,
    );

    try {
      const res = await fetch(`/payload-api/developments/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [arrayPath]: payload }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      // La coche revient d'elle-même : une case qui se décoche dit mieux
      // qu'un message que rien n'a été enregistré.
      setValue(done);
      toast.error("Le point n'a pas pu être enregistré.");
    }
  };

  const num = typeof rowNumber === "number" ? String(rowNumber + 1).padStart(2, "0") : "—";
  const title = titleValue ?? data?.title ?? "";
  // On ne compte que les commentaires écrits : une ligne ajoutée puis laissée
  // vide ne doit pas gonfler le compteur.
  const comments = commentCount(data?.comments);
  // Une question sans réponse se voit depuis la barre : c'est le point qui
  // attend quelqu'un, et on ne devrait pas avoir à ouvrir la discussion pour
  // l'apprendre.
  const waiting = pendingQuestions(data?.comments).length;

  /**
   * Qui s'occupe de CE point — dans la barre, sans déplier : c'est la deuxième
   * question qu'on se pose devant une checklist, après « qu'est-ce qu'il reste ».
   *
   * Plusieurs personnes possibles : on affiche les deux premières, puis un
   * « +N ». Quatre pastilles dans une barre de ligne, et on ne lit plus le
   * titre.
   */
  const raw = Array.isArray(data?.assignee)
    ? data.assignee
    : data?.assignee == null
      ? []
      : [data.assignee];
  const people = raw
    .map((ref) => {
      const id = refId(ref);
      return id ? team.map[id] ?? "" : "";
    })
    .filter(Boolean);

  return (
    <span className="dev-check__row">
      <button
        type="button"
        className={`dev-check__toggle${done ? " dev-check__toggle--on" : ""}`}
        aria-pressed={done}
        title={done ? "Marquer comme à faire" : "Marquer comme fait"}
        aria-label={done ? "Marquer comme à faire" : "Marquer comme fait"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void toggle();
        }}
      >
        {/* La coche est toujours rendue : invisible au repos, elle apparaît en
            gris au survol — c'est ce qui dit « ceci se clique » avant même
            d'avoir cliqué. */}
        <span aria-hidden="true">✓</span>
      </button>
      <span className="dev-check__num">{num}</span>
      {/* Un champ, pas un libellé : on renomme un point là où on le lit.
          `stopPropagation` sur le clic, sinon la barre replierait le point sous
          le curseur ; Entrée est neutralisée, sinon elle enregistrerait la fiche
          entière au milieu d'une saisie. */}
      <input
        type="text"
        className={`dev-check__title${done ? " dev-check__title--done" : ""}`}
        value={title}
        placeholder="Nouveau point"
        onChange={(e) => setTitle(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") e.preventDefault();
        }}
      />
      {people.slice(0, 2).map((name) => (
        <span key={name} className="dev-check__who" title={`Assigné à ${name}`}>
          {initialsOf(name)}
        </span>
      ))}
      {people.length > 2 ? (
        <span className="dev-check__who dev-check__who--more" title={people.slice(2).join(", ")}>
          +{people.length - 2}
        </span>
      ) : null}
      {comments > 0 ? (
        <span
          className={`dev-check__count${waiting > 0 ? " dev-check__count--waiting" : ""}`}
          title={
            waiting > 0
              ? `${comments} message(s) — ${waiting} réponse(s) attendue(s)`
              : `${comments} message(s)`
          }
        >
          💬 {comments}
          {waiting > 0 ? <span className="dev-check__bell" aria-hidden="true" /> : null}
        </span>
      ) : null}
    </span>
  );
}
