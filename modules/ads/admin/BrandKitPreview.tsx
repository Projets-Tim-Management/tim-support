"use client";

import { useFormFields } from "@payloadcms/ui";
import Link from "next/link";
import { useEffect, useState } from "react";

import { fontFamily, paletteChecks, paletteOf, type Palette } from "@/modules/ads/lib/style";

/**
 * Les aperçus du Kit de marque : chaque choix se voit au moment où on le fait
 * — un logo sur le fond où il sera posé, un couple de couleurs avec son
 * contraste, une accroche dans les polices choisies. Rien n'est enregistré ici.
 */

type Field = { value?: unknown };
type Fields = Record<string, Field | undefined>;

/** La palette telle qu'elle est dans le formulaire, avant même d'enregistrer. */
function usePalette(): Palette {
  const raw = useFormFields(([f]) => {
    const g = (k: string) => (f as Fields)[`palette.${k}`]?.value;
    return { primary: g("primary"), accent: g("accent"), darkBg: g("darkBg"), lightBg: g("lightBg"), textOnDark: g("textOnDark"), textOnLight: g("textOnLight") };
  });
  return paletteOf({ palette: raw });
}

/** L'adresse d'un média publicitaire choisi (un identifiant dans le formulaire). */
function useMediaUrl(value: unknown): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const id = value && typeof value === "object" ? (value as { id?: unknown }).id : value;
  const direct = value && typeof value === "object" ? ((value as { url?: string }).url ?? null) : null;
  useEffect(() => {
    if (direct || id == null || id === "") return;
    let live = true;
    fetch(`/payload-api/ad-media/${encodeURIComponent(String(id))}?depth=0`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { url?: string } | null) => live && setUrl(d?.url ?? null))
      .catch(() => null);
    return () => {
      live = false;
    };
  }, [id, direct]);
  return direct ?? (id == null || id === "" ? null : url);
}

function LogoTile({ label, url, bg, fg }: { label: string; url: string | null; bg: string; fg: string }) {
  return (
    <figure className="ads-kit-logo" style={{ background: bg, color: fg }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- logo déposé par TIM, servi par le stockage. */}
      {url ? <img src={url} alt={label} /> : <span className="ads-kit-logo__empty">Pas encore de logo</span>}
      <figcaption>{label}</figcaption>
    </figure>
  );
}

/** Onglet Logos : chaque variante sur le fond où elle sera posée. */
export function LogoPreview() {
  const p = usePalette();
  const values = useFormFields(([f]) => ({ light: (f as Fields).logoOnLight?.value, dark: (f as Fields).logoOnDark?.value, symbol: (f as Fields).logoSymbol?.value }));
  const light = useMediaUrl(values.light);
  const dark = useMediaUrl(values.dark);
  const symbol = useMediaUrl(values.symbol);
  return (
    <div className="ads-kit-preview">
      <p className="ads-kit-preview__title">Aperçu sur les fonds de la palette</p>
      <div className="ads-kit-logos">
        <LogoTile label="Couleur, sur fond clair" url={light} bg={p.lightBg} fg={p.textOnLight} />
        <LogoTile label="Blanc, sur fond sombre" url={dark} bg={p.darkBg} fg={p.textOnDark} />
        <LogoTile label="Symbole, sur l'accent" url={symbol} bg={p.accent} fg={p.textOnDark} />
      </div>
    </div>
  );
}

const VERDICT = { ok: "Lisible", titres: "Titres seulement", illisible: "Illisible" } as const;

/** Onglet Couleurs : chaque couple qui se retrouvera l'un sur l'autre, avec son contraste. */
export function PaletteCheck() {
  const checks = paletteChecks(usePalette());
  return (
    <div className="ads-kit-preview">
      <p className="ads-kit-preview__title">Lisibilité des couples de couleurs</p>
      <ul className="ads-kit-contrast">
        {checks.map((c) => (
          <li key={c.label}>
            <span className="ads-kit-contrast__sample" style={{ background: c.bg, color: c.fg }}>
              Aa
            </span>
            <span className="ads-kit-contrast__label">{c.label}</span>
            <span className={`tim-status-pill ads-kit-contrast__verdict ads-kit-contrast__verdict--${c.verdict}`} title="Rapport de contraste WCAG : 4,5 pour du texte courant, 3 pour un grand titre.">
              {VERDICT[c.verdict]} · {c.ratio.toLocaleString("fr-FR")}:1
            </span>
          </li>
        ))}
      </ul>
      <p className="ads-kit-preview__hint">« Titres seulement » : assez contrasté pour un grand titre, pas pour une mention ou un sous-titre.</p>
    </div>
  );
}

/** Onglet Formes et mouvement : le chemin vers les styles, qui portent désormais ces réglages. */
export function StylesLink() {
  return (
    <p className="ads-kit-preview__hint">
      <Link href="/admin/collections/ad-styles">Ouvrir les styles →</Link> A · Le geste en gros plan, B · Le chantier d&apos;abord, C · Clair et posé, et ceux que vous ajouterez.
    </p>
  );
}

/** Onglet Typographie : une accroche dans les polices choisies, sur le fond sombre de la palette. */
export function FontPreview() {
  const p = usePalette();
  const v = useFormFields(([f]) => ({ title: (f as Fields).titleFont?.value, body: (f as Fields).bodyFont?.value, upper: (f as Fields).titleCase?.value === "majuscules" }));
  const title = fontFamily(v.title);
  const body = fontFamily(v.body);
  // Les polices de la liste viennent de Google Fonts : chargées pour l'aperçu seulement.
  useEffect(() => {
    const id = "ads-kit-fonts";
    const href = `https://fonts.googleapis.com/css2?${[title, body].map((f) => `family=${encodeURIComponent(f)}:wght@400;700;800`).join("&")}&display=swap`;
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = Object.assign(document.createElement("link"), { id, rel: "stylesheet" });
      document.head.appendChild(link);
    }
    link.href = href;
  }, [title, body]);
  return (
    <div className="ads-kit-preview">
      <p className="ads-kit-preview__title">Aperçu</p>
      <div className="ads-kit-font" style={{ background: p.darkBg, color: p.textOnDark }}>
        <strong style={{ fontFamily: `'${title}', sans-serif`, textTransform: v.upper ? "uppercase" : "none" }}>Fini la ressaisie du vendredi.</strong>
        <span style={{ fontFamily: `'${body}', sans-serif` }}>Vos équipes pointent sur leur téléphone, les heures arrivent au bureau. Essai gratuit 30 jours.</span>
        <em style={{ background: p.accent, color: p.textOnDark, fontFamily: `'${body}', sans-serif` }}>En savoir plus</em>
      </div>
    </div>
  );
}
