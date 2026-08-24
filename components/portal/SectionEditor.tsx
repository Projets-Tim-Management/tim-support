"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { IconCheck, IconCross } from "@/components/ui/icons";
import { coerceCell, parseClipboard, parseDateText } from "@/modules/marketing/lib/portal-paste";
import {
  fieldRequired,
  fieldVisible,
  validateRow,
  type PortalField,
  type PortalSection,
} from "@/modules/marketing/lib/portal-sections";

/**
 * Éditeur d'une section du dossier de démarrage, en TABLEAU éditable.
 *
 * Un seul composant pour les cinq sections : les champs, leurs conditions
 * d'affichage et leurs règles d'obligation viennent du registre partagé avec
 * l'API. Écrire cinq formulaires aurait garanti qu'ils divergent.
 *
 * Le formulaire ligne par ligne d'avant demandait quatre gestes pour une saisie
 * — ouvrir, remplir, enregistrer, recommencer — là où ces informations sortent
 * d'un tableur. On saisit donc directement dans la grille, comme dans Excel : on
 * tape, on passe à la case suivante, la ligne s'enregistre quand on la quitte.
 *
 * L'enregistrement se fait AU CHAMP QUITTÉ et pas à chaque frappe : une requête
 * par caractère saturerait le réseau et ferait clignoter les erreurs pendant
 * qu'on écrit. Une ligne incomplète reste locale, jamais perdue, avec ses cases
 * fautives signalées.
 */

type Row = Record<string, unknown> & { id?: number | string };
/** Ligne locale : `_key` survit aux rechargements, `id` n'existe qu'une fois enregistrée. */
type LocalRow = { _key: string; dirty: boolean; row: Row };

let counter = 0;
const newKey = () => `n${(counter += 1)}`;

/** Trace d'anomalie côté navigateur : silencieuse pour l'utilisateur, visible en console. */
const payloadWarn = (message: string) => {
  if (typeof console !== "undefined") console.warn(`[dossier] ${message}`);
};

/** Valeur prête pour un `<input>` : les dates arrivent en ISO complet. */
const toInput = (field: PortalField, value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (field.type === "date") return String(value).slice(0, 10);
  return String(value);
};

/**
 * Date ISO → « 12/03/1985 », l'écriture attendue dans une grille française.
 *
 * Les dates ne sont plus saisies dans un champ `type="date"` : celui-ci est
 * découpé en jour / mois / année, et ces segments ne se sélectionnent pas. On ne
 * peut donc ni copier une date, ni en coller une — l'événement de collage
 * n'atteint même pas le champ. Une saisie texte rend les deux gestes possibles,
 * et la conversion se charge du reste.
 */
const frDate = (value: unknown): string => {
  const iso = value ? String(value).slice(0, 10) : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

/** Une ligne vide ne s'enregistre pas : on ne crée pas de fantômes en tabulant. */
const isBlank = (row: Row, fields: PortalField[]) =>
  fields.every((f) => {
    const v = row[f.name];
    return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
  });

export default function SectionEditor({
  section,
  locked: initialLocked,
  endpoint = "/api/portal/dossier",
  query = "",
  admin = false,
  reloadToken = 0,
}: {
  section: PortalSection;
  locked: boolean;
  /**
   * Deux portes mènent à ces tableaux : l'espace client et le back-office. Le
   * composant est le même — sinon les deux écrans divergeraient au premier
   * correctif — seule l'adresse change, avec ses propres règles d'accès.
   */
  endpoint?: string;
  /** Paramètres d'URL de la porte admin (`?clientId=…`). */
  query?: string;
  /** Côté TIM : les colonnes réservées apparaissent (le mot de passe TIM). */
  admin?: boolean;
  /**
   * Change de valeur pour faire relire les lignes au serveur.
   *
   * L'appelant peut modifier ces lignes par un autre chemin que la grille — la
   * génération des mots de passe, par exemple. Recharger la page entière
   * rafraîchirait bien le tableau, mais au prix de tout le reste : l'écran
   * quitté, le plein écran perdu, le message de résultat effacé avant d'être lu.
   */
  reloadToken?: number;
}) {
  const [rows, setRows] = useState<LocalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(initialLocked);
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  /**
   * Ce qui est EN TRAIN d'être tapé dans une case date, avant conversion.
   *
   * Sans ce tampon, taper « 1 » dans une date vide serait aussitôt converti (ou
   * refusé) et le champ se viderait sous les doigts. On garde donc le texte brut
   * jusqu'à ce que la ligne soit quittée, moment où il devient une vraie date.
   */
  const [typing, setTyping] = useState<Record<string, string>>({});
  // Sauvegarde en cours par ligne : évite qu'un aller-retour lent double l'envoi.
  const inFlight = useRef<Set<string>>(new Set());
  /**
   * Miroir de `rows`, lu par `commit`.
   *
   * `commit` part d'un `onBlur` : sa fermeture date du rendu où l'écouteur a été
   * posé. Une frappe suivie d'un `Tab` immédiat lui ferait enregistrer la valeur
   * d'AVANT la frappe — un caractère perdu, au hasard, impossible à reproduire.
   * Le miroir est mis à jour à chaque rendu, il est donc toujours à l'heure.
   */
  const rowsRef = useRef<LocalRow[]>([]);

  // Les colonnes réservées à TIM n'existent pas dans le tableau du client : il
  // les LIT sur sa page d'accès, il ne les saisit jamais.
  const fields = useMemo(
    () => section.fields.filter((f) => admin || !f.adminOnly),
    [section.fields, admin],
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${endpoint}/${section.key}${query}`, { credentials: "include" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRows([
        ...((data.docs ?? []) as Row[]).map((row) => ({ _key: newKey(), dirty: false, row })),
        { _key: newKey(), dirty: false, row: {} },
      ]);
      setLocked(Boolean(data.locked));
    } catch {
      setFailure("Chargement impossible. Rechargez la page.");
    } finally {
      setLoading(false);
    }
    // `reloadToken` ne sert à rien dans le corps : il n'est là que pour refaire
    // la lecture quand l'appelant le change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.key, endpoint, query, reloadToken]);

  useEffect(() => {
    void load();
  }, [load]);

  // Synchronisé dans un EFFET et non pendant le rendu : écrire un ref en cours
  // de rendu est interdit (react-hooks/refs), et inutile ici — un effet s'exécute
  // avant l'événement suivant, donc avant tout `onBlur`.
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const setCell = (key: string, name: string, value: unknown) =>
    setRows((list) =>
      list.map((r) => (r._key === key ? { ...r, dirty: true, row: { ...r.row, [name]: value } } : r)),
    );

  /**
   * Enregistre une ligne quittée. Silencieux quand il n'y a rien à faire :
   * quitter une case sans avoir rien changé ne doit produire aucune requête.
   */
  const commit = async (key: string, override?: Row) => {
    const known = rowsRef.current.find((r) => r._key === key);
    // `override` : après un collage, l'état n'est pas encore propagé au miroir.
    // On enregistre alors la ligne qu'on vient de calculer, pas celle d'avant.
    const current = override ? { _key: key, dirty: true, row: override } : known;
    if (!current || !current.dirty || locked || inFlight.current.has(key)) return;
    if (isBlank(current.row, fields)) return;

    const found = validateRow(section, current.row);
    setErrors((e) => ({ ...e, [key]: found }));
    if (Object.keys(found).length) return;

    inFlight.current.add(key);
    setSaving((s) => [...s, key]);
    setFailure(null);
    try {
      const res = await fetch(`${endpoint}/${section.key}${query}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(current.row),
      });
      const body = await res.json().catch(() => null);
      if (res.status === 422) {
        setErrors((e) => ({ ...e, [key]: body?.errors ?? {} }));
        return;
      }
      if (!res.ok) throw new Error(body?.message);

      // On remplace la ligne par celle du serveur (elle porte l'`id`) sans
      // recharger tout le tableau : un rechargement remonterait le focus au
      // début alors que l'utilisateur est déjà dans la case suivante.
      //
      // Mais SEULEMENT si la réponse ressemble à une ligne. Une réponse d'une
      // autre forme — c'est arrivé, la mise à jour par lot renvoyant
      // `{ docs, errors }` — remplaçait la ligne par un objet sans aucun de ses
      // champs : la saisie disparaissait sous les yeux de l'utilisateur, sans
      // erreur. On garde alors ce qui est à l'écran, qui vient d'être accepté.
      const saved = body?.doc as Row | undefined;
      const usable = saved && typeof saved === "object" && saved.id != null;
      if (!usable) {
        payloadWarn(`réponse inattendue pour ${section.key} : ligne conservée telle quelle`);
      }

      setRows((list) => {
        const next = list.map((r) =>
          r._key === key
            ? { ...r, dirty: false, row: usable ? { ...r.row, ...saved } : r.row }
            : r,
        );
        // La ligne saisie était la dernière : on en rouvre une vierge dessous.
        return next[next.length - 1]?._key === key
          ? [...next, { _key: newKey(), dirty: false, row: {} }]
          : next;
      });
      setErrors((e) => ({ ...e, [key]: {} }));
    } catch (err) {
      setFailure(err instanceof Error && err.message ? err.message : "Enregistrement impossible.");
    } finally {
      inFlight.current.delete(key);
      setSaving((s) => s.filter((k) => k !== key));
    }
  };

  /**
   * Collage d'un bloc venu d'un tableur, à partir de la case visée.
   *
   * Une seule cellule collée se comporte comme une saisie ordinaire. Un bloc
   * remplit vers la droite et vers le bas, en créant les lignes qui manquent :
   * c'est le geste qu'on attend d'une grille, et c'est ce qui rend la
   * suppression du fichier à importer tenable.
   *
   * Les colonnes suivent l'ordre affiché ; ce qui dépasse à droite est ignoré
   * plutôt que réparti n'importe où.
   */
  const paste = (event: React.ClipboardEvent, key: string, fieldIndex: number) => {
    const text = event.clipboardData.getData("text/plain");
    if (!text || locked) return;

    const matrix = parseClipboard(text);
    // Une seule valeur : on laisse le navigateur faire, SAUF pour une date, que
    // le champ natif refuse de recevoir en collage.
    if (matrix.length === 1 && matrix[0].length === 1 && fields[fieldIndex]?.type !== "date") return;

    event.preventDefault();

    // Calcul HORS de `setRows` : une fonction de mise à jour doit rester pure,
    // et React peut l'appeler deux fois. Les enregistrements partiraient alors
    // en double. On part du miroir, qui reflète le dernier rendu.
    const list = rowsRef.current;
    const start = list.findIndex((r) => r._key === key);
    if (start < 0) return;

    const next = [...list];
    const touched: { key: string; row: Row }[] = [];

    matrix.forEach((cells, dy) => {
      const target = start + dy;
      // Au-delà des lignes existantes, on en ajoute : coller vingt salariés ne
      // doit pas obliger à créer vingt lignes à la main d'abord.
      if (target >= next.length) next.push({ _key: newKey(), dirty: false, row: {} });

      const row = { ...next[target].row };
      cells.forEach((cell, dx) => {
        const field = fields[fieldIndex + dx];
        if (!field) return;
        row[field.name] = coerceCell(field, cell);
      });

      next[target] = { ...next[target], dirty: true, row };
      touched.push({ key: next[target]._key, row });
    });

    // La dernière ligne du tableau doit rester vierge : sans quoi il n'y a plus
    // de quoi ajouter après un collage qui va jusqu'en bas.
    if (!isBlank(next[next.length - 1].row, fields)) {
      next.push({ _key: newKey(), dirty: false, row: {} });
    }

    setRows(next);
    // Un collage écrase la frappe en cours : sans ça, l'ancien texte resterait
    // affiché par-dessus la valeur collée.
    const pasted = new Set(touched.map((t) => t.key));
    setTyping((t) =>
      Object.fromEntries(Object.entries(t).filter(([k]) => !pasted.has(k.split(":")[0]))),
    );
    for (const t of touched) void commit(t.key, t.row);
  };

  const remove = async (key: string, id?: number | string) => {
    if (id == null) {
      setRows((list) => list.filter((r) => r._key !== key));
      setErrors((e) => {
        const { [key]: _gone, ...rest } = e;
        void _gone;
        return rest;
      });
      return;
    }
    try {
      await fetch(`${endpoint}/${section.key}${query}${query ? "&" : "?"}id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      setRows((list) => list.filter((r) => r._key !== key));
      setErrors((e) => {
        const { [key]: _gone, ...rest } = e;
        void _gone;
        return rest;
      });
    } catch {
      setFailure("Suppression impossible. Réessayez.");
    }
  };

  /**
   * `select` réserve plus de place à droite : la flèche native du menu s'y
   * trouve déjà, et la pastille de validité venait se poser dessus.
   */
  const cellClass = (invalid: boolean, disabled: boolean, isSelect = false) =>
    `w-full min-w-0 bg-transparent py-2 pl-3 text-sm text-foreground outline-none ${
      isSelect ? "pr-11" : "pr-7"
    } ${
      invalid ? "bg-danger-bg" : ""
    } ${disabled ? "cursor-not-allowed text-muted" : "focus:bg-primary-light"}`;

  const columns = useMemo(() => fields, [fields]);

  if (loading) return <p className="text-muted">Chargement…</p>;

  return (
    <div>
      {failure && (
        <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-foreground" role="alert">
          {failure}
        </p>
      )}

      {locked && (
        <p className="mb-4 rounded-md bg-processing-bg px-4 py-3 text-sm text-processing-text">
          Votre dossier a été validé par TIM : il n&apos;est plus modifiable. Contactez-nous si une
          information doit changer.
        </p>
      )}

      {/* Défilement horizontal assumé : quatorze colonnes pour les salariés ne
          tiennent pas sur un écran, et les tasser les rendrait illisibles. */}
      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left">
              <th className="w-10 px-2 py-2 text-xs font-semibold text-muted">#</th>
              {columns.map((f) => (
                <th
                  key={f.name}
                  className="min-w-[9rem] whitespace-nowrap px-3 py-2 font-semibold text-foreground"
                >
                  {f.label}
                  {f.required && <span className="text-primary"> *</span>}
                </th>
              ))}
              {!locked && <th className="w-10 px-2 py-2" />}
            </tr>
          </thead>

          <tbody>
            {rows.map(({ _key, row }, i) => {
              // Deux validations, et c'est voulu : `errors` porte ce que le
              // SERVEUR a refusé, `live` ce que la saisie vaut à cet instant.
              // La seconde donne le retour immédiat case par case, la première
              // survit à l'aller-retour réseau.
              const live = validateRow(section, row);
              const rowErrors = { ...live, ...(errors[_key] ?? {}) };
              const isLast = i === rows.length - 1;
              const isSaving = saving.includes(_key);

              return (
                <tr
                  key={_key}
                  // Enregistrement à la sortie de la LIGNE, pas de la case.
                  //
                  // Au champ quitté, une ligne neuve se faisait reprocher son
                  // e-mail manquant dès la deuxième colonne — pendant qu'on la
                  // remplissait. On attend donc que le focus quitte vraiment la
                  // ligne : `relatedTarget` dit où il va, et s'il reste dans la
                  // même ligne, il n'y a rien à conclure.
                  onBlur={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                    // Les dates tapées en texte deviennent de vraies dates au
                    // moment où l'on quitte la ligne — jamais pendant la frappe,
                    // qui passe forcément par des états incomplets.
                    const pending = Object.entries(typing).filter(([k]) => k.startsWith(`${_key}:`));
                    if (pending.length === 0) {
                      void commit(_key);
                      return;
                    }
                    const merged = { ...row };
                    for (const [k, text] of pending) {
                      merged[k.slice(_key.length + 1)] = text.trim() ? (parseDateText(text) ?? "") : "";
                    }
                    setRows((list) =>
                      list.map((r) => (r._key === _key ? { ...r, dirty: true, row: merged } : r)),
                    );
                    setTyping((t) =>
                      Object.fromEntries(Object.entries(t).filter(([k]) => !k.startsWith(`${_key}:`))),
                    );
                    void commit(_key, merged);
                  }}
                  className={`border-b border-border last:border-0 ${isLast ? "bg-surface/40" : ""}`}
                >
                  <td className="px-2 py-2 text-center text-xs text-muted">
                    {isSaving ? "…" : isLast && !row.id ? "+" : i + 1}
                  </td>

                  {columns.map((field, fieldIndex) => {
                    const visible = fieldVisible(field, row);
                    const invalid = Boolean(rowErrors[field.name]);
                    const disabled = locked || !visible;
                    const common = {
                      disabled,
                      // Côté TIM, chaque valeur part vers le logiciel : un clic
                      // sélectionne la case entière, il ne reste qu'à copier.
                      // Côté client, ce serait une gêne — on saisit, on ne
                      // recopie pas.
                      // `select()` n'existe que sur un champ de saisie : un
                      // `<select>` reçoit le même gestionnaire, d'où le garde.
                      ...(admin
                        ? {
                            onFocus: (e: React.FocusEvent<HTMLElement>) =>
                              (e.target as HTMLInputElement).select?.(),
                          }
                        : {}),
                      title: rowErrors[field.name] ?? (visible ? undefined : "Sans objet ici"),
                      className: cellClass(invalid, disabled, field.type === "select"),
                      onPaste: (e: React.ClipboardEvent) => paste(e, _key, fieldIndex),
                    };

                    // Vert dès que la case est remplie ET acceptée ; rouge si
                    // elle est remplie mais fautive. Rien tant qu'elle est vide :
                    // signaler une case qu'on n'a pas encore touchée reviendrait
                    // à couvrir la grille de croix avant la première frappe.
                    const value = row[field.name];
                    const filled =
                      value !== undefined &&
                      value !== null &&
                      value !== "" &&
                      !(Array.isArray(value) && value.length === 0);
                    const badge =
                      !visible || !filled ? null : live[field.name] ? "ko" : "ok";

                    return (
                      <td key={field.name} className="relative border-l border-border p-0 align-middle">
                        {badge && (
                          <span
                            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${
                              field.type === "select" ? "right-6" : "right-1.5"
                            } ${badge === "ok" ? "text-success" : "text-danger"}`}
                            title={badge === "ko" ? live[field.name] : "Valide"}
                            aria-label={badge === "ko" ? live[field.name] : "Valide"}
                          >
                            {badge === "ok" ? (
                              <IconCheck className="h-3.5 w-3.5" />
                            ) : (
                              <IconCross className="h-3.5 w-3.5" />
                            )}
                          </span>
                        )}
                        {!visible ? (
                          <span className="block px-3 py-2 text-sm text-muted">—</span>
                        ) : field.readOnly ? (
                          // Valeur produite par le logiciel : on la montre, on
                          // ne la saisit pas. La rendre éditable inviterait à
                          // corriger à la main un code qui vit ailleurs.
                          <span className="block px-3 py-2 text-sm text-foreground">
                            {String(row[field.name] ?? "") || <span className="text-muted">—</span>}
                          </span>
                        ) : field.type === "checkbox" ? (
                          <span className="flex items-center justify-center py-2">
                            <input
                              type="checkbox"
                              checked={Boolean(row[field.name])}
                              disabled={disabled}
                              onChange={(e) => setCell(_key, field.name, e.target.checked)}
                              onPaste={(e) => paste(e, _key, fieldIndex)}
                            />
                          </span>
                        ) : field.type === "select" ? (
                          <select
                            {...common}
                            value={toInput(field, row[field.name])}
                            onChange={(e) => setCell(_key, field.name, e.target.value)}
                          >
                            <option value="">—</option>
                            {field.options?.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        ) : field.type === "multiselect" ? (
                          // Plusieurs valeurs dans une case : un menu déroulant
                          // natif (`<details>`) plutôt qu'une liste multiple, que
                          // personne ne sait manipuler sans se tromper.
                          <details className="group relative">
                            <summary
                              className={`cursor-pointer list-none py-2 pl-3 pr-7 text-sm ${
                                invalid ? "bg-danger-bg" : ""
                              } ${disabled ? "text-muted" : "text-foreground"}`}
                            >
                              {((row[field.name] as string[] | undefined) ?? []).length
                                ? (row[field.name] as string[])
                                    .map((v) => field.options?.find((o) => o.value === v)?.label ?? v)
                                    .join(", ")
                                : "—"}
                            </summary>
                            <div className="absolute z-20 mt-1 max-h-56 w-56 overflow-y-auto rounded-md border border-border bg-white p-2 shadow-lg">
                              {field.options?.map((o) => {
                                const list = (row[field.name] as string[] | undefined) ?? [];
                                return (
                                  <label key={o.value} className="flex items-center gap-2 px-1 py-1 text-sm">
                                    <input
                                      type="checkbox"
                                      checked={list.includes(o.value)}
                                      disabled={disabled}
                                      onChange={(e) =>
                                        setCell(
                                          _key,
                                          field.name,
                                          e.target.checked
                                            ? [...list, o.value]
                                            : list.filter((v) => v !== o.value),
                                        )
                                      }
                                    />
                                    {o.label}
                                  </label>
                                );
                              })}
                              <button
                                type="button"
                                className="mt-1 w-full rounded-md bg-surface px-2 py-1 text-xs font-semibold text-foreground"
                                onClick={(e) => {
                                  (e.currentTarget.closest("details") as HTMLDetailsElement).open = false;
                                }}
                              >
                                Fermer
                              </button>
                            </div>
                          </details>
                        ) : field.type === "date" ? (
                          // Saisie TEXTE et non `type="date"` : le champ natif
                          // est segmenté, donc ni copiable ni collable. Ici on
                          // tape, on copie et on colle « 12/03/1985 » comme dans
                          // un tableur, et la conversion se fait à la sortie.
                          <input
                            {...common}
                            type="text"
                            inputMode="numeric"
                            value={typing[`${_key}:${field.name}`] ?? frDate(row[field.name])}
                            placeholder={fieldRequired(field, row) ? "jj/mm/aaaa (obligatoire)" : "jj/mm/aaaa"}
                            onChange={(e) =>
                              setTyping((t) => ({ ...t, [`${_key}:${field.name}`]: e.target.value }))
                            }
                          />
                        ) : (
                          <input
                            {...common}
                            type={
                              field.type === "email"
                                ? "email"
                                : field.type === "tel"
                                  ? "tel"
                                  : field.type === "number"
                                    ? "number"
                                    : "text"
                            }
                            value={toInput(field, row[field.name])}
                            placeholder={fieldRequired(field, row) ? "Obligatoire" : field.placeholder}
                            onChange={(e) =>
                              setCell(
                                _key,
                                field.name,
                                field.type === "number"
                                  ? e.target.value === ""
                                    ? ""
                                    : Number(e.target.value)
                                  : e.target.value,
                              )
                            }
                          />
                        )}
                      </td>
                    );
                  })}

                  {!locked && (
                    <td className="border-l border-border px-2 py-2 text-center">
                      {(row.id || !isLast) && (
                        <button
                          type="button"
                          onClick={() => void remove(_key, row.id)}
                          className="text-muted transition hover:text-primary"
                          aria-label={`Retirer la ligne ${i + 1}`}
                          title="Retirer cette ligne"
                        >
                          ×
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Les erreurs d'une ligne, sous le tableau : dans une case, elles
          seraient tronquées par la largeur de la colonne.
          
          On parcourt les LIGNES et non la carte des erreurs. L'inverse citait
          des lignes disparues — une erreur laissée par une ligne supprimée ou
          rechargée n'avait plus d'index, et s'affichait « Ligne 0 ». */}
      {rows.some(({ _key }) => Object.keys(errors[_key] ?? {}).length > 0) && (
        <ul className="mt-3 space-y-1">
          {rows.map(({ _key }, i) => {
            const rowErrors = errors[_key] ?? {};
            if (Object.keys(rowErrors).length === 0) return null;
            return (
              <li key={_key} className="text-sm font-medium text-primary">
                Ligne {i + 1} :{" "}
                {Object.entries(rowErrors)
                  .map(([name, msg]) => `${fields.find((f) => f.name === name)?.label ?? name} — ${msg}`)
                  .join(" · ")}
              </li>
            );
          })}
        </ul>
      )}

      {!locked && (
        <p className="mt-3 text-sm text-muted">
          Saisissez directement dans le tableau. Une ligne s&apos;enregistre quand vous en sortez —
          vous pouvez circuler librement d&apos;une case à l&apos;autre. La dernière ligne, vide, sert
          à en ajouter une.
        </p>
      )}
    </div>
  );
}
