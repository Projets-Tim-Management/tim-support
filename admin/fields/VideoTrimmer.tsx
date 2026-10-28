"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useEscape } from "@/core/admin/useEscape";
import {
  keptDuration,
  keptRanges,
  nextKeptTime,
  segmentCount,
  segmentDuration,
  toggleRange,
  type Range,
} from "@/core/lib/video-trim";
import { load, seek } from "@/core/lib/video-loop";

/**
 * Retoucher une capture AVANT de la convertir : on retire, image par image ou
 * par passage, ce qui ne va pas (une hésitation, un mauvais clic, une attente),
 * et l'aperçu rejoue tout de suite la boucle sans ces passages.
 *
 * Rien ne part au serveur : l'éditeur lit la capture dans le navigateur et ne
 * rend que les passages à garder, que le convertisseur recolle bout à bout.
 *
 * Gestes : un clic retire ou remet une image ; Maj + clic applique le même
 * choix à tout le passage depuis l'image cliquée juste avant.
 */

const THUMB_WIDTH = 112;

/** « 2,25 s » : au centième, les tranches font un quart de seconde. */
const fmt = (s: number) => `${(Math.round(s * 100) / 100).toLocaleString("fr-FR")} s`;

export function VideoTrimmer({
  file,
  initialRemoved,
  onCancel,
  onDone,
}: {
  file: File;
  initialRemoved?: ReadonlySet<number>;
  onCancel: () => void;
  /** `keep` : les passages gardés ; `removed` : les tranches retirées (pour rouvrir l'éditeur). */
  onDone: (result: { keep: Range[]; removed: Set<number> }) => void;
}) {
  /**
   * L'adresse locale de la capture, créée DANS l'effet qui la libère.
   *
   * Créée une fois à part (useMemo) puis libérée par un effet, elle cassait en
   * développement : React y joue chaque effet deux fois (monté, démonté,
   * remonté), la première passe libérait l'adresse, la seconde lisait une
   * adresse morte — « Cette vidéo n'est pas lisible », sur une vidéo saine.
   */
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const player = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [removed, setRemoved] = useState<Set<number>>(() => new Set(initialRemoved ?? []));
  const [anchor, setAnchor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const seg = duration ? segmentDuration(duration) : 1;
  const count = duration ? segmentCount(duration) : 0;
  const ranges = useMemo(() => (duration ? keptRanges(duration, removed) : []), [duration, removed]);
  const kept = keptDuration(ranges);

  // Les vignettes, une par tranche, lues sur un second lecteur caché pour ne pas
  // interrompre l'aperçu. Elles arrivent au fur et à mesure.
  useEffect(() => {
    let cancelled = false;
    let v: HTMLVideoElement | null = null;
    (async () => {
      try {
        v = await load(file);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
        return;
      }
      // Refermé pendant le chargement : le nettoyage n'avait encore rien à libérer.
      if (cancelled) return URL.revokeObjectURL(v.src);
      const d = v.duration;
      setDuration(d);
      const n = segmentCount(d);
      const s = segmentDuration(d);
      const canvas = document.createElement("canvas");
      canvas.width = THUMB_WIDTH;
      canvas.height = Math.round((v.videoHeight * THUMB_WIDTH) / v.videoWidth);
      const ctx = canvas.getContext("2d");
      const out: string[] = [];
      for (let i = 0; i < n && !cancelled; i++) {
        await seek(v, Math.min(d - 0.001, i * s + s / 2));
        ctx?.drawImage(v, 0, 0, canvas.width, canvas.height);
        out.push(canvas.toDataURL("image/jpeg", 0.6));
        // Par paquets : la frise se remplit sans redessiner à chaque vignette.
        if (i % 8 === 7 || i === n - 1) setThumbs([...out]);
      }
    })();
    return () => {
      cancelled = true;
      if (!v) return;
      URL.revokeObjectURL(v.src);
      v.removeAttribute("src");
      v.load();
    };
  }, [file]);

  // L'aperçu saute les passages retirés et boucle sur ce qui est gardé.
  useEffect(() => {
    const v = player.current;
    if (!v || !duration) return;
    let raf = 0;
    const tick = () => {
      if (ranges.length) {
        const t = v.currentTime;
        const next = nextKeptTime(ranges, t);
        if (Math.abs(next - t) > 0.02) v.currentTime = next;
        setPlaying(Math.min(count - 1, Math.floor(v.currentTime / seg)));
      }
      raf = requestAnimationFrame(tick);
    };
    const onEnded = () => {
      v.currentTime = ranges[0]?.start ?? 0;
      void v.play();
    };
    v.addEventListener("ended", onEnded);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener("ended", onEnded);
    };
  }, [duration, ranges, count, seg]);

  // Échap ferme la retouche SEULE, pas la fenêtre « Rédiger avec Claude » en dessous.
  useEscape(onCancel, { top: true });

  const click = (i: number, shift: boolean) => {
    if (shift && anchor !== null) {
      // Le passage prend l'état de l'image cliquée juste avant.
      setRemoved((r) => toggleRange(r, anchor, i, r.has(anchor)));
    } else {
      setRemoved((r) => toggleRange(r, i, i, !r.has(i)));
    }
    setAnchor(i);
  };

  return createPortal(
    <div className="vt-overlay">
      <div className="vt" role="dialog" aria-modal="true" aria-label="Retoucher la capture">
        <header className="vt__head">
          <div>
            <p className="vt__eyebrow">Retoucher la capture</p>
            <h2 className="vt__title">{file.name}</h2>
          </div>
          <button type="button" className="ctr-btn ctr-btn--ghost" onClick={onCancel}>
            Annuler
          </button>
        </header>

        <div className="vt__body">
          {error ? (
            <p className="vt__error">{error}</p>
          ) : (
            <>
              <div className="vt__preview">
                {url && <video ref={player} src={url} muted autoPlay playsInline />}
              </div>
              <p className="vt__help">
                Cliquez sur une image pour la retirer (ou la remettre). <strong>Maj + clic</strong> : tout le passage
                depuis l&apos;image précédente. L&apos;aperçu rejoue la boucle sans les passages retirés.
              </p>
              <div className="vt__strip" role="group" aria-label="Images de la capture">
                {Array.from({ length: count }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`vt__thumb${removed.has(i) ? " is-removed" : ""}${playing === i && !removed.has(i) ? " is-playing" : ""}`}
                    title={`${fmt(i * seg)} – ${fmt(Math.min(duration, (i + 1) * seg))}`}
                    onClick={(e) => click(i, e.shiftKey)}
                  >
                    {thumbs[i] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbs[i]} alt="" />
                    ) : (
                      <span className="vt__thumb-wait" />
                    )}
                    <span className="vt__thumb-time">{fmt(i * seg)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <footer className="vt__foot">
          <span className="vt__summary">
            {duration
              ? removed.size
                ? `Gardé : ${fmt(kept)} sur ${fmt(duration)} · ${removed.size} image${removed.size > 1 ? "s" : ""} retirée${removed.size > 1 ? "s" : ""}`
                : `Capture entière : ${fmt(duration)}`
              : "Lecture de la capture…"}
            {removed.size > 0 && (
              <button type="button" className="ctr-link" onClick={() => setRemoved(new Set())}>
                Tout remettre
              </button>
            )}
          </span>
          <button
            type="button"
            className="ctr-btn ctr-btn--primary"
            disabled={!duration || !ranges.length || Boolean(error)}
            onClick={() => onDone({ keep: ranges, removed })}
          >
            Convertir
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
