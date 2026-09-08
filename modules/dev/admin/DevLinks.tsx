"use client";

import { useField, useForm } from "@payloadcms/ui";
import { useMemo, useState } from "react";

import { linkLabel, normalizeUrl, serviceOf } from "@/modules/dev/lib/links";

/**
 * Les liens externes d'un développement : maquette Figma, page Notion, dépôt,
 * document partagé.
 *
 * Rendus en pastilles CLIQUABLES plutôt qu'en tableau de champs : un lien
 * existe pour être ouvert, et l'interface de tableau de Payload le range dans
 * un `<input>` où le clic pose un curseur au lieu d'ouvrir la maquette.
 *
 * Le service se reconnaît à son signe (🎨 Figma, 📓 Notion…) : une URL de
 * quatre-vingts caractères ne dit rien de ce qu'il y a au bout.
 */
type Props = { path?: string; schemaPath?: string; readOnly?: boolean };

type LinkRow = { url?: string | null; label?: string | null };

export const DevLinks = (props: Props) => {
  const path = props.path ?? "links";
  const { rows } = useField<number>({ path, hasRows: true });
  const { addFieldRow, getDataByPath, removeFieldRow } = useForm();

  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  /**
   * Les deux champs de saisie ne s'affichent qu'à la demande. Ouverts en
   * permanence, ils occupaient deux lignes sur chaque fiche pour un geste
   * qu'on ne fait qu'une fois de temps en temps — et sur une fiche sans aucun
   * lien, ils remplissaient l'écran d'un formulaire vide.
   */
  const [adding, setAdding] = useState(false);

  const links = useMemo(
    () => {
      const raw = getDataByPath(path);
      return (Array.isArray(raw) ? (raw as LinkRow[]) : []).filter((l) => l?.url);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getDataByPath, path, rows?.length],
  );

  const add = () => {
    const clean = normalizeUrl(url);
    if (!clean) {
      setError("Cette adresse ne peut pas être ouverte. Exemple : figma.com/file/…");
      return;
    }
    const name = label.trim();
    addFieldRow({
      path,
      schemaPath: props.schemaPath ?? path,
      subFieldState: {
        label: { initialValue: name, valid: true, value: name },
        url: { initialValue: clean, valid: true, value: clean },
      },
    });
    setUrl("");
    setLabel("");
    setError(null);
    // La saisie reste ouverte : les liens vont rarement seuls (la maquette et
    // la spec, le dépôt et la démo).
  };

  return (
    <div className="field-type dev-links">
      <label className="dev-cfield__label">Liens</label>

      {links.length > 0 ? (
        <div className="dev-links__row">
          {links.map((link, index) => {
            const service = serviceOf(link.url ?? "");
            return (
              <span key={`${index}-${link.url}`} className="dev-links__chip">
                <a href={link.url ?? "#"} target="_blank" rel="noreferrer noopener" title={link.url ?? ""}>
                  <span aria-hidden="true">{service.icon}</span>
                  {linkLabel(link)}
                </a>
                {!props.readOnly ? (
                  <button
                    type="button"
                    className="dev-links__del"
                    aria-label="Retirer ce lien"
                    title="Retirer ce lien"
                    onClick={() => removeFieldRow({ path, rowIndex: index })}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            );
          })}
        </div>
      ) : null}

      {!props.readOnly && !adding ? (
        <button type="button" className="dev-links__toggle" onClick={() => setAdding(true)}>
          + Ajouter un lien
        </button>
      ) : null}

      {!props.readOnly && adding ? (
        <>
          <div className="dev-links__add">
            <input
              type="text"
              className="dev-links__url"
              // On ouvre pour coller : le curseur y est déjà.
              autoFocus
              value={url}
              placeholder="Coller un lien — figma.com/file/…"
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              // Entrée ajoute : on colle, on nomme, on enchaîne.
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
            />
            <input
              type="text"
              className="dev-links__label"
              value={label}
              placeholder="Intitulé (facultatif)"
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
            />
            <button
              type="button"
              className="dev-links__btn"
              disabled={url.trim() === ""}
              onClick={add}
            >
              Ajouter
            </button>
            <button
              type="button"
              className="dev-links__cancel"
              aria-label="Fermer la saisie"
              title="Fermer"
              onClick={() => {
                setAdding(false);
                setUrl("");
                setLabel("");
                setError(null);
              }}
            >
              ×
            </button>
          </div>
          {error ? <p className="dev-links__error">{error}</p> : null}
        </>
      ) : null}
    </div>
  );
};
