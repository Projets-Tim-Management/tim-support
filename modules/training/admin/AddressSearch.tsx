"use client";

import { useEffect, useId, useRef, useState } from "react";

import {
  MIN_QUERY,
  banSearchUrl,
  mapsUrl,
  parseBanSuggestions,
  type AddressSuggestion,
} from "@/modules/training/lib/address";

/**
 * Champ « Adresse » avec suggestions de la Base Adresse Nationale.
 *
 * On tape, on choisit une suggestion (souris ou flèches + Entrée) : l'adresse
 * normalisée est enregistrée. Une adresse que la BAN ne connaît pas (hors de
 * France) s'enregistre telle quelle à la sortie du champ — la recherche aide,
 * elle n'interdit rien.
 *
 * Une panne de la BAN ne bloque pas la saisie : simplement, plus de suggestions.
 */
export function AddressSearch({
  value,
  onCommit,
  disabled,
  placeholder,
}: {
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(value);
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  // La saisie a-t-elle bougé depuis la dernière valeur enregistrée ? Sans ce
  // drapeau, le simple affichage d'une adresse lancerait une recherche.
  const typed = useRef(false);
  // La liste ne s'ouvre que champ actif : une réponse arrivée après la sortie
  // du champ ne doit pas surgir sous les yeux (ni masquer « Voir sur la carte »).
  const focused = useRef(false);

  useEffect(() => setText(value), [value]);

  useEffect(() => {
    if (!typed.current || text.trim().length < MIN_QUERY) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(banSearchUrl(text), { signal: ctrl.signal, headers: { Accept: "application/json" } });
        const next = res.ok ? parseBanSuggestions(await res.json()) : [];
        setItems(next);
        setActive(-1);
        setOpen(focused.current && next.length > 0);
      } catch {
        /* annulée par une frappe plus récente, ou BAN injoignable */
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [text]);

  const choose = (label: string) => {
    typed.current = false;
    setText(label);
    setOpen(false);
    setItems([]);
    if (label !== value) onCommit(label);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || !items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(items[active].label);
    } else if (e.key === "Escape") {
      // Ferme la liste sans fermer tout l'écran du plan.
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className="tr-addr">
      <div className="tr-addr__field">
        <svg className="tr-addr__icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          className="tr-input tr-addr__input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Adresse"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => {
            typed.current = true;
            setText(e.target.value);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => {
            focused.current = true;
            if (items.length) setOpen(true);
          }}
          onBlur={() => {
            focused.current = false;
            typed.current = false;
            setOpen(false);
            if (text !== value) onCommit(text.trim());
          }}
        />
      </div>

      {open && (
        <ul id={listId} role="listbox" className="tr-addr__list">
          {items.map((it, i) => (
            <li
              key={it.label}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`tr-addr__opt${i === active ? " is-active" : ""}`}
              // mousedown, pas click : le clic arriverait après la sortie du
              // champ, qui aurait déjà enregistré le texte à moitié tapé.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(it.label);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="tr-addr__label">{it.label}</span>
              {it.context && <span className="tr-addr__context">{it.context}</span>}
            </li>
          ))}
        </ul>
      )}

      {value && !open && (
        <a className="tr-addr__map" href={mapsUrl(value)} target="_blank" rel="noopener noreferrer">
          Voir sur la carte ↗
        </a>
      )}
    </div>
  );
}
