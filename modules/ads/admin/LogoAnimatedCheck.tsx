"use client";

import { useFormFields } from "@payloadcms/ui";
import { useEffect, useState } from "react";

import { logoSummary, parseLogoDocument, type LogoParse } from "@/modules/ads/video/logo";

import { useMediaUrl } from "./BrandKitPreview";

/**
 * Sous le logo animable (Kit de marque › Logos) : ce que le moteur vidéo y
 * trouve — symbole en N éléments, nom en N lettres, signature — et ce qu'il
 * faudrait corriger dans le fichier. Le même découpage que le rendu, dans le
 * navigateur : ce qui est dit ici est ce qui sera animé.
 */
export function LogoAnimatedCheck() {
  const value = useFormFields(([f]) => (f as Record<string, { value?: unknown } | undefined>).logoAnimated?.value);
  const url = useMediaUrl(value);
  const [result, setResult] = useState<LogoParse | null>(null);

  useEffect(() => {
    if (!url) return;
    let live = true;
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((text) => live && setResult(parseLogoDocument(new DOMParser().parseFromString(text, "image/svg+xml"))))
      .catch((e: Error) => live && setResult({ ok: false, error: `Fichier illisible : ${e.message}` }));
    return () => {
      live = false;
    };
  }, [url]);

  if (!url || !result) return null;
  const tone = !result.ok ? "rouge" : result.notes.length ? "orange" : "vert";
  return (
    <div className="ads-logo-check">
      <span className={`tim-status-pill ads-rush-stage ads-rush-stage--${tone}`}>{logoSummary(result)}</span>
      {result.ok && result.notes.length > 0 && (
        <ul className="ads-logo-check__notes">
          {result.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
