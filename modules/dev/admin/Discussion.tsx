"use client";

import { useAuth, useField, useForm } from "@payloadcms/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { displayName, useTeam, type Person } from "@/modules/dev/admin/team";
import {
  pendingQuestions,
  refId,
  writtenComments,
  type DiscussionComment,
} from "@/modules/dev/lib/discussion";

/**
 * La discussion d'un point de checklist : une ICÔNE, et le fil qui se déplie
 * juste en dessous.
 *
 * Le fil était affiché en entier sous chaque point. Sur une checklist de dix
 * points, la page devenait une suite de conversations qu'il fallait dépasser
 * pour lire les tâches — alors qu'on ne consulte une discussion que lorsqu'on
 * s'y intéresse. L'icône dit qu'il y a quelque chose (et combien) ; le panneau
 * le montre, à l'endroit exact où on a cliqué.
 *
 * En place et non dans un tiroir latéral : une discussion se lit à côté du point
 * dont elle parle. Un panneau qui recouvre l'écran fait perdre la tâche de vue,
 * et il faut le refermer pour reprendre le fil de ce qu'on faisait.
 *
 * On peut SOLLICITER quelqu'un en écrivant : le message devient une question qui
 * reste marquée « en attente » tant que la personne n'a pas répondu — ici, sur la
 * barre du point, et sur son tableau de bord à elle.
 *
 * La donnée ne change pas de forme : c'est toujours le tableau `comments` du
 * point, avec `body` / `author` / `at` / `askedTo`.
 */

type Props = { path?: string; schemaPath?: string; readOnly?: boolean };

/** « 8 sept. à 15:42 » — on lit un fil, pas un journal technique. */
const when = (iso?: string | null): string => {
  if (!iso) return "à l'instant";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const Discussion = (props: Props) => {
  const path = props.path ?? "";
  // `hasRows` : sur un tableau, `useField` renvoie les LIGNES — c'est ce qui
  // nous rend réactifs aux envois et aux suppressions.
  const { rows } = useField<number>({ path, hasRows: true });
  const { addFieldRow, getDataByPath, removeFieldRow } = useForm();
  const { user } = useAuth();
  const team = useTeam();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [askTo, setAskTo] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // On ouvre pour écrire neuf fois sur dix : le curseur y est déjà.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  /**
   * Les messages, relus depuis l'état du formulaire à chaque changement de
   * lignes. Recalculer sur `rows` suffit : un message envoyé n'est plus
   * modifiable, donc rien ne bouge entre deux envois.
   *
   * Chaque message garde son RANG RÉEL dans le tableau (`row`). L'affichage
   * écarte les lignes vides ; supprimer d'après la position affichée aurait
   * effacé le mauvais message dès qu'une ligne vide traînait quelque part.
   */
  const comments = useMemo(() => {
    const raw = getDataByPath(path);
    const all = (Array.isArray(raw) ? raw : []) as DiscussionComment[];
    return all
      .map((comment, row) => ({ comment, row }))
      .filter(({ comment }) => writtenComments([comment]).length === 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getDataByPath, path, rows?.length]);

  const pending = useMemo(
    () => pendingQuestions(comments.map((entry) => entry.comment)),
    [comments],
  );

  const send = useCallback(() => {
    const body = draft.trim();
    if (!body) return;
    const now = new Date().toISOString();
    const userId = (user as { id?: number | string } | null)?.id ?? null;
    // Un <select> ne rend que des chaînes ; les identifiants d'utilisateurs
    // sont des entiers. Envoyer « 3 » là où la base attend 3 fait échouer la
    // validation de la relation — et l'enregistrement entier avec elle.
    const askedNum = Number(askTo);
    const asked = askTo === "" ? null : Number.isFinite(askedNum) ? askedNum : askTo;
    // Auteur et date posés côté client pour que le message s'affiche complet
    // tout de suite ; le hook serveur les repose à l'enregistrement, et ne
    // réécrit jamais ceux qui existent déjà.
    addFieldRow({
      path,
      schemaPath: props.schemaPath ?? path,
      subFieldState: {
        askedTo: { initialValue: asked, valid: true, value: asked },
        at: { initialValue: now, valid: true, value: now },
        author: { initialValue: userId, valid: true, value: userId },
        body: { initialValue: body, valid: true, value: body },
      },
    });
    setDraft("");
    setAskTo("");
  }, [addFieldRow, askTo, draft, path, props.schemaPath, user]);

  const me = displayName(user as Person | undefined);
  const count = comments.length;

  return (
    <div className="field-type dev-disc">
      {/* L'icône : ce qu'il y a à savoir sans ouvrir — combien de messages, et
          si quelqu'un attend une réponse. */}
      <button
        type="button"
        className={`dev-disc__open${pending.length > 0 ? " dev-disc__open--pending" : ""}${open ? " dev-disc__open--on" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">💬</span>
        <span className="dev-disc__open-label">
          {count === 0 ? "Discuter" : `Discussion (${count})`}
        </span>
        {pending.length > 0 ? (
          <span className="dev-disc__dot" title="Une réponse est attendue">
            {pending.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="dev-disc__panel">
          {pending.length > 0 ? (
            <p className="dev-disc__alert">
              {pending.length === 1
                ? `En attente de la réponse de ${team.map[pending[0].askedTo] ?? "quelqu'un"}.`
                : `${pending.length} réponses attendues.`}
            </p>
          ) : null}

          {count === 0 ? (
            <p className="dev-disc__empty">Aucun échange sur ce point.</p>
          ) : (
            <div className="dev-disc__thread">
              {comments.map(({ comment, row }, index) => {
                const author = refId(comment.author);
                const asked = refId(comment.askedTo);
                const waiting = pending.some((q) => q.index === index);
                return (
                  <article key={`${row}-${comment.at ?? ""}`} className="dev-msg">
                    <header className="dev-msg__head">
                      <span className="dev-msg__who">
                        {(author && team.map[author]) || "Quelqu'un"}
                      </span>
                      <span className="dev-msg__when">{when(comment.at)}</span>
                      {!props.readOnly ? (
                        <button
                          type="button"
                          className="dev-msg__del"
                          title="Supprimer ce message"
                          aria-label="Supprimer ce message"
                          onClick={() => removeFieldRow({ path, rowIndex: row })}
                        >
                          ×
                        </button>
                      ) : null}
                    </header>
                    <p className="dev-msg__body">{comment.body}</p>
                    {asked ? (
                      <p className={`dev-msg__ask${waiting ? " dev-msg__ask--waiting" : ""}`}>
                        {waiting
                          ? `⏳ En attente de ${team.map[asked] ?? "quelqu'un"}`
                          : `✓ ${team.map[asked] ?? "La personne sollicitée"} a répondu`}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}

          {!props.readOnly ? (
            <div className="dev-disc__compose">
              <textarea
                ref={inputRef}
                className="dev-disc__input"
                value={draft}
                // Une ligne : on écrit une phrase, pas un compte rendu. Le champ
                // s'agrandit à la saisie (Maj+Entrée) et reste redimensionnable.
                rows={1}
                placeholder={me ? `Écrire en tant que ${me}…` : "Écrire un message…"}
                onChange={(e) => setDraft(e.target.value)}
                // Entrée envoie, Maj+Entrée passe à la ligne — la convention de
                // toutes les messageries, et le geste le plus fréquent ici.
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <div className="dev-disc__actions">
                <label className="dev-disc__ask">
                  <span>Réponse attendue de</span>
                  <select value={askTo} onChange={(e) => setAskTo(e.target.value)}>
                    <option value="">— personne en particulier —</option>
                    {team.list.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="dev-disc__send"
                  disabled={draft.trim() === ""}
                  onClick={send}
                >
                  {askTo ? "Demander" : "Commenter"}
                </button>
              </div>
              <p className="dev-disc__hint">
                Sollicitée, la personne verra la question sur son tableau de bord jusqu&apos;à ce
                qu&apos;elle réponde ici. Les messages partent à l&apos;enregistrement de la fiche.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
