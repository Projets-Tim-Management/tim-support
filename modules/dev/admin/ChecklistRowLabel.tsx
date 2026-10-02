"use client";

import { toast, useDocumentInfo, useField, useForm, useRowLabel } from "@payloadcms/ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

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
   * Ce qu'on tape vit d'abord dans un état LOCAL, recopié dans le formulaire.
   *
   * L'état du formulaire Payload ne se met pas à jour de façon synchrone : lié
   * directement à `value`, le champ se re-rendait à chaque lettre avec une
   * valeur décalée, et React renvoyait le curseur en fin de phrase — impossible
   * de corriger un mot au milieu. On ne resynchronise depuis le formulaire que
   * hors saisie (rechargement, autre onglet de la fiche…).
   */
  const [draft, setDraft] = useState<string>(String(titleValue ?? data?.title ?? ""));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(String(titleValue ?? data?.title ?? ""));
  }, [titleValue, data?.title]);

  /**
   * Un titre long passe à la ligne au lieu d'être coupé : la zone de texte
   * prend la hauteur de son contenu. On recalcule à chaque saisie et quand la
   * largeur change (fenêtre redimensionnée, panneau ouvert à côté).
   */
  const box = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(fit, [draft]);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * Cocher ENREGISTRE, sans passer par le bouton « Sauvegarder » — et nommer
   * un point aussi.
   *
   * Une checklist se coche et s'allonge au fil de la journée, souvent sur une
   * fiche qu'on n'était pas venu modifier : demander un enregistrement
   * explicite, c'est garantir des coches et des lignes perdues. On envoie donc
   * la liste telle qu'elle est dans le formulaire — les autres retouches en
   * cours partent avec, ce qui est le comportement attendu de « j'enregistre ».
   *
   * Sur une fiche jamais enregistrée (pas encore d'identifiant), on se contente
   * de l'état local : il n'y a pas encore de document où écrire. Et tant qu'un
   * point n'a pas de titre, on n'envoie rien : le titre est obligatoire, le
   * serveur refuserait toute la liste — on attend qu'il soit nommé.
   */
  const persist = async (patch: (row: Record<string, unknown>, i: number) => Record<string, unknown>): Promise<boolean> => {
    if (id == null) return false;
    const arrayPath = path.split(".").slice(0, -1).join(".");
    const rows = getDataByPath(arrayPath);
    if (!Array.isArray(rows)) return false;
    const payload = rows.map((row, i) => patch(row as Record<string, unknown>, i));
    if (payload.some((row) => !String(row.title ?? "").trim())) return false;

    const res = await fetch(`/payload-api/developments/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [arrayPath]: payload }),
    });
    if (!res.ok) throw new Error(String(res.status));
    return true;
  };

  const toggle = async () => {
    const next = !done;
    setValue(next);
    if (typeof rowNumber !== "number") return;
    try {
      await persist((row, i) => (i === rowNumber ? { ...row, done: next } : row));
    } catch {
      // La coche revient d'elle-même : une case qui se décoche dit mieux
      // qu'un message que rien n'a été enregistré.
      setValue(done);
      toast.error("Le point n'a pas pu être enregistré.");
    }
  };

  /**
   * Le titre s'enregistre quand on a FINI de l'écrire — Entrée ou sortie du
   * champ — pas à chaque lettre. Une ligne ajoutée puis nommée est donc en
   * base sans passer par « Sauvegarder », comme une coche.
   */
  // Ce qui est déjà en base : passer dans le champ sans rien changer n'écrit rien.
  const savedTitle = useRef<string>(String(data?.title ?? ""));
  const commitTitle = async () => {
    if (typeof rowNumber !== "number") return;
    const clean = draft.trim();
    if (!clean || clean === savedTitle.current) return;
    try {
      if (await persist((row, i) => (i === rowNumber ? { ...row, title: clean } : row))) savedTitle.current = clean;
    } catch {
      toast.error("Le point n'a pas pu être enregistré.");
    }
  };

  const num = typeof rowNumber === "number" ? String(rowNumber + 1).padStart(2, "0") : "—";
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
          le curseur ; Entrée ne soumet pas la fiche entière : elle termine la
          saisie (et le titre s'enregistre, comme en quittant le champ). */}
      <textarea
        ref={box}
        rows={1}
        className={`dev-check__title${done ? " dev-check__title--done" : ""}`}
        value={draft}
        placeholder="Nouveau point"
        onFocus={() => {
          editing.current = true;
        }}
        onChange={(e) => {
          // Un titre reste une seule phrase : un retour à la ligne collé
          // devient une espace — la mise à la ligne est visuelle seulement.
          const next = e.target.value.replace(/\s*\n+\s*/g, " ");
          setDraft(next);
          setTitle(next);
        }}
        onBlur={() => {
          editing.current = false;
          void commitTitle();
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
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
