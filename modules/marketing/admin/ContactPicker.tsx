"use client";

import { useMemo, useState } from "react";

import type { Recipient } from "@/modules/marketing/lib/mass-email";
import type { DirectoryEntry } from "@/modules/marketing/lib/mass-email-server";
import { clientPhase, clientStatusMeta } from "@/modules/partner/lib/clientStatus";

/**
 * Carnet d'adresses de l'e-mail de masse : tous les contacts de la base, à
 * cocher — un par un après recherche, ou par groupe (« tous les clients »).
 *
 * Les filtres suivent les PHASES de la fiche (pipeline, test, signature,
 * client, fin) plutôt que ses onze statuts : on écrit « aux clients » ou « aux
 * prospects », rarement « aux fiches en attente longue ». Le statut exact reste
 * affiché sur chaque ligne.
 *
 * Un désinscrit est montré, grisé : le cacher ferait croire qu'il manque dans
 * la base, et l'ajouter serait inutile (l'envoi le saute de toute façon).
 */

type Filter = "tous" | "client" | "test" | "pipeline" | "fin" | "sans-fiche";

const FILTERS: { key: Filter; label: string; match: (e: DirectoryEntry) => boolean }[] = [
  { key: "tous", label: "Tous", match: () => true },
  { key: "client", label: "Clients", match: (e) => clientPhase(e.status) === "client" },
  {
    key: "test",
    label: "En test / signature",
    match: (e) => ["test", "signature"].includes(clientPhase(e.status) ?? ""),
  },
  { key: "pipeline", label: "Prospects", match: (e) => clientPhase(e.status) === "pipeline" },
  { key: "fin", label: "Perdus / archivés", match: (e) => clientPhase(e.status) === "fin" },
  { key: "sans-fiche", label: "Sans fiche", match: (e) => !e.status },
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export default function ContactPicker({
  directory,
  already,
  onAdd,
  onClose,
}: {
  directory: DirectoryEntry[];
  /** Adresses déjà dans la liste d'envoi. */
  already: Set<string>;
  onAdd: (list: Recipient[]) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("client");
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, directory.filter(f.match).length])) as Record<Filter, number>,
    [directory],
  );

  const rows = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0];
    const q = norm(query.trim());
    return directory.filter(
      (e) => f.match(e) && (!q || norm(`${e.name ?? ""} ${e.company ?? ""} ${e.email}`).includes(q)),
    );
  }, [directory, filter, query]);

  const selectable = rows.filter((e) => !e.suppressed && !already.has(e.email));
  const allChecked = selectable.length > 0 && selectable.every((e) => checked.has(e.email));

  const toggle = (email: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });

  const toggleAll = () =>
    setChecked((prev) => {
      const next = new Set(prev);
      for (const e of selectable) {
        if (allChecked) next.delete(e.email);
        else next.add(e.email);
      }
      return next;
    });

  const add = () => {
    const picked = directory.filter((e) => checked.has(e.email));
    onAdd(picked.map((e) => ({ email: e.email, firstName: e.firstName })));
    setChecked(new Set());
  };

  return (
    <div className="contact-picker">
      <div className="contact-picker__top">
        <input
          className="contact-picker__search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un nom, une société, une adresse…"
          autoFocus
        />
        <button type="button" className="mass-mail__link" onClick={onClose}>
          Fermer
        </button>
      </div>

      <div className="contact-picker__filters" role="group" aria-label="Filtrer par statut">
        {FILTERS.filter((f) => f.key === "tous" || counts[f.key] > 0).map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            className={`contact-picker__filter ${filter === f.key ? "is-active" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label} <span>{counts[f.key]}</span>
          </button>
        ))}
      </div>

      <div className="contact-picker__head">
        <label className="contact-picker__check">
          <input type="checkbox" checked={allChecked} disabled={selectable.length === 0} onChange={toggleAll} />
          Tout cocher ({selectable.length})
        </label>
        <span className="mass-mail__hint">
          {rows.length} contact{rows.length > 1 ? "s" : ""}
        </span>
      </div>

      <ul className="contact-picker__list">
        {rows.length === 0 && <li className="contact-picker__empty">Aucun contact ne correspond.</li>}
        {rows.map((e) => {
          const added = already.has(e.email);
          const meta = clientStatusMeta(e.status);
          const disabled = added || e.suppressed;
          return (
            <li key={e.email} className={disabled ? "is-disabled" : ""}>
              <label className="contact-picker__row">
                <input
                  type="checkbox"
                  checked={added || checked.has(e.email)}
                  disabled={disabled}
                  onChange={() => toggle(e.email)}
                />
                <span className="contact-picker__who">
                  <strong>{e.name ?? e.email}</strong>
                  <span>{e.name ? e.email : (e.company ?? "")}</span>
                </span>
                <span className="contact-picker__company">{e.name ? (e.company ?? "") : ""}</span>
                {e.suppressed ? (
                  <span className="contact-picker__status is-off">Désinscrit</span>
                ) : added ? (
                  <span className="contact-picker__status is-off">Ajouté</span>
                ) : meta ? (
                  <span className="contact-picker__status" style={{ color: meta.color, background: meta.bg }}>
                    {meta.label}
                  </span>
                ) : (
                  <span />
                )}
              </label>
            </li>
          );
        })}
      </ul>

      <div className="contact-picker__foot">
        <span className="mass-mail__hint">
          {checked.size} sélectionné{checked.size > 1 ? "s" : ""}
        </span>
        <button type="button" className="mass-mail__btn is-primary" disabled={checked.size === 0} onClick={add}>
          Ajouter {checked.size || ""} contact{checked.size > 1 ? "s" : ""}
        </button>
      </div>
    </div>
  );
}
