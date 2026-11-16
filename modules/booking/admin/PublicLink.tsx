"use client";

import { useFormFields } from "@payloadcms/ui";
import { useState } from "react";

import { bookingPath } from "@/modules/booking/lib/constants";

/**
 * L'adresse publique d'un type de rendez-vous, à copier (pour un e-mail, la signature, la vitrine) ou à ouvrir. Elle
 * suit le champ « Adresse publique » pendant la saisie.
 */
export function PublicLink() {
  const slug = useFormFields(([fields]) => fields.slug?.value as string | undefined);
  const [copied, setCopied] = useState(false);
  if (!slug) return null;
  const url = `${typeof window === "undefined" ? "" : window.location.origin}${bookingPath(slug)}`;
  return (
    <div className="bk-link">
      <span className="bk-link__label">Page de réservation</span>
      <code className="bk-link__url">{url}</code>
      <button
        type="button"
        className="bk-link__btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "✓ Copiée" : "Copier"}
      </button>
      <a className="bk-link__btn" href={bookingPath(slug)} target="_blank" rel="noreferrer">
        Ouvrir ↗
      </a>
    </div>
  );
}
