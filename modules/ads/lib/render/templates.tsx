/* eslint-disable @next/next/no-img-element -- rendu par Satori en image, pas une page web : next/image n'a pas de sens ici. */
import type { ReactElement } from "react";

import type { BrandColors } from "@/core/lib/brand";
import { fit, hookFontSize, safeBox, type Format } from "@/modules/ads/lib/render/formats";

/**
 * Les gabarits de visuels — des composants React rendus par Satori (JSX + un
 * sous-ensemble de CSS en flexbox), puis rastérisés par sharp.
 *
 * Écrits dans ce sous-ensemble à dessein : ils se réutiliseront tels quels comme
 * images dans le motion (Remotion rend le CSS complet dans Chromium). Une seule
 * source par gabarit.
 *
 * Tout ce qui compte est placé DANS la zone sûre du format (formats.ts) : le
 * conteneur a pour marges intérieures exactement les marges de la zone sûre.
 * Les images arrivent en data URI : le rendu ne va rien chercher sur le réseau.
 */

export type TemplateKey = "capture" | "chiffre" | "photo" | "texte";

export const TEMPLATES: { key: TemplateKey; label: string; needs: "capture" | "fact" | "photo" | null }[] = [
  { key: "capture", label: "Capture de l'app", needs: "capture" },
  { key: "chiffre", label: "Un fait chiffré", needs: "fact" },
  { key: "photo", label: "Photo de chantier", needs: "photo" },
  { key: "texte", label: "Accroche seule", needs: null },
];

export type VisualInput = {
  hook: string;
  cta: string;
  colors: BrandColors;
  /** Logo pour fond clair (Apparence) et pour fond sombre (kit), en data URI. */
  logo?: string | null;
  logoOnDark?: string | null;
  /** Capture ou photo, en data URI, avec ses dimensions (pour cadrer au plus juste). */
  image?: string | null;
  imageSize?: { width: number; height: number } | null;
  fact?: { statement: string; source: string } | null;
};

const frame = (f: Format, background: string, children: ReactElement[] | ReactElement, extra: Record<string, unknown> = {}) => (
  <div
    style={{
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      paddingTop: f.safe.top,
      paddingBottom: f.safe.bottom,
      paddingLeft: f.safe.left,
      paddingRight: f.safe.right,
      background,
      fontFamily: "Titre",
      ...extra,
    }}
  >
    {children}
  </div>
);

const Logo = ({ src, height }: { src?: string | null; height: number }) =>
  src ? <img src={src} alt="" height={height} style={{ height, objectFit: "contain", alignSelf: "flex-start" }} /> : <div style={{ display: "flex", height }} />;

const Cta = ({ label, colors, f }: { label: string; colors: BrandColors; f: Format }) => (
  <div
    style={{
      display: "flex",
      alignSelf: "flex-start",
      padding: `${Math.round(f.hookSize * 0.35)}px ${Math.round(f.hookSize * 0.7)}px`,
      borderRadius: 999,
      background: colors.red,
      color: "#ffffff",
      fontSize: Math.round(f.hookSize * 0.55),
      fontFamily: "Texte",
      fontWeight: 700,
    }}
  >
    {label}
  </div>
);

const Hook = ({ text, color, f, scale = 1 }: { text: string; color: string; f: Format; scale?: number }) => (
  <div style={{ display: "flex", color, fontSize: Math.round(hookFontSize(f, text) * scale), fontWeight: 700, lineHeight: 1.12, maxWidth: safeBox(f).width }}>{text}</div>
);

export function renderTemplate(key: TemplateKey, f: Format, v: VisualInput): ReactElement {
  const box = safeBox(f);
  const logoH = Math.round(f.hookSize * 0.9);

  if (key === "capture") {
    const shot = (maxH: number) =>
      v.image && v.imageSize ? (
        <img
          src={v.image}
          alt=""
          width={fit(v.imageSize, { width: box.width, height: maxH }).width}
          height={fit(v.imageSize, { width: box.width, height: maxH }).height}
          style={{ borderRadius: 28, border: "6px solid #ffffff", alignSelf: "center" }}
        />
      ) : (
        <div style={{ display: "flex" }} />
      );

    // 9:16 : logo, accroche et bouton dans la zone sûre, en haut ; la capture,
    // décorative, descend dans la zone du bas — que l'interface peut couvrir.
    if (f.key === "9x16") {
      return frame(
        f,
        v.colors.primary,
        [
          <div key="top" style={{ display: "flex", flexDirection: "column", gap: 40 }}>
            <Logo src={v.logoOnDark ?? v.logo} height={logoH} />
            <Hook text={v.hook} color="#ffffff" f={f} />
            <Cta label={v.cta} colors={v.colors} f={f} />
          </div>,
          <div key="img" style={{ display: "flex", justifyContent: "center" }}>
            {shot(Math.round(f.height * 0.5))}
          </div>,
        ],
        { paddingBottom: 0, justifyContent: "space-between" },
      );
    }
    return frame(f, v.colors.primary, [
      <Logo key="l" src={v.logoOnDark ?? v.logo} height={logoH} />,
      <Hook key="h" text={v.hook} color="#ffffff" f={f} />,
      <div key="i" style={{ display: "flex", justifyContent: "center", flexGrow: 1, alignItems: "center", paddingTop: 28, paddingBottom: 28 }}>
        {shot(Math.round(box.height * (f.key === "1x1" ? 0.42 : 0.5)))}
      </div>,
      <Cta key="c" label={v.cta} colors={v.colors} f={f} />,
    ]);
  }

  if (key === "chiffre") {
    return frame(f, v.colors.secondary, [
      <Logo key="l" src={v.logo} height={logoH} />,
      <div key="t" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <Hook text={v.fact?.statement ?? v.hook} color={v.colors.primary} f={f} scale={1.1} />
        {v.fact ? (
          <div style={{ display: "flex", color: v.colors.primary, opacity: 0.7, fontSize: Math.round(f.hookSize * 0.36), fontFamily: "Texte" }}>{`Source : ${v.fact.source}`}</div>
        ) : (
          <div style={{ display: "flex" }} />
        )}
      </div>,
      <Cta key="c" label={v.cta} colors={v.colors} f={f} />,
    ]);
  }

  if (key === "photo") {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: v.colors.primary }}>
        {v.image ? <img src={v.image} alt="" style={{ position: "absolute", top: 0, left: 0, width: f.width, height: f.height, objectFit: "cover" }} /> : <div style={{ display: "flex" }} />}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: f.width,
            height: f.height,
            display: "flex",
            backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0.7) 100%)`,
          }}
        />
        {frame(f, "transparent", [
          <Logo key="l" src={v.logoOnDark ?? v.logo} height={logoH} />,
          <div key="b" style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            <Hook text={v.hook} color="#ffffff" f={f} />
            <Cta label={v.cta} colors={v.colors} f={f} />
          </div>,
        ], { position: "absolute", top: 0, left: 0, width: f.width, height: f.height })}
      </div>
    );
  }

  return frame(f, v.colors.primary, [
    <Logo key="l" src={v.logoOnDark ?? v.logo} height={logoH} />,
    <Hook key="h" text={v.hook} color="#ffffff" f={f} scale={1.2} />,
    <Cta key="c" label={v.cta} colors={v.colors} f={f} />,
  ]);
}
