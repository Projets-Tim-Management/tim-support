"use client";

import { useField } from "@payloadcms/ui";
import { useEffect, useMemo, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Champ « Page concernée » d'un ticket : la même liste que le formulaire public
 * (catégories de features, groupées Web / Mobile et indentées par niveau) plutôt
 * qu'une URL à saisir à la main.
 *
 * La valeur STOCKÉE reste celle du formulaire public — `/features?category=slug`
 * — pour que les tickets des deux origines soient identiques en base et que les
 * liens existants continuent de fonctionner.
 *
 * Une valeur qui ne correspond à aucune catégorie (ticket créé par e-mail, URL
 * libre d'un ancien ticket) est conservée et proposée telle quelle : on ne perd
 * jamais l'information de départ.
 */

interface Category {
  id: number;
  name: string;
  slug: string;
  parent?: number | null;
}
interface Option {
  slug: string;
  label: string;
}

const VALUE_PREFIX = "/features?category=";
const slugOf = (value?: string | null) =>
  typeof value === "string" && value.startsWith(VALUE_PREFIX) ? value.slice(VALUE_PREFIX.length) : "";

export function TicketPageSelect(props: any) {
  const path: string = props?.path ?? props?.field?.name ?? "url";
  const label = props?.field?.label ?? "Page concernée";
  const { value, setValue } = useField<string>({ path });

  const [cats, setCats] = useState<Category[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/feature-categories", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setCats(data as Category[]);
      })
      .catch(() => {
        if (!cancelled) setCats([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Deux groupes (Web / Mobile), chaque catégorie indentée selon sa profondeur.
  const groups = useMemo(() => {
    const data = cats ?? [];
    const childrenOf = new Map<number, Category[]>();
    for (const c of data) {
      if (c.slug === "non-classe") continue;
      const p = c.parent ?? 0;
      if (!childrenOf.has(p)) childrenOf.set(p, []);
      childrenOf.get(p)!.push(c);
    }
    const walk = (parentId: number, depth: number, out: Option[]) => {
      for (const c of (childrenOf.get(parentId) ?? []).sort((a, b) => a.name.localeCompare(b.name, "fr"))) {
        out.push({ slug: c.slug, label: `${"    ".repeat(depth)}${depth > 0 ? "↳ " : ""}${c.name}` });
        walk(c.id, depth + 1, out);
      }
    };
    const roots = data.filter((c) => !c.parent || c.parent === 0);
    const web: Option[] = [];
    const mobile: Option[] = [];
    const webRoot = roots.find((c) => c.slug === "web");
    const mobileRoot = roots.find((c) => c.slug === "mobile");
    if (webRoot) walk(webRoot.id, 0, web);
    if (mobileRoot) walk(mobileRoot.id, 0, mobile);
    return { web, mobile };
  }, [cats]);

  const current = slugOf(value);
  /** Valeur qui n'est pas une catégorie (URL libre d'un ticket e-mail). */
  const freeValue = !current && value ? String(value) : "";

  const selected = freeValue || current;

  return (
    // Même ossature que les autres champs de la barre latérale (statut, priorité…)
    // pour que la colonne de contexte reste homogène.
    <div className="field-type ticket-cfield">
      <label className="ticket-cfield__label" htmlFor={`field-${path}`}>
        {typeof label === "string" ? label : "Page concernée"}
      </label>

      <div className={`ticket-page${selected ? "" : " ticket-page--empty"}`}>
        <svg
          className="ticket-page__icon"
          viewBox="0 0 16 16"
          width="13"
          height="13"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9.5 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5l-3.5-3.5Z" />
          <path d="M9.5 1.5V5H13M5.5 8.5h5M5.5 11h3.5" />
        </svg>
        <select
          id={`field-${path}`}
          className="ticket-page__native"
          value={selected}
          onChange={(e) => {
            const next = e.target.value;
            if (!next) return setValue(null);
            // Réutiliser la valeur libre telle quelle : la préfixer la corromprait.
            setValue(next === freeValue ? next : `${VALUE_PREFIX}${next}`);
          }}
        >
          <option value="">{cats === null ? "Chargement…" : "Non précisée"}</option>
          {/* Valeur libre héritée (e-mail entrant, ancien ticket) : conservée. */}
          {freeValue && <option value={freeValue}>{freeValue}</option>}
          {groups.web.length > 0 && (
            <optgroup label="Web">
              {groups.web.map((o) => (
                <option key={`web-${o.slug}`} value={o.slug}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          )}
          {groups.mobile.length > 0 && (
            <optgroup label="Mobile">
              {groups.mobile.map((o) => (
                <option key={`mobile-${o.slug}`} value={o.slug}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <span className="ticket-page__caret" aria-hidden="true">
          ▾
        </span>
      </div>

      {/* Raccourci vers la page en question : le support la consulte souvent
          avant de répondre. */}
      {value && (
        <a className="ticket-page__link" href={String(value)} target="_blank" rel="noreferrer">
          Ouvrir la page ↗
        </a>
      )}
    </div>
  );
}
