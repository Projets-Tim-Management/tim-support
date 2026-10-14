"use client";

import { useField, useFormFields } from "@payloadcms/ui";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { coverRect, FORMATS, validateFraming, type Framing, type Rect } from "@/modules/ads/lib/framing";
import { isAppSource } from "@/modules/ads/lib/rushes";

/**
 * Le recadrage d'un rush (plan Publicité, §9 sexies, D1d) : on trace, sur une
 * image du rush, la ZONE UTILE (ce qu'un montage peut montrer) et la ZONE À NE
 * JAMAIS COUPER. En dessous, l'aperçu de chaque format, calculé par les mêmes
 * fonctions que le moteur vidéo : ce qu'on voit ici est ce qui sera rendu.
 *
 * Le recadrage s'enregistre avec la fiche (bouton Enregistrer de Payload).
 */

type Keyframe = { atSec: number; url: string };
type Mode = "crop" | "protect";
type Meta = { width?: number; height?: number } | null | undefined;

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

/** Un aperçu de format : la portion choisie de l'image, à la proportion du format. */
function FormatPreview({ src, srcAspect, aspect, label, rect, fits, crop }: { src: string; srcAspect: number; aspect: number; label: string; rect: Rect; fits: boolean; crop: Rect }) {
  // Si la zone protégée ne tient pas plein cadre, le moteur montre la zone utile entière sur un fond,
  // à sa vraie proportion (84 % du format au plus), sans la déformer.
  const r = fits ? rect : crop;
  const cropAspect = (crop.w * srcAspect) / crop.h;
  const fit = cropAspect > aspect ? { w: 0.84, h: (0.84 * aspect) / cropAspect } : { w: (0.84 * cropAspect) / aspect, h: 0.84 };
  return (
    <figure className="ads-frame-preview">
      <div className={`ads-frame-preview__box${fits ? "" : " ads-frame-preview__box--fit"}`} style={{ aspectRatio: String(aspect) }}>
        <div className="ads-frame-preview__view" style={fits ? { inset: 0 } : { width: pct(fit.w), height: pct(fit.h), left: pct((1 - fit.w) / 2), top: pct((1 - fit.h) / 2) }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- image clé du stockage. */}
          <img src={src} alt="" style={{ width: pct(1 / r.w), height: pct(1 / r.h), left: pct(-r.x / r.w), top: pct(-r.y / r.h) }} />
        </div>
      </div>
      <figcaption>
        {label}
        {!fits && <em> — montré en entier sur fond (la zone protégée ne tient pas plein cadre)</em>}
      </figcaption>
    </figure>
  );
}

export function RushFramingField() {
  const framing = useField<Framing | null>({ path: "framing" });
  const ready = useFormFields(([f]) => f?.["processing.status"]?.value === "pret");
  const keyframes = useFormFields(([f]) => (f?.["working.keyframes"]?.value as Keyframe[] | undefined) ?? []);
  const poster = useFormFields(([f]) => f?.["working.posterUrl"]?.value as string | undefined);
  const meta = useFormFields(([f]) => f?.["working.meta"]?.value as Meta);
  const source = useFormFields(([f]) => f?.source?.value as string | undefined);

  const [mode, setMode] = useState<Mode>("crop");
  const [bg, setBg] = useState<string | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const area = useRef<HTMLDivElement>(null);

  if (!ready || !meta?.width || !meta?.height) return null;
  const src = bg ?? keyframes[0]?.url ?? poster;
  if (!src) return null;
  const srcAspect = meta.width / meta.height;
  const current: Framing = { crop: framing.value?.crop ?? null, protect: framing.value?.protect ?? null };
  const check = validateFraming(current);

  const pointAt = (e: ReactPointerEvent) => {
    const b = area.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) };
  };
  const rectOf = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

  const onDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = pointAt(e);
    setDraft({ ...start.current, w: 0, h: 0 });
  };
  const onMove = (e: ReactPointerEvent) => {
    if (start.current) setDraft(rectOf(start.current, pointAt(e)));
  };
  const onUp = (e: ReactPointerEvent) => {
    if (!start.current) return;
    const r = rectOf(start.current, pointAt(e));
    start.current = null;
    setDraft(null);
    // Un simple clic n'efface rien : il faut tracer.
    if (r.w < 0.02 || r.h < 0.02) return;
    framing.setValue({ ...current, [mode]: r });
  };

  const box = (r: Rect | null, kind: Mode | "draft") =>
    r ? <span className={`ads-frame__rect ads-frame__rect--${kind}`} style={{ left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h) }} /> : null;

  const crop = current.crop ?? { x: 0, y: 0, w: 1, h: 1 };

  return (
    <section className="ads-frame">
      <header className="ads-frame__head">
        <strong>Recadrage</strong>
        <span>Tracez sur l&apos;image, puis enregistrez la fiche. Sans recadrage, l&apos;image entière est utilisable et rien n&apos;est protégé.</span>
      </header>
      <div className="ads-frame__modes" role="radiogroup" aria-label="Zone à tracer">
        <button type="button" role="radio" aria-checked={mode === "crop"} className={`tim-btn${mode === "crop" ? " tim-btn--primary" : ""}`} onClick={() => setMode("crop")}>
          Zone utile
        </button>
        <button type="button" role="radio" aria-checked={mode === "protect"} className={`tim-btn${mode === "protect" ? " tim-btn--primary" : ""}`} onClick={() => setMode("protect")}>
          Zone à ne jamais couper
        </button>
        <button type="button" className="tim-btn" disabled={!current.crop && !current.protect} onClick={() => framing.setValue({ crop: null, protect: null })}>
          Tout effacer
        </button>
      </div>
      <div className="ads-frame__work">
        <div className="ads-frame__canvas" style={{ aspectRatio: String(srcAspect) }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- image clé du stockage. */}
          <img src={src} alt="Image du rush à recadrer" draggable={false} />
          <div ref={area} className="ads-frame__area" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => (start.current = null)} aria-label="Tracer une zone">
            {current.crop && <span className="ads-frame__shade" style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${pct(crop.x)} ${pct(crop.y)}, ${pct(crop.x)} ${pct(crop.y + crop.h)}, ${pct(crop.x + crop.w)} ${pct(crop.y + crop.h)}, ${pct(crop.x + crop.w)} ${pct(crop.y)}, ${pct(crop.x)} ${pct(crop.y)})` }} />}
            {box(current.crop, "crop")}
            {box(current.protect, "protect")}
            {box(draft, "draft")}
          </div>
        </div>
        <div className="ads-frame__side">
          <ul className="ads-frame__legend">
            <li>
              <span className="ads-frame__swatch ads-frame__swatch--crop" /> Zone utile : {current.crop ? "tracée" : "l'image entière"}
            </li>
            <li>
              <span className="ads-frame__swatch ads-frame__swatch--protect" /> À ne jamais couper : {current.protect ? "tracée" : "rien"}
            </li>
          </ul>
          {!check.ok && <p className="ads-frame__error">{check.error}</p>}
          {keyframes.length > 1 && (
            <div className="ads-frame__thumbs" aria-label="Image de référence">
              {keyframes.map((k) => (
                <button key={k.url} type="button" className={`ads-frame__thumb${src === k.url ? " ads-frame__thumb--on" : ""}`} onClick={() => setBg(k.url)} title={`Image à ${k.atSec} s`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- image clé du stockage. */}
                  <img src={k.url} alt={`${k.atSec} s`} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="ads-frame__previews">
        <p className="ads-frame__title">Ce que montrera chaque format, plein cadre</p>
        <div className="ads-frame__grid">
          {FORMATS.map((f) => {
            const c = coverRect(srcAspect, current, f.aspect);
            return <FormatPreview key={f.key} src={src} srcAspect={srcAspect} aspect={f.aspect} label={f.label} rect={c.rect} fits={c.fits} crop={crop} />;
          })}
        </div>
        {isAppSource(source) && <p className="ads-frame__hint">Écran de l&apos;app : dans les styles « téléphone », la zone utile est montrée en entier dans le téléphone, sans rien rogner.</p>}
      </div>
    </section>
  );
}
