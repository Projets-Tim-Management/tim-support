"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * Le visuel d'une partie de fiche : image, GIF ou capture vidéo en boucle.
 *
 * Une capture de l'APP MOBILE (portrait) se présente dans un téléphone — bord
 * noir fin et arrondi, écran aux coins arrondis : on reconnaît d'un
 * coup d'œil qu'il s'agit de l'application, et la capture n'est plus un long
 * rectangle étiré au milieu de la page. Une capture d'ordinateur garde son cadre
 * habituel.
 *
 * Le portrait se devine d'abord sans attendre (dimensions connues, ou nom
 * « …-mobile-… » donné à la conversion), puis se vérifie au chargement : une
 * vidéo n'a pas de dimensions en base.
 */
export default function DocMedia({
  src,
  alt,
  width,
  height,
}: {
  src: string;
  alt: string;
  /** Dimensions connues en base ; 0 si inconnues (vidéos). */
  width: number;
  height: number;
}) {
  const isVideo = /\.(mp4|webm)(\?|$)/i.test(src);
  const isGif = /\.gif(\?|$)/i.test(src);
  const guess = width > 0 && height > 0 ? height > width * 1.2 : /-mobile-/i.test(src);
  const [portrait, setPortrait] = useState(guess);
  const measure = (w: number, h: number) => w > 0 && h > 0 && setPortrait(h > w * 1.2);

  const mediaClass = portrait
    ? "block w-full h-auto"
    : "w-auto h-auto max-w-full max-h-[510px] object-contain rounded-md border-1 border-black";

  const media = isVideo ? (
    <video
      src={src}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      aria-label={alt || undefined}
      onLoadedMetadata={(e) => measure(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
      className={mediaClass}
    />
  ) : (
    <Image
      src={src}
      alt={alt}
      width={width || 800}
      height={height || 450}
      // Les GIF sont servis bruts : next/image casserait l'animation.
      unoptimized={isGif}
      onLoad={(e) => measure(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
      className={mediaClass}
    />
  );

  // Une seule arborescence, que l'on habille ou non en téléphone : basculer en
  // portrait après lecture des dimensions ne démonte pas la vidéo (sinon elle
  // serait retéléchargée).
  return (
    <div
      className={`rounded-lg border border-border bg-surface flex items-center justify-center ${portrait ? "px-3 py-6" : "p-3"}`}
    >
      {/* Le téléphone : un boîtier fin à liseré, boutons discrets sur la tranche,
          et l'écran seul — sans encoche ni caméra, qui masqueraient la capture. */}
      <div className={portrait ? "relative w-[230px] rounded-[40px] bg-ink p-[5px] shadow-xl ring-1 ring-ink-line" : "contents"}>
        {portrait && <span aria-hidden className="absolute -left-[2px] top-[88px] h-[22px] w-[2px] rounded-l bg-ink-line" />}
        {portrait && <span aria-hidden className="absolute -left-[2px] top-[124px] h-[40px] w-[2px] rounded-l bg-ink-line" />}
        {portrait && <span aria-hidden className="absolute -left-[2px] top-[172px] h-[40px] w-[2px] rounded-l bg-ink-line" />}
        {portrait && <span aria-hidden className="absolute -right-[2px] top-[136px] h-[60px] w-[2px] rounded-r bg-ink-line" />}
        <div className={portrait ? "relative overflow-hidden rounded-[35px] bg-white ring-1 ring-ink-soft" : "contents"}>
          {media}
        </div>
      </div>
    </div>
  );
}
